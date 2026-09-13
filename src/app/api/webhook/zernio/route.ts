import { NextRequest, NextResponse } from 'next/server'
import { verifyZernioSignature } from '@/lib/zernio/signature'
import { getCommentQueue } from '@/lib/queue/client'
import { getAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import type { ZernioCommentPayload } from '@/types/zernio'

export async function GET() {
  return new NextResponse('ok', { status: 200 })
}

export async function POST(req: NextRequest) {
  // a. Read raw body (arrayBuffer -> Buffer)
  const rawBody = Buffer.from(await req.arrayBuffer())
  const signature = req.headers.get('x-zernio-signature')

  // b. Verify X-Zernio-Signature using verifyZernioSignature -> 401 on fail
  try {
    if (!verifyZernioSignature(rawBody, signature)) {
      logger.warn({ signature }, 'Zernio webhook signature mismatch')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } catch (sigErr) {
    logger.error({ err: (sigErr as Error).message }, 'Zernio signature verification error')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // d. Only process X-Zernio-Event === 'comment.received'
  const eventHeader = req.headers.get('x-zernio-event')
  if (eventHeader && eventHeader !== 'comment.received') {
    return NextResponse.json({ status: 'ignored' })
  }

  // c. Parse as ZernioCommentPayload
  let payload: ZernioCommentPayload
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as ZernioCommentPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (payload.event !== 'comment.received') {
    return NextResponse.json({ status: 'ignored' })
  }

  // e. Skip if payload.comment.platform !== 'facebook'
  if (payload.comment?.platform !== 'facebook') {
    return NextResponse.json({ status: 'ignored' })
  }

  // f. Skip if payload.comment.isReply === true
  if (payload.comment?.isReply === true) {
    return NextResponse.json({ status: 'ignored' })
  }

  // g. Skip if payload.comment.author.isOwnAccount === true
  if (payload.comment?.author?.isOwnAccount === true) {
    return NextResponse.json({ status: 'ignored' })
  }

  // h. Lookup page: db.from('pages').select('id, agent_enabled, fb_page_id').eq('zernio_account_id', payload.account.id).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getAdminClient() as any
  const { data: page, error: pageErr } = await db
    .from('pages')
    .select('id, agent_enabled, fb_page_id')
    .eq('zernio_account_id', payload.account.id)
    .maybeSingle()

  if (pageErr) {
    logger.error({ err: pageErr.message, accountId: payload.account.id }, 'Error looking up page by zernio_account_id')
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  // i. Skip if !page || !page.agent_enabled
  if (!page || !page.agent_enabled) {
    return NextResponse.json({ status: 'ignored' })
  }

  // j. If page.fb_page_id is null or starts with 'zernio:':
  let fbPageId = page.fb_page_id
  if (!fbPageId || fbPageId.startsWith('zernio:')) {
    const extracted = payload.comment.platformPostId.split('_')[0]
    if (extracted) {
      fbPageId = extracted
      await db
        .from('pages')
        .update({ fb_page_id: extracted })
        .eq('id', page.id)
    }
  }

  // k. Enqueue to BullMQ queue 'comment-replies' with jobId = payload.comment.id:
  const queue = getCommentQueue()
  await queue.add(
    'process-comment',
    {
      pageId: page.id,
      fbPageId,
      zernioAccountId: payload.account.id,
      commentId: payload.comment.id,
      platformPostId: payload.comment.platformPostId,
      postId: payload.comment.platformPostId,
      from: {
        id: payload.comment.author.id,
        name: payload.comment.author.name ?? payload.comment.author.username ?? '',
      },
      message: payload.comment.text,
      createdTime: new Date(payload.comment.createdAt).getTime() / 1000,
    },
    {
      jobId: payload.comment.id,
    }
  )

  // l. Return {status: 'ok'}
  return NextResponse.json({ status: 'ok' })
}
