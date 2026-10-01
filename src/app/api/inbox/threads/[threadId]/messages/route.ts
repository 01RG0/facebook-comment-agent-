import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendZernioConversationMessage, fetchZernioMessages } from '@/lib/zernio/client'

async function verifyThreadAccess(threadId: string, userId: string) {
  const adminDb = getAdminClient() as any

  const { data: thread, error } = await adminDb
    .from('messenger_threads')
    .select(
      `
      *,
      page:pages(id, user_id, page_name, fb_page_id, zernio_account_id)
    `
    )
    .eq('id', threadId)
    .maybeSingle()

  if (error || !thread) {
    return { error: 'Thread not found', status: 404, thread: null, adminDb }
  }

  const page = thread.page
  let hasAccess = thread.user_id === userId || (page && page.user_id === userId)
  if (!hasAccess && page) {
    const { data: member } = await adminDb
      .from('team_members')
      .select('page_id, role')
      .eq('page_id', page.id)
      .eq('member_id', userId)
      .maybeSingle()

    if (member) {
      hasAccess = true
    }
  }

  if (!hasAccess) {
    return { error: 'Forbidden', status: 403, thread: null, adminDb }
  }

  return { error: null, status: 200, thread, adminDb }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const supabase = createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { threadId } = params
    const { error: accessErr, status: accessStatus, thread, adminDb } = await verifyThreadAccess(
      threadId,
      user.id
    )

    if (accessErr || !thread) {
      return NextResponse.json({ error: accessErr }, { status: accessStatus })
    }

    // Auto-sync messages from Zernio before returning (fills gaps from missed webhooks)
    const page = thread.page
    if (page?.zernio_account_id && thread.sender_id) {
      const zernioMsgs = await fetchZernioMessages(thread.sender_id, page.zernio_account_id, 100)
      if (zernioMsgs.length > 0) {
        const rows = zernioMsgs.map((m) => ({
          thread_id: threadId,
          fb_message_id: m.id,
          direction: m.direction === 'incoming' ? 'inbound' : 'outbound',
          text: m.message,
          sent_by_label: m.direction === 'outgoing'
            ? (m.sentVia === 'ai' || m.metadata?.sentVia === 'ai' ? 'ai' : 'human')
            : null,
          sent_at: m.sentAt || m.createdAt,
        }))
        await adminDb.from('messenger_messages').upsert(rows, { onConflict: 'fb_message_id', ignoreDuplicates: true })
      }
    }

    const { data: messages, error } = await adminDb
      .from('messenger_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('sent_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ messages: messages ?? [] })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const supabase = createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { threadId } = params
    const { error: accessErr, status: accessStatus, thread, adminDb } = await verifyThreadAccess(
      threadId,
      user.id
    )

    if (accessErr || !thread) {
      return NextResponse.json({ error: accessErr }, { status: accessStatus })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body.text !== 'string' || !body.text.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    const text = body.text.trim()
    const page = thread.page
    const accountId = page?.zernio_account_id ?? ''

    // Run Zernio send and profile fetch in parallel — both are independent
    const [zernioResult, profileResult] = await Promise.allSettled([
      accountId
        ? sendZernioConversationMessage(thread.sender_id, accountId, text)
        : Promise.resolve(null),
      adminDb.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle(),
    ])

    if (zernioResult.status === 'rejected') {
      return NextResponse.json(
        { error: `Failed to send reply via Zernio: ${zernioResult.reason?.message || 'Platform error'}` },
        { status: 502 }
      )
    }

    const zernioMsgId = (zernioResult.value as any)?.messageId ?? null
    const profile = profileResult.status === 'fulfilled' ? profileResult.value?.data : null
    const sentByLabel = profile?.full_name?.trim() || profile?.email || 'Agent'

    // Insert outbound message row
    const { data: message, error: insertError } = await adminDb
      .from('messenger_messages')
      .insert({
        thread_id: threadId,
        fb_message_id: zernioMsgId,
        direction: 'outbound',
        text,
        sent_by: user.id,
        sent_by_label: sentByLabel,
        delivered_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Fire-and-forget thread update + event — don't block the response
    const nowIso = new Date().toISOString()
    const threadUpdates: Record<string, any> = { last_message_at: nowIso }
    if (thread.status === 'open') threadUpdates.status = 'in_progress'

    Promise.all([
      adminDb.from('messenger_threads').update(threadUpdates).eq('id', threadId),
      adminDb.from('thread_events').insert({
        thread_id: threadId,
        actor_id: user.id,
        event_type: 'message_sent',
        payload: { message_id: message.id, direction: 'outbound' },
      }),
    ]).catch(() => {})

    return NextResponse.json({ message }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
