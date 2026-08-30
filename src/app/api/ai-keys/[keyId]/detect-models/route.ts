import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { validateExternalUrl } from '@/lib/utils'

type Params = { params: { keyId: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: key } = await supabase
    .from('ai_provider_keys')
    .select('provider, base_url, api_key_enc, api_key_iv')
    .eq('id', params.keyId)
    .eq('user_id', user.id)
    .single()

  if (!key) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const apiKey = decrypt(key.api_key_enc, key.api_key_iv)

  try {
    let models: string[] = []

    if (key.provider === 'gemini') {
      // Use v1beta — only endpoint that returns supportedGenerationMethods
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { signal: AbortSignal.timeout(15000) }
      )
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        throw new Error(`Gemini API error ${res.status}${errBody ? ': ' + errBody.slice(0, 200) : ''}`)
      }
      const data = await res.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
      models = (data.models ?? [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace('models/', ''))
        .sort()
    } else if (key.provider === 'mistral') {
      const res = await fetch('https://api.mistral.ai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        throw new Error(`Mistral API error ${res.status}${errBody ? ': ' + errBody.slice(0, 200) : ''}`)
      }
      const data = await res.json() as { data?: { id: string }[] }
      models = (data.data ?? []).map(m => m.id).sort()
    } else {
      // openai / openai-compat / custom
      const baseUrl = (key.base_url ?? 'https://api.openai.com').replace(/\/$/, '')
      if (key.base_url) validateExternalUrl(key.base_url)
      // Try /v1/models, fall back path if base already includes /v1
      const modelsUrl = baseUrl.endsWith('/v1')
        ? `${baseUrl}/models`
        : `${baseUrl}/v1/models`
      const res = await fetch(modelsUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        throw new Error(`API error ${res.status}${errBody ? ': ' + errBody.slice(0, 200) : ''}`)
      }
      const data = await res.json() as { data?: { id: string }[]; models?: { id?: string; name?: string }[] }
      // Handle both OpenAI-style { data: [{id}] } and some custom providers { models: [{id/name}] }
      if (data.data) {
        models = data.data.map(m => m.id).filter(Boolean).sort()
      } else if (data.models) {
        models = data.models.map(m => m.id ?? m.name ?? '').filter(Boolean).sort()
      }
    }

    return NextResponse.json({ models })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
