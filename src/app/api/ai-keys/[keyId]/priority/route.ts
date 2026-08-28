import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: { keyId: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { direction } = await req.json() as { direction: 'up' | 'down' }

  const { data: allKeys } = await supabase
    .from('ai_provider_keys')
    .select('id, priority')
    .eq('user_id', user.id)
    .order('priority', { ascending: true })

  if (!allKeys || allKeys.length < 2) return NextResponse.json({ success: true })

  const idx = allKeys.findIndex(k => k.id === params.keyId)
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= allKeys.length) return NextResponse.json({ success: true })

  const current = allKeys[idx]
  const swap = allKeys[swapIdx]

  await Promise.all([
    supabase.from('ai_provider_keys').update({ priority: swap.priority }).eq('id', current.id),
    supabase.from('ai_provider_keys').update({ priority: current.priority }).eq('id', swap.id),
  ])

  return NextResponse.json({ success: true })
}
