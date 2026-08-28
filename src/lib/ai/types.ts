export interface AiProvider {
  generateReply(comment: string, instructions: string, language: string): Promise<string>
  readonly providerName: string
  readonly modelName: string
}

export type AiProviderName = 'gemini' | 'mistral' | 'openai' | 'openai-compat'

export interface AiConfig {
  provider: AiProviderName
  model?: string
  apiKey?: string
  baseUrl?: string
}
