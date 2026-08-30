import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/facebook/signature'
import { getCommentQueue } from '@/lib/queue/client'
import { logger } from '@/lib/logger'
import type { MetaWebhookBody } from '@/types/meta'
import { getAdminClient } from '@/lib/supabase/admin'

// GET — webhook verification challenge
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    logger.info('Webhook verified')
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// POST — incoming events
export async function POST(req: NextRequest) {
  // Read raw body for HMAC verification
  const rawBody = Buffer.from(await req.arrayBuffer())
  const signature = req.headers.get('x-hub-signature-256')

  if (!verifyWebhookSignature(rawBody, signature)) {
    logger.warn({ signature }, 'Webhook signature mismatch')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Respond immediately — Meta expects < 2s
  const body = JSON.parse(rawBody.toString('utf8')) as MetaWebhookBody

  if (body.object !== 'page') {
    return NextResponse.json({ status: 'ignored' })
  }

  const queue = getCommentQueue()
  const db = getAdminClient()

  for (const entry of body.entry ?? []) {
    const fbPageId = entry.id

    // Look up our internal page record
    const { data: page } = await db
      .from('pages')
      .select('id, user_id, agent_enabled')
      .eq('fb_page_id', fbPageId)
      .maybeSingle()

    if (!page?.agent_enabled) continue

    for (const change of entry.changes ?? []) {
      const v = change.value
      if (change.field !== 'feed' && change.field !== 'videos') continue
      if (v.item !== 'comment') continue
      if (v.verb !== 'add') continue
      if (!v.comment_id || !v.message || !v.from) continue
      // Skip replies to comments (only top-level)
      if (v.parent_id && v.parent_id !== v.post_id) continue

      try {
        await queue.add(
          'reply-comment',
          {
            pageId: page.id,
            fbPageId,
            commentId: v.comment_id,
            postId: v.post_id ?? '',
            from: v.from,
            message: v.message,
            createdTime: v.created_time ?? Date.now() / 1000,
          },
          { jobId: v.comment_id } // dedup at queue level
        )
        logger.info({ commentId: v.comment_id, pageId: page.id }, 'Comment enqueued')
      } catch (err) {
        logger.error({ err: (err as Error).message, commentId: v.comment_id }, 'Enqueue failed')
      }
    }
  }

  return NextResponse.json({ status: 'ok' })
}
