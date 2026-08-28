import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { pageId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: page } = await supabase
    .from('pages')
    .select('id, page_name')
    .eq('id', params.pageId)
    .eq('user_id', user.id)
    .single()

  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(req.url)
  const since = url.searchParams.get('since') ?? new Date(Date.now() - 30 * 86400000).toISOString()
  const status = url.searchParams.get('status')

  let q = supabase
    .from('comments_log')
    .select('fb_comment_id, fb_post_id, commenter_id, commenter_name, comment_text, reply_text, status, skip_reason, ai_provider, ai_model, error_message, replied_at, created_at')
    .eq('page_id', params.pageId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (status) q = q.eq('status', status)

  const { data: rows } = await q

  if (!rows || rows.length === 0) {
    return new NextResponse('No data', { status: 200, headers: { 'Content-Type': 'text/csv' } })
  }

  const headers = [
    'comment_id', 'post_id', 'commenter_id', 'commenter_name', 'comment_text',
    'reply_text', 'status', 'skip_reason', 'ai_provider', 'ai_model',
    'error_message', 'replied_at', 'created_at',
  ]

  const escape = (v: unknown) => {
    if (v == null) return ''
    const s = String(v).replace(/"/g, '""')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s
  }

  const csvLines = [
    headers.join(','),
    ...rows.map(r =>
      [
        r.fb_comment_id, r.fb_post_id, r.commenter_id, r.commenter_name, r.comment_text,
        r.reply_text, r.status, r.skip_reason, r.ai_provider, r.ai_model,
        r.error_message, r.replied_at, r.created_at,
      ].map(escape).join(',')
    ),
  ]

  const filename = `${page.page_name.replace(/[^a-z0-9]/gi, '_')}_activity_${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csvLines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
