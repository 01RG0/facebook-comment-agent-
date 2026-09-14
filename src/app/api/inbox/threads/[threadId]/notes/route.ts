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

    const { data: notes, error } = await adminDb
      .from('messenger_notes')
      .select(
        `
        *,
        author:profiles(id, full_name, email, avatar_url)
      `
      )
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ notes: notes ?? [] })
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
    const mentions = Array.isArray(body.mentions) ? body.mentions.map(String) : []

    const { data: note, error: insertError } = await adminDb
      .from('messenger_notes')
      .insert({
        thread_id: threadId,
        author_id: user.id,
        text,
        mentions,
      })
      .select(
        `
        *,
        author:profiles(id, full_name, email, avatar_url)
      `
      )
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Insert thread_event for note_added
    await adminDb.from('thread_events').insert({
      thread_id: threadId,
      actor_id: user.id,
      event_type: 'note_added',
      payload: { note_id: note.id, text_snippet: text.slice(0, 50), mentions },
    })

    return NextResponse.json({ note }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
