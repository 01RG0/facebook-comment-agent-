import { GoogleGenAI } from '@google/genai'
import type { AiProvider, AiReply, ConversationMessage } from '../types'

export class GeminiProvider implements AiProvider {
  private client: GoogleGenAI
  readonly providerName = 'gemini'
  readonly modelName: string

  constructor(apiKey: string, model = 'gemini-2.5-flash') {
    this.client = new GoogleGenAI({ apiKey })
    this.modelName = model
  }

  async generateReply(comment: string, instructions: string, language: string, history?: ConversationMessage[]): Promise<AiReply> {
    const langNote = language === 'auto'
      ? 'Reply in the same language the user used.'
      : `Reply in ${language}.`

    // Build multi-turn contents from history
    const contents: { role: string; parts: { text: string }[] }[] = []
    for (const msg of history ?? []) {
      contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] })
    }
    contents.push({ role: 'user', parts: [{ text: comment }] })

    const t0 = Date.now()
    const result = await this.client.models.generateContent({
      model: this.modelName,
      contents,
      config: {
        systemInstruction: `${instructions}\n\n${langNote}`,
      },
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
