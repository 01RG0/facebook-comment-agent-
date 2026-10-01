import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
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

  const [replied, skipped, failed, total] = await Promise.all([
    supabase.from('comments_log').select('id', { count: 'exact', head: true }).eq('page_id', params.pageId).eq('status', 'replied'),
    supabase.from('comments_log').select('id', { count: 'exact', head: true }).eq('page_id', params.pageId).eq('status', 'skipped'),
    supabase.from('comments_log').select('id', { count: 'exact', head: true }).eq('page_id', params.pageId).eq('status', 'failed'),
    supabase.from('comments_log').select('id', { count: 'exact', head: true }).eq('page_id', params.pageId),
  ])

  return NextResponse.json({
    replied: replied.count ?? 0,
    skipped: skipped.count ?? 0,
    failed: failed.count ?? 0,
    total: total.count ?? 0,
  })
}
