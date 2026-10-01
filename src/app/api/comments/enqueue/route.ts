import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processCommentJob } from '@/lib/queue/comment-worker'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const fb_comment_id = (body.fb_comment_id ?? body.commentId) as string | undefined
  const page_id = (body.page_id ?? body.pageId) as string | undefined
  const commenter_id = (body.commenter_id ?? body.commenterId) as string | undefined
  const commenter_name = (body.commenter_name ?? body.commenterName) as string | undefined
  const message = (body.message ?? body.comment_text) as string | undefined
  const post_id = (body.post_id ?? body.postId) as string | undefined

  if (!fb_comment_id || !page_id) {
    return NextResponse.json({ error: 'Missing required fields: fb_comment_id and page_id are required' }, { status: 400 })
  }

  const { data: page, error: pageError } = await supabase
    .from('pages')
    .select('id, fb_page_id, zernio_account_id')
    .eq('id', page_id)
    .eq('user_id', user.id)
    .single()

  if (pageError || !page) {
    return NextResponse.json({ error: 'Page not found or does not belong to user' }, { status: 404 })
  }

  void processCommentJob({
    pageId: page.id,
    fbPageId: page.fb_page_id,
    zernioAccountId: page.zernio_account_id ?? '',
    commentId: fb_comment_id,
    platformPostId: post_id || '',
    postId: post_id || '',
    from: { id: commenter_id || 'unknown', name: commenter_name || 'Anonymous' },
    message: message || '',
    createdTime: Date.now(),
  })

  return NextResponse.json({ success: true })
}
