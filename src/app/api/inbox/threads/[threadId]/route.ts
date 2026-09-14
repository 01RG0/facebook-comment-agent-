import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

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

    // Parallel fetch messages, notes, events, assigned profile
    const [messagesRes, notesRes, eventsRes, assignedProfileRes] = await Promise.all([
      adminDb
        .from('messenger_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('sent_at', { ascending: true }),
      adminDb
        .from('messenger_notes')
        .select(
          `
          *,
          author:profiles(id, full_name, email, avatar_url)
        `
        )
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true }),
      adminDb
        .from('thread_events')
        .select(
          `
          *,
          actor:profiles(id, full_name, email, avatar_url)
        `
        )
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true }),
      thread.assigned_to
        ? adminDb
            .from('profiles')
            .select('id, full_name, email, avatar_url')
            .eq('id', thread.assigned_to)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const threadDetail = {
      ...thread,
      assigned_profile: assignedProfileRes.data ?? null,
      messages: messagesRes.data ?? [],
      notes: notesRes.data ?? [],
      events: eventsRes.data ?? [],
    }

    return NextResponse.json(threadDetail)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
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
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { status, priority, assigned_to, labels } = body

    const updates: Record<string, any> = {}
    const eventsToInsert: Array<{
      thread_id: string
      actor_id: string
      event_type: string
      payload: Record<string, any>
    }> = []

    if (status !== undefined) {
      const allowedStatus = ['open', 'in_progress', 'resolved', 'snoozed']
      if (!allowedStatus.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${allowedStatus.join(', ')}` },
          { status: 400 }
        )
      }
      if (status !== thread.status) {
        updates.status = status
        eventsToInsert.push({
          thread_id: threadId,
          actor_id: user.id,
          event_type: 'status_changed',
          payload: { old_status: thread.status, new_status: status },
        })
      }
    }

    if (priority !== undefined) {
      const allowedPriority = ['normal', 'urgent']
      if (!allowedPriority.includes(priority)) {
        return NextResponse.json(
          { error: `Invalid priority. Must be one of: ${allowedPriority.join(', ')}` },
          { status: 400 }
        )
      }
      if (priority !== thread.priority) {
        updates.priority = priority
        eventsToInsert.push({
          thread_id: threadId,
          actor_id: user.id,
          event_type: 'priority_changed',
          payload: { old_priority: thread.priority, new_priority: priority },
        })
      }
    }

    if (assigned_to !== undefined) {
      if (assigned_to !== null && typeof assigned_to === 'string') {
        const { data: assigneeProfile } = await adminDb
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', assigned_to)
          .maybeSingle()

        if (!assigneeProfile) {
          return NextResponse.json({ error: 'Assignee profile not found' }, { status: 400 })
        }
      }

      if (assigned_to !== thread.assigned_to) {
        updates.assigned_to = assigned_to
        eventsToInsert.push({
          thread_id: threadId,
          actor_id: user.id,
          event_type: 'assigned',
          payload: { old_assigned_to: thread.assigned_to, new_assigned_to: assigned_to },
        })
      }
    }

    if (labels !== undefined) {
      if (!Array.isArray(labels)) {
        return NextResponse.json({ error: 'labels must be an array of strings' }, { status: 400 })
      }
      const stringLabels = labels.map(String)
      updates.labels = stringLabels
      eventsToInsert.push({
        thread_id: threadId,
        actor_id: user.id,
        event_type: 'labels_updated',
        payload: { old_labels: thread.labels ?? [], new_labels: stringLabels },
      })
    }

    if (body.snoozed_until !== undefined) {
      updates.snoozed_until = body.snoozed_until
      eventsToInsert.push({
        thread_id: threadId,
        actor_id: user.id,
        event_type: 'snoozed',
        payload: { old_snoozed_until: thread.snoozed_until, new_snoozed_until: body.snoozed_until },
      })
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await adminDb
        .from('messenger_threads')
        .update(updates)
        .eq('id', threadId)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    if (eventsToInsert.length > 0) {
      const { error: eventsError } = await adminDb.from('thread_events').insert(eventsToInsert)
      if (eventsError) {
        // Log error but non-fatal for thread update
        console.error('Failed to insert thread events:', eventsError)
      }
    }

    // Fetch updated thread
    const { data: updatedThread } = await adminDb
      .from('messenger_threads')
      .select(
        `
        *,
        assigned_profile:profiles!messenger_threads_assigned_to_fkey(
          id,
          full_name,
          email,
          avatar_url
        )
      `
      )
      .eq('id', threadId)
      .single()

    return NextResponse.json({ thread: updatedThread })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
