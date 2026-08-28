import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const db = getAdminClient()
  const { userId } = params

  const [
    { data: profile },
    { data: pages },
    { data: limits },
    { data: last30Days },
    { data: recentAiLogs },
  ] = await Promise.all([
    db.from('profiles').select('*').eq('id', userId).single(),
    db.from('pages').select('id, page_name, fb_page_id, agent_enabled, created_at').eq('user_id', userId),
    db.from('usage_limits').select('*').eq('user_id', userId).maybeSingle(),
    db.from('usage_daily_buckets')
      .select('bucket_day, request_count, token_count')
      .eq('user_id', userId)
      .order('bucket_day', { ascending: false })
      .limit(30),
    db.from('ai_usage_logs')
      .select('id, provider, model, total_tokens, prompt_tokens, completion_tokens, latency_ms, success, error_message, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  return NextResponse.json({
    profile,
    pages: pages ?? [],
    limits: limits ?? null,
    usage: { last30Days: last30Days ?? [] },
    recentAiLogs: recentAiLogs ?? [],
  })
}
