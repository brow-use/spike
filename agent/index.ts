import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { Session } from './session.js'
import { ClaudeProvider } from './model/claude.js'
import { OpenAIProvider } from './model/openai.js'
import type { ModelProvider, Message, ContentBlock, ToolResultBlock } from './model/model.js'
import type { Tool, ToolContext } from './tool/tool.js'
import { navigate } from './tool/navigate.js'
import { click } from './tool/click.js'
import { type as typeTool } from './tool/type.js'
import { snapshot } from './tool/snapshot.js'
import { getAccessibilityTree } from './tool/get-accessibility-tree.js'
import { startTrace } from './tool/start-trace.js'
import { stopTrace } from './tool/stop-trace.js'
import { writePageObject } from './tool/write-page-object.js'
import { writeWorkflow } from './tool/write-workflow.js'
import { writeTest } from './tool/write-test.js'
import { sendToExtension } from './tool/send-to-extension.js'
import type { BrowserBridge } from '../server/browser-bridge.js'
import type { App } from '../domain/app.js'

const OUTPUT_DIR = path.resolve(process.cwd(), 'output')

function ensureOutputDirs(): void {
  for (const dir of ['page', 'workflow', 'test', 'trace']) {
    fs.mkdirSync(path.join(OUTPUT_DIR, dir), { recursive: true })
  }
}

function buildSystemPrompt(app: App | null): string {
  const appInfo = app
    ? `Application: ${app.name}\nURL: ${app.url}\nDescription: ${app.description}`
    : 'No application selected. Ask the user to create and select an app using /create-app and /list-app.'
  return `You are a browser automation agent helping users automate tasks in a web application.

${appInfo}

You have tools to navigate, interact with, and record workflows in the browser.

Guidelines:
- When recording a workflow, always call start_trace first, then perform actions, then stop_trace.
- Use get_accessibility_tree to understand page structure before clicking or typing.
- Use snapshot to visually verify the current page state.
- When generating TypeScript page objects, workflows, or tests, produce complete, working TypeScript code.
- Page objects should use Playwright's Page type and expose typed methods for each action.
- Workflows should import and use page objects.
- Tests should import workflows and use @playwright/test.`
}

function createModelProvider(): ModelProvider {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  if (!anthropicKey && !openaiKey) {
    throw new Error('At least one of ANTHROPIC_API_KEY or OPENAI_API_KEY must be set')
  }

  const provider = process.env.MODEL_PROVIDER ?? (anthropicKey ? 'claude' : 'openai')
  const modelName = process.env.MODEL_NAME ?? (provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-6')

  if (provider === 'openai') {
    if (!openaiKey) throw new Error('MODEL_PROVIDER is set to openai but OPENAI_API_KEY is not set')
    return new OpenAIProvider(openaiKey, modelName)
  }

  if (!anthropicKey) throw new Error('MODEL_PROVIDER is set to claude but ANTHROPIC_API_KEY is not set')
  return new ClaudeProvider(anthropicKey, modelName)
}

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; input: unknown }
  | { type: 'tool_error'; message: string }

export class Agent {
  private model: ModelProvider
  private session: Session
  private tools: Tool[]
  private browser: Browser | null = null
  private browserContext: BrowserContext | null = null
  private page: Page | null = null
  private bridge: BrowserBridge | null = null
  private systemPrompt: string

  constructor(bridge?: BrowserBridge, app?: App | null) {
    ensureOutputDirs()
    this.model = createModelProvider()
    this.session = new Session()
    this.bridge = bridge ?? null
    this.tools = [
      navigate, click, typeTool, snapshot, getAccessibilityTree,
      startTrace, stopTrace, writePageObject, writeWorkflow, writeTest,
      sendToExtension,
    ]
    this.systemPrompt = buildSystemPrompt(app ?? null)
  }

  updateApp(app: App | null): void {
    this.systemPrompt = buildSystemPrompt(app)
    this.session.reset()
  }

  async init(): Promise<void> {
    this.browser = await chromium.launch({ headless: false })
    this.browserContext = await this.browser.newContext()
    this.page = await this.browserContext.newPage()
  }

  async close(): Promise<void> {
    await this.browserContext?.close()
    await this.browser?.close()
  }

  sessionId(): string {
    return this.session.currentId()
  }

  resetSession(): void {
    this.session.reset()
  }

  isExtensionConnected(): boolean {
    return this.bridge?.isExtensionConnected() ?? false
  }

  async run(userMessage: string, onEvent?: (event: AgentEvent) => void): Promise<void> {
    const ctx: ToolContext = {
      page: this.page!,
      context: this.browserContext!,
      bridge: this.bridge!,
      outputDir: OUTPUT_DIR,
    }

    const userMsg: Message = { role: 'user', content: userMessage }
    const history = this.session.load()

    const messages: Message[] = history.length === 0
      ? [{ role: 'user', content: this.systemPrompt }, { role: 'assistant', content: 'Understood. I am ready to help automate your web application.' }, userMsg]
      : [...history, userMsg]

    const toolDefs = this.tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))

    let currentMessages = messages

    while (true) {
      const response = await this.model.complete(currentMessages, toolDefs)

      const assistantMsg: Message = { role: 'assistant', content: response.content }
      currentMessages = [...currentMessages, assistantMsg]

      for (const block of response.content) {
        if (block.type === 'text' && block.text) {
          if (onEvent) onEvent({ type: 'text', text: block.text })
          else process.stdout.write('\n' + block.text + '\n')
        }
      }

      if (response.stopReason !== 'tool_use') break

      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')
      const toolResults: ToolResultBlock[] = []

      for (const block of toolUseBlocks) {
        if (block.type !== 'tool_use') continue

        const tool = this.tools.find(t => t.name === block.name)
        if (!tool) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Unknown tool: ${block.name}`,
          })
          continue
        }

        if (onEvent) onEvent({ type: 'tool', name: block.name, input: block.input })
        else process.stdout.write(`[tool] ${block.name}(${JSON.stringify(block.input)})\n`)

        let result: string | ContentBlock[]
        try {
          result = await tool.execute(block.input, ctx)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (onEvent) onEvent({ type: 'tool_error', message: msg })
          else process.stdout.write(`[tool error] ${msg}\n`)
          result = `Error: ${msg}`
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        })
      }

      const toolResultMsg: Message = { role: 'user', content: toolResults }
      currentMessages = [...currentMessages, toolResultMsg]
    }

    const newMessages = currentMessages.slice(messages.length)
    this.session.append([userMsg, ...newMessages.slice(1)])
  }
}
