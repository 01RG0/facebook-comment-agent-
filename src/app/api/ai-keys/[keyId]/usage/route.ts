import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: { keyId: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: key } = await supabase
    .from('ai_provider_keys')
    .select('id')
    .eq('id', params.keyId)
    .eq('user_id', user.id)
    .single()
  if (!key) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const since = new Date()
  since.setDate(since.getDate() - 29)
  const sinceStr = since.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('ai_key_usage')
    .select('date, requests, tokens_in, tokens_out, estimated_cost')
    .eq('key_id', params.keyId)
    .gte('date', sinceStr)
    .order('date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
