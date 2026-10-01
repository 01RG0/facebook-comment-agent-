import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { fetchZernioConversations, fetchZernioMessages } from '@/lib/zernio/client'
import { processDmJob } from '@/lib/queue/dm-worker'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// Lightweight auto-sync: fetches recent Zernio conversations, upserts messages,
// and fires processDmJob for any new inbound messages that have no outbound reply yet.
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getAdminClient()

  const { data: pages } = await db
    .from('pages')
    .select('id, user_id, zernio_account_id')
    .eq('user_id', user.id)
    .not('zernio_account_id', 'is', null)

  let newMessages = 0
  let aiTriggered = 0

  for (const page of pages ?? []) {
    const zernioAccountId = page.zernio_account_id!

    let conversations: Awaited<ReturnType<typeof fetchZernioConversations>>
    try {
      conversations = await fetchZernioConversations(zernioAccountId, 50)
    } catch (err: any) {
      logger.warn({ err: err?.message, pageId: page.id }, 'auto-sync: failed to fetch conversations')
      continue
    }

    for (const conv of conversations) {
      const participantId = conv.participantId
      const participantName = conv.participantName
      const lastAt = conv.updatedTime ?? new Date().toISOString()

      // Upsert thread
      const { data: thread } = await db
        .from('messenger_threads')
        .upsert(
          {
            page_id: page.id,
            user_id: page.user_id,
            sender_id: participantId,
            sender_name: participantName || null,
            last_message_at: lastAt,
            status: 'open',
          },
          { onConflict: 'page_id,sender_id', ignoreDuplicates: false }
        )
        .select('id, unread_count')
        .single()

      if (!thread) continue

      // Fetch messages from Zernio
      let zernioMsgs: Awaited<ReturnType<typeof fetchZernioMessages>>
      try {
        zernioMsgs = await fetchZernioMessages(participantId, zernioAccountId, 50)
      } catch {
        continue
      }

      if (zernioMsgs.length === 0) continue

      // Find which messages are new (not yet in DB)
      const fbIds = zernioMsgs.map(m => m.id).filter(Boolean)
      const { data: existing } = await db
        .from('messenger_messages')
        .select('fb_message_id')
        .eq('thread_id', thread.id)
        .in('fb_message_id', fbIds)

      const existingIds = new Set((existing ?? []).map(r => r.fb_message_id))
      const newMsgs = zernioMsgs.filter(m => m.id && !existingIds.has(m.id))

      if (newMsgs.length > 0) {
        const rows = newMsgs.map(m => ({
          thread_id: thread.id,
          fb_message_id: m.id,
          direction: m.direction === 'incoming' ? 'inbound' : 'outbound',
          text: m.message,
          sent_by_label: m.direction === 'outgoing'
            ? (m.sentVia === 'ai' || (m as any).metadata?.sentVia === 'ai' ? 'ai' : 'human')
            : null,
          sent_at: m.sentAt || m.createdAt,
        }))
        await db.from('messenger_messages').upsert(rows, { onConflict: 'fb_message_id', ignoreDuplicates: true })
        newMessages += newMsgs.length

        // Check if there's a new inbound message with no outbound reply after it
        const newInbound = newMsgs.filter(m => m.direction === 'incoming')
        if (newInbound.length > 0) {
          // Check if thread already has an outbound message after the latest inbound
          const latestInbound = newInbound.sort((a, b) =>
            new Date(b.sentAt || b.createdAt || 0).getTime() - new Date(a.sentAt || a.createdAt || 0).getTime()
          )[0]
          const latestInboundTime = latestInbound.sentAt || latestInbound.createdAt

          const { data: outboundAfter } = await db
            .from('messenger_messages')
            .select('id')
            .eq('thread_id', thread.id)
            .eq('direction', 'outbound')
            .gt('sent_at', latestInboundTime)
            .limit(1)
            .maybeSingle()

          if (!outboundAfter) {
            // No reply yet — fire AI
            processDmJob({
              threadId: thread.id,
              pageId: page.id,
              senderId: participantId,
              senderName: participantName || 'Facebook User',
              message: latestInbound.message || '',
            }).catch(err => {
              logger.error({ err: err?.message, threadId: thread.id }, 'auto-sync: DM job error')
            })
            aiTriggered++
          }
        }
      }
    }
  }

  logger.info({ newMessages, aiTriggered }, 'Inbox auto-sync complete')
  return NextResponse.json({ ok: true, newMessages, aiTriggered })
}
