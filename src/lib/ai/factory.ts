import { GeminiProvider } from './providers/gemini'
import { MistralProvider } from './providers/mistral'
import { OpenAICompatProvider } from './providers/openai-compat'
import type { AiConfig, AiProvider } from './types'
import { decrypt } from '@/lib/crypto'

export function createAiProvider(
  config: AiConfig,
  encryptedKeyData?: { enc: string; iv: string }
): AiProvider {
  const resolvedKey = encryptedKeyData
    ? decrypt(encryptedKeyData.enc, encryptedKeyData.iv)
    : config.apiKey

  switch (config.provider) {
    case 'gemini': {
      const key = resolvedKey ?? process.env.GEMINI_API_KEY
      if (!key) throw new Error('Gemini API key not configured')
      return new GeminiProvider(key, config.model)
    }
    case 'mistral': {
      const key = resolvedKey ?? process.env.MISTRAL_API_KEY
      if (!key) throw new Error('Mistral API key not configured')
      return new MistralProvider(key, config.model)
    }
    case 'openai':
    case 'openai-compat': {
      const key = resolvedKey ?? process.env.OPENAI_API_KEY
      if (!key) throw new Error('OpenAI API key not configured')
      return new OpenAICompatProvider(key, config.model, config.provider, config.baseUrl)
    }
    default: {
      // Custom provider registered by admin — always openai-compat type
      const key = resolvedKey
      if (!key) throw new Error(`API key required for custom provider: ${config.provider}`)
      return new OpenAICompatProvider(key, config.model, config.provider, config.baseUrl)
    }
  }
}
