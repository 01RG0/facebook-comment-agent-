import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const db = getAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: profiles } = await db
    .from('profiles')
    .select('id, email, full_name, avatar_url, created_at')
    .order('created_at', { ascending: false })

  if (!profiles) return NextResponse.json([])

  // Enrich with page count, today's usage, and limits
  const userIds = (profiles as any[]).map((p: any) => p.id)

  const [
    { data: pageCounts },
    { data: todayBuckets },
    { data: limitsRows },
  ] = await Promise.all([
    db.from('pages').select('user_id').in('user_id', userIds),
    db.from('usage_daily_buckets').select('user_id, request_count, token_count').eq('bucket_day', today).in('user_id', userIds),
    db.from('usage_limits').select('*').in('user_id', userIds),
  ])

  const pageMap: Record<string, number> = {}
  for (const row of (pageCounts ?? []) as any[]) {
    pageMap[row.user_id] = (pageMap[row.user_id] ?? 0) + 1
  }

  const bucketMap: Record<string, { requests: number; tokens: number }> = {}
  for (const row of (todayBuckets ?? []) as any[]) {
    bucketMap[row.user_id] = { requests: row.request_count ?? 0, tokens: row.token_count ?? 0 }
  }

  const limitsMap: Record<string, any> = {}
  for (const row of (limitsRows ?? []) as any[]) {
    limitsMap[row.user_id] = row
  }

  const users = (profiles as any[]).map((p: any) => ({
    ...p,
    page_count: pageMap[p.id] ?? 0,
    today: bucketMap[p.id] ?? { requests: 0, tokens: 0 },
    limits: limitsMap[p.id] ?? null,
  }))

  return NextResponse.json(users)
}
