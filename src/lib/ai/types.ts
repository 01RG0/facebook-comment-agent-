export interface AiTokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface AiReply {
  text: string
  tokens?: AiTokenUsage
  latencyMs?: number
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface AiProvider {
  generateReply(comment: string, instructions: string, language: string, history?: ConversationMessage[]): Promise<AiReply>
  readonly providerName: string
  readonly modelName: string
}

export type AiProviderName = 'gemini' | 'mistral' | 'openai' | 'openai-compat'

export interface AiConfig {
  provider: AiProviderName | string
  model?: string
  apiKey?: string
  baseUrl?: string
}
