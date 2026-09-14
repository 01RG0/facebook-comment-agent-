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
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { assignee_id } = body
    if (assignee_id === undefined) {
      return NextResponse.json({ error: 'assignee_id is required' }, { status: 400 })
    }

    if (assignee_id !== null) {
      const { data: assigneeProfile } = await adminDb
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', assignee_id)
        .maybeSingle()

      if (!assigneeProfile) {
        return NextResponse.json({ error: 'Assignee profile not found' }, { status: 404 })
      }
    }

    // Update assigned_to
    const { data: updatedThread, error: updateError } = await adminDb
      .from('messenger_threads')
      .update({ assigned_to: assignee_id })
      .eq('id', threadId)
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
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Insert thread_event with event_type='assigned'
    await adminDb.from('thread_events').insert({
      thread_id: threadId,
      actor_id: user.id,
      event_type: 'assigned',
      payload: { old_assigned_to: thread.assigned_to, new_assigned_to: assignee_id },
    })

    return NextResponse.json({ thread: updatedThread })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
