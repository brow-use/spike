import Anthropic from '@anthropic-ai/sdk'
import type { ModelProvider, Message, ToolDefinition, ModelResponse, ContentBlock } from './model.js'

export class ClaudeProvider implements ModelProvider {
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey })
    this.model = model
  }

  async complete(messages: Message[], tools: ToolDefinition[]): Promise<ModelResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
      messages: messages.map(m => ({
        role: m.role,
        content: m.content as Anthropic.MessageParam['content'],
      })),
    })

    const content: ContentBlock[] = response.content.map(block => {
      if (block.type === 'text') return { type: 'text' as const, text: block.text }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use' as const,
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        }
      }
      throw new Error(`Unexpected block type: ${(block as { type: string }).type}`)
    })

    return {
      stopReason: response.stop_reason as ModelResponse['stopReason'],
      content,
    }
  }
}
