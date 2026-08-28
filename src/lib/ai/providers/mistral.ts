import { Mistral } from '@mistralai/mistralai'
import type { AiProvider, AiReply } from '../types'

export class MistralProvider implements AiProvider {
  private client: Mistral
  readonly providerName = 'mistral'
  readonly modelName: string

  constructor(apiKey: string, model = 'mistral-large-latest') {
    this.client = new Mistral({ apiKey })
    this.modelName = model
  }

  async generateReply(comment: string, instructions: string, language: string): Promise<AiReply> {
    const langNote = language === 'auto'
      ? 'Reply in the same language the commenter used.'
      : `Reply in ${language}.`

    const t0 = Date.now()
    const result = await this.client.chat.complete({
      model: this.modelName,
      messages: [
        { role: 'system', content: `${instructions}\n\n${langNote}` },
        { role: 'user', content: `Comment: ${comment}\n\nWrite a private reply:` },
      ],
    })
    const latencyMs = Date.now() - t0

    const content = result.choices?.[0]?.message?.content
    if (!content) throw new Error('Mistral returned empty response')
    const text = typeof content === 'string' ? content : (content as Array<{ type: string; text?: string }>).find(c => c.type === 'text')?.text ?? ''
    if (!text) throw new Error('Mistral returned empty content')

    const usage = result.usage
    return {
      text: text.trim(),
      latencyMs,
      tokens: usage ? {
        promptTokens: usage.promptTokens ?? 0,
        completionTokens: usage.completionTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
      } : undefined,
    }
  }
}
