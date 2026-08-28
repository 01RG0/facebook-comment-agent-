import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'

type Params = { params: { keyId: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  const supabase = createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing } = await supabase
    .from('ai_provider_keys')
    .select('id')
    .eq('id', params.keyId)
    .eq('user_id', user.id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as {
    label?: string
    provider?: string
    base_url?: string | null
    model?: string | null
    api_key?: string
    priority?: number
    is_active?: boolean
    daily_request_limit?: number | null
    monthly_token_limit?: number | null
    cost_per_1m_input?: number
    cost_per_1m_output?: number
  }

  const update: Record<string, unknown> = {}
  if (body.label !== undefined) update.label = body.label
  if (body.provider !== undefined) update.provider = body.provider
  if ('base_url' in body) update.base_url = body.base_url
  if ('model' in body) update.model = body.model
  if (body.priority !== undefined) update.priority = body.priority
  if (body.is_active !== undefined) update.is_active = body.is_active
  if ('daily_request_limit' in body) update.daily_request_limit = body.daily_request_limit
  if ('monthly_token_limit' in body) update.monthly_token_limit = body.monthly_token_limit
  if (body.cost_per_1m_input !== undefined) update.cost_per_1m_input = body.cost_per_1m_input
  if (body.cost_per_1m_output !== undefined) update.cost_per_1m_output = body.cost_per_1m_output

  if (body.api_key) {
    const { enc, iv } = encrypt(body.api_key)
    update.api_key_enc = enc
    update.api_key_iv = iv
    update.consecutive_errors = 0
    update.last_error_at = null
    update.last_error_message = null
  }

  const { error } = await supabase
    .from('ai_provider_keys')
    .update(update)
    .eq('id', params.keyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('ai_provider_keys')
    .delete()
    .eq('id', params.keyId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
