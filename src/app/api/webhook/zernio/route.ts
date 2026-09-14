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
  logger.info({ url: req.url }, 'Webhook POST received')
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

  // c. Parse payload JSON
  let payload: any
  try {
    payload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventHeader = req.headers.get('x-zernio-event')
  const eventType = payload.event || payload.type || payload.event_type || eventHeader || ''

  // ── Handle Messenger Direct Message (DM) Events ──
  const isMessageEvent =
    eventType === 'message' ||
    eventType === 'message.received' ||
    eventType === 'message.created' ||
    eventType.startsWith('message') ||
    !!payload.message

  // If this is a message event and not a comment event
  if (isMessageEvent && eventType !== 'comment.received' && !payload.comment) {
    // 1. Extract: sender_id (from.id), sender_name (from.name), page's fb_page_id or zernio account, message text, fb_message_id
    const msgObj = typeof payload.message === 'object' && payload.message !== null ? payload.message : {}
    const fromObj = payload.from || msgObj.from || msgObj.sender || payload.sender || {}
    const senderId = String(fromObj.id || msgObj.sender_id || msgObj.senderId || payload.sender_id || payload.senderId || '')
    const senderName = fromObj.name || msgObj.sender_name || msgObj.senderName || fromObj.username || ''
    const messageText = typeof payload.message === 'string'
      ? payload.message
      : (msgObj.text ?? msgObj.message ?? payload.text ?? '')
    const fbMessageId = msgObj.id || msgObj.fb_message_id || msgObj.message_id || payload.fb_message_id || payload.message_id || payload.id || null
    const accountId = payload.account?.id || payload.accountId || payload.zernio_account_id || msgObj.accountId || ''

    logger.info(
      { event: eventType, senderId, senderName, accountId, fbMessageId },
      'Zernio message event received'
    )

    if (!senderId) {
      logger.warn({ payload }, 'Zernio message event missing senderId')
      return NextResponse.json({ error: 'Missing sender ID' }, { status: 400 })
    }

    // 2. Find the page in DB: supabase.from('pages').select('id, agent_enabled, fb_page_id').eq('zernio_account_id', accountId)
    const db = getAdminClient()
    let pageQuery = db
      .from('pages')
      .select('id, agent_enabled, fb_page_id, user_id')

    if (accountId) {
      pageQuery = pageQuery.eq('zernio_account_id', accountId)
    } else if (payload.fb_page_id || payload.page_id) {
      pageQuery = pageQuery.eq('fb_page_id', payload.fb_page_id || payload.page_id)
    }

    const { data: page, error: pageErr } = await pageQuery.maybeSingle()

    if (pageErr) {
      logger.error({ err: pageErr.message, accountId }, 'Error looking up page for message event')
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!page) {
      logger.info({ accountId }, 'Message ignored: page not found')
      return NextResponse.json({ status: 'ignored' })
    }

    // 3. Upsert messenger_threads: { page_id, sender_id, sender_name, last_message_at: new Date().toISOString() }
    // on conflict (page_id, sender_id) update last_message_at, unread_count+1.
    const nowIso = new Date().toISOString()

    // Get current unread_count if thread exists
    const { data: existingThread } = await db
      .from('messenger_threads')
      .select('id, unread_count')
      .eq('page_id', page.id)
      .eq('sender_id', senderId)
      .maybeSingle()

    const currentUnread = existingThread?.unread_count ?? 0

    const { data: thread, error: threadErr } = await db
      .from('messenger_threads')
      .upsert(
        {
          page_id: page.id,
          user_id: page.user_id,
          sender_id: senderId,
          sender_name: senderName || null,
          last_message_at: nowIso,
          unread_count: currentUnread + 1,
        },
        { onConflict: 'page_id,sender_id' }
      )
      .select('id')
      .single()

    if (threadErr || !thread) {
      logger.error({ err: threadErr?.message, pageId: page.id, senderId }, 'Failed to upsert messenger_threads')
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    // 4. Insert messenger_messages: { thread_id, fb_message_id, direction: 'inbound', text: message_text, sent_at: new Date().toISOString() }
    const { data: insertedMsg, error: msgErr } = await db
      .from('messenger_messages')
      .insert({
        thread_id: thread.id,
        fb_message_id: fbMessageId ? String(fbMessageId) : null,
        direction: 'inbound',
        text: messageText,
        sent_at: nowIso,
      })
      .select('id')
      .single()

    if (msgErr) {
      logger.error({ err: msgErr.message, threadId: thread.id }, 'Failed to insert messenger_messages')
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    // 5. If page.agent_enabled: enqueue job 'process-dm' with { threadId, pageId, senderId, senderName, message: text }
    if (page.agent_enabled) {
      const queue = getCommentQueue() as any
      try {
        await queue.add(
          'process-dm',
          {
            threadId: thread.id,
            pageId: page.id,
            senderId,
            senderName,
            message: messageText,
            fbPageId: page.fb_page_id,
            zernioAccountId: accountId,
            messageId: insertedMsg?.id,
            fbMessageId: fbMessageId ? String(fbMessageId) : '',
          },
          {
            jobId: fbMessageId ? `dm-${fbMessageId}` : undefined,
          }
        )
        logger.info({ threadId: thread.id, pageId: page.id }, 'DM job enqueued')
      } catch (queueErr) {
        logger.error({ err: (queueErr as Error).message, threadId: thread.id }, 'Failed to enqueue DM job')
      }
    }

    // 6. Return NextResponse.json({ ok: true }) with status 200
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  // ── Handle Comment Events ──
  // d. Only process X-Zernio-Event === 'comment.received'
  if (eventHeader && eventHeader !== 'comment.received') {
    return NextResponse.json({ status: 'ignored' })
  }

  logger.info({ event: payload.event, platform: payload.comment?.platform, isReply: payload.comment?.isReply, isOwnAccount: payload.comment?.author?.isOwnAccount, accountId: payload.account?.id }, 'Webhook payload parsed')

  if (payload.event !== 'comment.received') {
    logger.info({ event: payload.event }, 'Webhook ignored: event mismatch')
    return NextResponse.json({ status: 'ignored' })
  }

  // e. Skip if payload.comment.platform !== 'facebook'
  if (payload.comment?.platform !== 'facebook') {
    logger.info({ platform: payload.comment?.platform }, 'Webhook ignored: not facebook')
    return NextResponse.json({ status: 'ignored' })
  }

  // f. isReply check removed — Zernio marks all Facebook comments as isReply:true

  // g. isOwnAccount check removed — page owners may test by commenting on their own posts

  // h. Lookup page: db.from('pages').select('id, agent_enabled, fb_page_id').eq('zernio_account_id', payload.account.id).maybeSingle()
  const db = getAdminClient()
  const { data: page, error: pageErr } = await db
    .from('pages')
    .select('id, user_id, agent_enabled, fb_page_id')
    .eq('zernio_account_id', payload.account.id)
    .maybeSingle()

  if (pageErr) {
    logger.error({ err: pageErr.message, accountId: payload.account.id }, 'Error looking up page by zernio_account_id')
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  // i. Skip if !page || !page.agent_enabled
  if (!page || !page.agent_enabled) {
    logger.info({ accountId: payload.account.id, pageFound: !!page, agentEnabled: page?.agent_enabled }, 'Webhook ignored: page not found or agent disabled')
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
  try {
    const job = await queue.add(
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
    logger.info({ jobId: job.id, commentId: payload.comment.id, pageId: page.id }, 'Comment job enqueued')

    // Auto-save commenter as a contact (fire-and-forget, never block webhook response)
    try {
      const fromId = payload.comment?.from?.id || payload.comment?.author?.id || payload.from?.id
      const fromName = payload.comment?.from?.name || payload.comment?.author?.name || payload.from?.name || null
      const fromPicture = payload.comment?.from?.picture || payload.comment?.author?.picture || payload.from?.picture || null
      const accountId = payload.account?.id || payload.accountId

      const { data: pageRow } = await db
        .from('pages')
        .select('id, user_id')
        .eq('zernio_account_id', accountId)
        .maybeSingle()

      if (pageRow && fromId) {
        await db.from('contacts').upsert({
          user_id: pageRow.user_id,
          page_id: pageRow.id,
          platform_user_id: String(fromId),
          platform: 'facebook',
          name: fromName || null,
          picture: fromPicture || null,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'user_id,platform_user_id,platform' })

        await (db as any).rpc('increment_contact_count', {
          p_user_id: pageRow.user_id,
          p_platform_user_id: String(fromId),
          p_platform: 'facebook',
        }).catch(() => {})
      }
    } catch (contactErr) {
      logger.warn({ err: (contactErr as Error).message }, 'Failed to upsert contact (non-critical)')
    }
  } catch (queueErr) {
    logger.error({ err: (queueErr as Error).message, commentId: payload.comment.id }, 'Failed to enqueue comment job')
    return NextResponse.json({ error: 'Queue error' }, { status: 500 })
  }

  // l. Return {status: 'ok'}
  return NextResponse.json({ status: 'ok' })
}
