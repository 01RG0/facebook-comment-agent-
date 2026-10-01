import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// One-time backfill: create messenger_threads for contacts that have no thread yet.
// Uses comments_log to also seed the last message text/time.
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getAdminClient()

  // Get all contacts belonging to this admin's pages
  const { data: contacts, error: cErr } = await db
    .from('contacts')
    .select('id, user_id, page_id, platform_user_id, name, last_seen_at')
    .eq('user_id', user.id)

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  let created = 0
  let skipped = 0

  for (const contact of contacts ?? []) {
    // Check if thread already exists
    const { data: existing } = await db
      .from('messenger_threads')
      .select('id')
      .eq('page_id', contact.page_id)
      .eq('sender_id', contact.platform_user_id)
      .maybeSingle()

    if (existing) { skipped++; continue }

    // Try to find the last comment from this contact for message text
    const { data: lastComment } = await db
      .from('comments_log')
      .select('comment_text, ai_reply, created_at')
      .eq('page_id', contact.page_id)
      .eq('commenter_id', contact.platform_user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nowIso = lastComment?.created_at ?? contact.last_seen_at ?? new Date().toISOString()

    const { data: thread, error: tErr } = await db
      .from('messenger_threads')
      .insert({
        page_id: contact.page_id,
        user_id: contact.user_id,
        sender_id: contact.platform_user_id,
        sender_name: contact.name || null,
        last_message_at: nowIso,
        unread_count: 0,
        status: 'open',
      })
      .select('id')
      .single()

    if (tErr) {
      logger.warn({ err: tErr.message, contactId: contact.id }, 'Backfill thread insert failed')
      continue
    }

    // Seed the comment and AI reply as messages
    if (lastComment && thread?.id) {
      if (lastComment.comment_text) {
        await db.from('messenger_messages').upsert({
          thread_id: thread.id,
          fb_message_id: `backfill-comment-${contact.platform_user_id}-${contact.page_id}`,
          direction: 'inbound',
          text: lastComment.comment_text,
          sent_at: lastComment.created_at,
        }, { onConflict: 'fb_message_id', ignoreDuplicates: true })
      }
      if (lastComment.ai_reply) {
        await db.from('messenger_messages').insert({
          thread_id: thread.id,
          direction: 'outbound',
          text: lastComment.ai_reply,
          sent_by_label: 'ai',
          sent_at: lastComment.created_at,
        })
      }
    }

    created++
  }

  logger.info({ created, skipped }, 'Inbox backfill complete')
  return NextResponse.json({ ok: true, created, skipped })
}
