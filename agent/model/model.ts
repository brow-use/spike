export type Role = 'user' | 'assistant'

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ImageBlock {
  type: 'image'
  source: {
    type: 'base64'
    media_type: 'image/png' | 'image/jpeg' | 'image/webp'
    data: string
  }
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string | ContentBlock[]
}

export type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock

export interface Message {
  role: Role
  content: string | ContentBlock[]
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface ModelResponse {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
  content: ContentBlock[]
}

export interface ModelProvider {
  complete(messages: Message[], tools: ToolDefinition[]): Promise<ModelResponse>
}
