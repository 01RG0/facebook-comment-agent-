import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { validateExternalUrl } from '@/lib/utils'

export async function POST(
  req: NextRequest,
  { params }: { params: { pageId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: page } = await supabase
    .from('pages')
    .select('id')
    .eq('id', params.pageId)
    .eq('user_id', user.id)
    .single()
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const body = await req.json()
  const { provider, base_url, api_key: rawKey } = body as {
    provider: string
    base_url?: string
    api_key?: string
  }

  // Resolve API key: prefer caller-supplied, else decrypt stored key, else env
  let apiKey = rawKey
  if (!apiKey) {
    const { data: settings } = await supabase
      .from('settings')
      .select('ai_api_key_enc, ai_api_key_iv')
      .eq('page_id', params.pageId)
      .single() as { data: { ai_api_key_enc: string | null; ai_api_key_iv: string | null } | null }
    if (settings?.ai_api_key_enc && settings?.ai_api_key_iv) {
      apiKey = decrypt(settings.ai_api_key_enc, settings.ai_api_key_iv)
    }
  }

  try {
    const models = await fetchModels(provider, apiKey, base_url)
    return NextResponse.json({ models })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}

async function fetchModels(
  provider: string,
  apiKey: string | undefined,
  baseUrl?: string
): Promise<string[]> {
  if (provider === 'gemini') {
    if (!apiKey) {
      apiKey = process.env.GEMINI_API_KEY
    }
    if (!apiKey) throw new Error('No Gemini API key available')
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    )
    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)
    const data = await res.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
    return (data.models ?? [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
      .sort()
  }

  if (provider === 'mistral') {
    if (!apiKey) apiKey = process.env.MISTRAL_API_KEY
    if (!apiKey) throw new Error('No Mistral API key available')
    const res = await fetch('https://api.mistral.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) throw new Error(`Mistral API error: ${res.status}`)
    const data = await res.json() as { data?: { id: string }[] }
    return (data.data ?? []).map(m => m.id).sort()
  }

  // openai / openai-compat / custom
  const rawBase = (baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  if (baseUrl) validateExternalUrl(baseUrl)
  if (!apiKey) apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('No API key available')
  // Build models URL: avoid double /v1 if caller already included it
  const modelsUrl = rawBase.endsWith('/v1')
    ? `${rawBase}/models`
    : `${rawBase}/v1/models`
  const res = await fetch(modelsUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Provider API error ${res.status}${errBody ? ': ' + errBody.slice(0, 200) : ''}`)
  }
  const data = await res.json() as { data?: { id: string }[]; models?: { id?: string; name?: string }[] }
  if (data.data) return data.data.map(m => m.id).filter(Boolean).sort()
  if (data.models) return data.models.map(m => m.id ?? m.name ?? '').filter(Boolean).sort()
  return []
}
