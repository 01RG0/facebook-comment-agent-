import { GoogleGenAI } from '@google/genai'
import type { AiProvider, AiReply } from '../types'

export class GeminiProvider implements AiProvider {
  private client: GoogleGenAI
  readonly providerName = 'gemini'
  readonly modelName: string

  constructor(apiKey: string, model = 'gemini-2.0-flash') {
    this.client = new GoogleGenAI({ apiKey })
    this.modelName = model
  }

  async generateReply(comment: string, instructions: string, language: string): Promise<AiReply> {
    const langNote = language === 'auto'
      ? 'Reply in the same language the commenter used.'
      : `Reply in ${language}.`

    const t0 = Date.now()
    const result = await this.client.models.generateContent({
      model: this.modelName,
      contents: `${instructions}\n\n${langNote}\n\nComment: ${comment}\n\nPrivate reply:`,
    })
    const latencyMs = Date.now() - t0

    const text = result.text?.trim()
    if (!text) throw new Error('Gemini returned empty response')

    const usage = (result as any).usageMetadata
    return {
      text,
      latencyMs,
      tokens: usage ? {
        promptTokens: usage.promptTokenCount ?? 0,
        completionTokens: usage.candidatesTokenCount ?? 0,
        totalTokens: usage.totalTokenCount ?? 0,
      } : undefined,
    }
  }
}
