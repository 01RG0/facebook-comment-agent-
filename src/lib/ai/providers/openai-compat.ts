import OpenAI from 'openai'
import type { AiProvider } from '../types'

export class OpenAICompatProvider implements AiProvider {
  private client: OpenAI
  readonly providerName: string
  readonly modelName: string

  constructor(
    apiKey: string,
    model = 'gpt-4o-mini',
    providerName = 'openai',
    baseUrl?: string
  ) {
    this.client = new OpenAI({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) })
    this.modelName = model
    this.providerName = providerName
  }

  async generateReply(comment: string, instructions: string, language: string): Promise<string> {
    const langNote = language === 'auto'
      ? 'Reply in the same language the commenter used.'
      : `Reply in ${language}.`

    const completion = await this.client.chat.completions.create({
      model: this.modelName,
      messages: [
        { role: 'system', content: `${instructions}\n\n${langNote}` },
        { role: 'user', content: `Comment: ${comment}\n\nWrite a private reply:` },
      ],
    })

    const text = completion.choices[0]?.message?.content?.trim()
    if (!text) throw new Error('OpenAI-compat returned empty response')
    return text
  }
}
