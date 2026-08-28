import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const db = getAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const monthStart = today.slice(0, 7) + '-01'

  const [
    { count: totalUsers },
    { count: totalPages },
    { data: todayBuckets },
    { data: monthBuckets },
    { count: totalErrors },
    { count: todayErrors },
    { data: recentLogs },
    { data: topProviders },
  ] = await Promise.all([
    db.from('profiles').select('*', { count: 'exact', head: true }),
    db.from('pages').select('*', { count: 'exact', head: true }),
    db.from('usage_daily_buckets').select('request_count, token_count').eq('bucket_day', today),
    db.from('usage_daily_buckets').select('request_count, token_count').gte('bucket_day', monthStart),
    db.from('ai_usage_logs').select('*', { count: 'exact', head: true }).eq('success', false),
    db.from('ai_usage_logs').select('*', { count: 'exact', head: true }).eq('success', false).gte('created_at', today),
    db.from('ai_usage_logs').select('id, user_id, provider, model, total_tokens, success, error_message, latency_ms, created_at').order('created_at', { ascending: false }).limit(10),
    db.from('ai_usage_logs').select('provider').limit(10000),
  ])

  const todayRequests = (todayBuckets ?? []).reduce((s: number, r: any) => s + (r.request_count ?? 0), 0)
  const todayTokens = (todayBuckets ?? []).reduce((s: number, r: any) => s + (r.token_count ?? 0), 0)
  const monthRequests = (monthBuckets ?? []).reduce((s: number, r: any) => s + (r.request_count ?? 0), 0)
  const monthTokens = (monthBuckets ?? []).reduce((s: number, r: any) => s + (r.token_count ?? 0), 0)

  const providerCounts: Record<string, number> = {}
  for (const row of (topProviders ?? []) as any[]) {
    providerCounts[row.provider] = (providerCounts[row.provider] ?? 0) + 1
  }

  return NextResponse.json({
    users: { total: totalUsers ?? 0 },
    pages: { total: totalPages ?? 0 },
    today: { requests: todayRequests, tokens: todayTokens, errors: todayErrors ?? 0 },
    month: { requests: monthRequests, tokens: monthTokens },
    errors: { total: totalErrors ?? 0 },
    providers: Object.entries(providerCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    recentLogs: recentLogs ?? [],
  })
}
