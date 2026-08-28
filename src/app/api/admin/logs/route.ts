import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { searchParams } = req.nextUrl
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500)
  const offset = parseInt(searchParams.get('offset') ?? '0')
  const provider = searchParams.get('provider')
  const success = searchParams.get('success')
  const userId = searchParams.get('user_id')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')

  const db = getAdminClient()

  let query = db
    .from('ai_usage_logs')
    .select(`
      id, user_id, page_id, comment_log_id, provider, model,
      prompt_tokens, completion_tokens, total_tokens, latency_ms,
      success, error_message, created_at,
      profiles!ai_usage_logs_user_id_fkey(email, full_name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (provider) query = query.eq('provider', provider)
  if (success !== null && success !== '') query = query.eq('success', success === 'true')
  if (userId) query = query.eq('user_id', userId)
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59Z')

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [], count: count ?? 0, limit, offset })
}
