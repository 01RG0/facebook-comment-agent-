import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { fetchZernioConversations, fetchZernioMessages } from '@/lib/zernio/client'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// Backfill: sync all Zernio conversations + messages into messenger_threads/messages.
// Any authenticated account owner can run this for their own pages.
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getAdminClient()

  // Get all pages for this user that have a Zernio account
  const { data: pages, error: pErr } = await db
    .from('pages')
    .select('id, user_id, zernio_account_id')
    .eq('user_id', user.id)
    .not('zernio_account_id', 'is', null)

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  let created = 0
  let synced = 0
  let skipped = 0

  for (const page of pages ?? []) {
    const zernioAccountId = page.zernio_account_id!

    // Fetch all conversations from Zernio for this page
    const conversations = await fetchZernioConversations(zernioAccountId)
    logger.info({ pageId: page.id, count: conversations.length }, 'Fetched Zernio conversations')

    for (const conv of conversations) {
      const participantId = conv.participantId
      const participantName = conv.participantName
      const lastAt = conv.updatedTime ?? new Date().toISOString()

      // Upsert thread
      const { data: thread, error: tErr } = await db
        .from('messenger_threads')
        .upsert(
          {
            page_id: page.id,
            user_id: page.user_id,
            sender_id: participantId,
            sender_name: participantName || null,
            last_message_at: lastAt,
            unread_count: conv.unreadCount ?? 0,
            status: 'open',
          },
          { onConflict: 'page_id,sender_id' }
        )
        .select('id')
        .single()

      if (tErr || !thread) {
        logger.warn({ err: tErr?.message, participantId }, 'Backfill thread upsert failed')
        skipped++
        continue
      }

      // Fetch and sync messages from Zernio
      const messages = await fetchZernioMessages(participantId, zernioAccountId, 100)
      if (messages.length > 0) {
        const rows = messages.map((m) => ({
          thread_id: thread.id,
          fb_message_id: m.id,
          direction: m.direction === 'incoming' ? 'inbound' : 'outbound',
          text: m.message,
          sent_by_label: m.direction === 'outgoing'
            ? (m.sentVia === 'ai' || (m as any).metadata?.sentVia === 'ai' ? 'ai' : 'human')
            : null,
          sent_at: m.sentAt || m.createdAt,
        }))
        const { error: msgErr } = await db
          .from('messenger_messages')
          .upsert(rows, { onConflict: 'fb_message_id', ignoreDuplicates: true })

        if (msgErr) {
          logger.warn({ err: msgErr.message, threadId: thread.id }, 'Backfill message upsert failed')
        } else {
          synced += rows.length
        }
        created++
      } else {
        created++
      }
    }
  }

  logger.info({ created, synced, skipped }, 'Inbox backfill from Zernio complete')
  return NextResponse.json({ ok: true, conversations: created, messages: synced, skipped })
}
