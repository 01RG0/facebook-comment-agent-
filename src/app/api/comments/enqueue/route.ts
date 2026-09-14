import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCommentQueue } from '@/lib/queue/client'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Accept both snake_case and camelCase forms
  const fb_comment_id = (body.fb_comment_id ?? body.commentId) as string | undefined
  const page_id = (body.page_id ?? body.pageId) as string | undefined
  const commenter_id = (body.commenter_id ?? body.commenterId) as string | undefined
  const commenter_name = (body.commenter_name ?? body.commenterName) as string | undefined
  const message = (body.message ?? body.comment_text) as string | undefined
  const post_id = (body.post_id ?? body.postId) as string | undefined

  if (!fb_comment_id || !page_id) {
    return NextResponse.json(
      { error: 'Missing required fields: fb_comment_id and page_id are required' },
      { status: 400 }
    )
  }

  // Verify page belongs to the user
  const { data: page, error: pageError } = await supabase
    .from('pages')
    .select('id, fb_page_id, zernio_account_id')
    .eq('id', page_id)
    .eq('user_id', user.id)
    .single()

  if (pageError || !page) {
    return NextResponse.json(
      { error: 'Page not found or does not belong to user' },
      { status: 404 }
    )
  }

  const effectiveCommenterId = commenter_id || 'unknown'
  const effectiveCommenterName = commenter_name || 'Anonymous'
  const effectiveMessage = message || ''
  const effectivePostId = post_id || ''

  const queue = getCommentQueue()
  const job = await queue.add(
    'process-comment',
    {
      pageId: page.id,
      fbPageId: page.fb_page_id,
      zernioAccountId: page.zernio_account_id ?? '',
      commentId: fb_comment_id,
      platformPostId: effectivePostId,
      postId: effectivePostId,
      from: {
        id: effectiveCommenterId,
        name: effectiveCommenterName,
      },
      message: effectiveMessage,
      createdTime: Date.now(),
    },
    {
      jobId: `enqueue-${fb_comment_id}-${Date.now()}`,
    }
  )

  return NextResponse.json({ success: true, jobId: job.id })
}
