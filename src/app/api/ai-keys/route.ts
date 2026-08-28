import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'

function deriveHealth(errors: number): 'healthy' | 'degraded' | 'failing' {
  if (errors === 0) return 'healthy'
  if (errors <= 3) return 'degraded'
  return 'failing'
}

export async function GET() {
  const supabase = createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().split('T')[0]

  const { data: keys, error } = await supabase
    .from('ai_provider_keys')
    .select(`
      id, label, provider, base_url, model, priority, is_active,
      daily_request_limit, monthly_token_limit,
      consecutive_errors, last_used_at, last_error_at, last_error_message,
      cost_per_1m_input, cost_per_1m_output, created_at,
      ai_key_usage!left(requests, tokens_in, tokens_out, estimated_cost, date)
    `)
    .eq('user_id', user.id)
    .order('priority', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (keys ?? []).map(k => {
    const todayUsage = (k.ai_key_usage as { requests: number; tokens_in: number; tokens_out: number; estimated_cost: number; date: string }[])
      ?.find(u => u.date === today)
    return {
      id: k.id,
      label: k.label,
      provider: k.provider,
      base_url: k.base_url,
      model: k.model,
      priority: k.priority,
      is_active: k.is_active,
      daily_request_limit: k.daily_request_limit,
      monthly_token_limit: k.monthly_token_limit,
      consecutive_errors: k.consecutive_errors,
      last_used_at: k.last_used_at,
      last_error_at: k.last_error_at,
      last_error_message: k.last_error_message,
      cost_per_1m_input: k.cost_per_1m_input,
      cost_per_1m_output: k.cost_per_1m_output,
      created_at: k.created_at,
      today_requests: todayUsage?.requests ?? 0,
      today_tokens_in: todayUsage?.tokens_in ?? 0,
      today_tokens_out: todayUsage?.tokens_out ?? 0,
      today_cost: todayUsage?.estimated_cost ?? 0,
      health: deriveHealth(k.consecutive_errors),
    }
  })

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    label: string
    provider: string
    base_url?: string
    model?: string
    api_key: string
    priority?: number
    daily_request_limit?: number
    monthly_token_limit?: number
    cost_per_1m_input?: number
    cost_per_1m_output?: number
  }

  if (!body.label || !body.provider || !body.api_key) {
    return NextResponse.json({ error: 'label, provider, and api_key are required' }, { status: 400 })
  }

  const { enc, iv } = encrypt(body.api_key)

  const { data, error } = await supabase
    .from('ai_provider_keys')
    .insert({
      user_id: user.id,
      label: body.label,
      provider: body.provider,
      base_url: body.base_url ?? null,
      model: body.model ?? null,
      api_key_enc: enc,
      api_key_iv: iv,
      priority: body.priority ?? 0,
      daily_request_limit: body.daily_request_limit ?? null,
      monthly_token_limit: body.monthly_token_limit ?? null,
      cost_per_1m_input: body.cost_per_1m_input ?? 0,
      cost_per_1m_output: body.cost_per_1m_output ?? 0,
    })
    .select('id, label, provider, priority')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
