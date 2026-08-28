import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'

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
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
        { signal: AbortSignal.timeout(10000) }
      )
      if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)
      const data = await res.json() as { models?: { name: string }[] }
      models = (data.models ?? [])
        .map(m => m.name.replace('models/', ''))
        .filter(m => m.includes('gemini'))
    } else if (key.provider === 'mistral') {
      const res = await fetch('https://api.mistral.ai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`Mistral API error: ${res.status}`)
      const data = await res.json() as { data?: { id: string }[] }
      models = (data.data ?? []).map(m => m.id)
    } else {
      const baseUrl = key.base_url ?? 'https://api.openai.com'
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json() as { data?: { id: string }[] }
      models = (data.data ?? []).map(m => m.id).sort()
    }

    return NextResponse.json({ models })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
