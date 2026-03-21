import OpenAI from 'openai'
import type { ModelProvider, Message, ToolDefinition, ModelResponse, ContentBlock } from './model.js'

export class OpenAIProvider implements ModelProvider {
  private client: OpenAI
  private model: string

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey })
    this.model = model
  }

  async complete(messages: Message[], tools: ToolDefinition[]): Promise<ModelResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 8192,
      tools: tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      })),
      messages: messages.map(m => this.toOpenAIMessage(m)),
    })

    const choice = response.choices[0]
    const msg = choice.message
    const content: ContentBlock[] = []

    if (msg.content) {
      content.push({ type: 'text', text: msg.content })
    }

    for (const call of msg.tool_calls ?? []) {
      content.push({
        type: 'tool_use',
        id: call.id,
        name: call.function.name,
        input: JSON.parse(call.function.arguments) as Record<string, unknown>,
      })
    }

    const stopReason: ModelResponse['stopReason'] =
      choice.finish_reason === 'tool_calls' ? 'tool_use'
      : choice.finish_reason === 'length' ? 'max_tokens'
      : 'end_turn'

    return { stopReason, content }
  }

  private toOpenAIMessage(msg: Message): OpenAI.Chat.ChatCompletionMessageParam {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        return { role: 'user', content: msg.content }
      }
      const parts: OpenAI.Chat.ChatCompletionContentPart[] = []
      const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = []

      for (const block of msg.content) {
        if (block.type === 'text') {
          parts.push({ type: 'text', text: block.text })
        } else if (block.type === 'image') {
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
          })
        } else if (block.type === 'tool_result') {
          const resultContent = typeof block.content === 'string'
            ? block.content
            : block.content.map(b => b.type === 'text' ? b.text : '[image]').join('\n')
          toolResults.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: resultContent,
          })
        }
      }

      if (toolResults.length > 0) return toolResults[0]
      return { role: 'user', content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts }
    }

    if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        return { role: 'assistant', content: msg.content }
      }
      const toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = []
      let text = ''
      for (const block of msg.content) {
        if (block.type === 'text') text += block.text
        if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: { name: block.name, arguments: JSON.stringify(block.input) },
          })
        }
      }
      return {
        role: 'assistant',
        content: text || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      }
    }

    throw new Error(`Unsupported role: ${msg.role}`)
  }
}
