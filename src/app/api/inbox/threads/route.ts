import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const pageIdFilter = searchParams.get('page_id')
    const statusFilter = searchParams.get('status')
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10) || 50))
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0)

    // Verify user has access to pages: owned or team member
    // If page_id is specified, verify user has access to this specific page
    const adminDb = getAdminClient() as any

    let accessiblePageIds: string[] = []
    if (pageIdFilter) {
      // Check ownership or team membership
      const { data: page } = await adminDb
        .from('pages')
        .select('id')
        .eq('id', pageIdFilter)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!page) {
        const { data: teamMember } = await adminDb
          .from('team_members')
          .select('page_id')
          .eq('page_id', pageIdFilter)
          .eq('member_id', user.id)
          .maybeSingle()

        if (!teamMember) {
          return NextResponse.json({ error: 'Page not found or access denied' }, { status: 403 })
        }
      }
      accessiblePageIds = [pageIdFilter]
    } else {
      // Get all accessible pages
      const { data: ownedPages } = await adminDb
        .from('pages')
        .select('id')
        .eq('user_id', user.id)

      const { data: teamPages } = await adminDb
        .from('team_members')
        .select('page_id')
        .eq('member_id', user.id)

      const ids = new Set<string>()
      ownedPages?.forEach((p: { id: string }) => ids.add(p.id))
      teamPages?.forEach((p: { page_id: string }) => ids.add(p.page_id))
      accessiblePageIds = Array.from(ids)

      if (accessiblePageIds.length === 0) {
        return NextResponse.json({ threads: [], count: 0 })
      }
    }

    // Build query with assigned profile joined
    let query = adminDb
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
      `,
        { count: 'exact' }
      )
      .in('page_id', accessiblePageIds)

    const searchQuery = searchParams.get('search')?.trim()

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    if (searchQuery) {
      query = query.ilike('sender_name', `%${searchQuery}%`)
    }

    query = query
      .order('last_message_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: rawThreads, error, count } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const threadList = rawThreads ?? []
    const threadIds = threadList.map((t: any) => t.id)

    // Fetch latest message for each thread to provide last_message preview
    let latestMessagesMap: Record<string, any> = {}
    if (threadIds.length > 0) {
      const { data: messages } = await adminDb
        .from('messenger_messages')
        .select('id, thread_id, direction, text, sent_by_label, sent_at')
        .in('thread_id', threadIds)
        .order('sent_at', { ascending: false })

      if (messages) {
        for (const msg of messages) {
          if (!latestMessagesMap[msg.thread_id]) {
            latestMessagesMap[msg.thread_id] = msg
          }
        }
      }
    }

    const threadsWithPreview = threadList.map((t: any) => ({
      ...t,
      last_message: latestMessagesMap[t.id] ?? null,
    }))

    return NextResponse.json({
      threads: threadsWithPreview,
      count: count ?? 0,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { page_id, sender_id, sender_name, sender_avatar } = body
    if (!page_id || !sender_id) {
      return NextResponse.json({ error: 'page_id and sender_id are required' }, { status: 400 })
    }

    const adminDb = getAdminClient() as any

    // Verify user owns or is team member of this page
    const { data: page } = await adminDb
      .from('pages')
      .select('id, user_id')
      .eq('id', page_id)
      .maybeSingle()

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    let hasAccess = page.user_id === user.id
    if (!hasAccess) {
      const { data: member } = await adminDb
        .from('team_members')
        .select('page_id')
        .eq('page_id', page_id)
        .eq('member_id', user.id)
        .maybeSingle()
      if (member) {
        hasAccess = true
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Upsert thread on (page_id, sender_id)
    // Note: user_id references profiles(id) and represents the page owner or primary account
    const upsertData: Record<string, any> = {
      page_id,
      user_id: page.user_id,
      sender_id: String(sender_id),
      updated_at: new Date().toISOString(),
    }
    if (sender_name !== undefined) upsertData.sender_name = sender_name
    if (sender_avatar !== undefined) upsertData.sender_avatar = sender_avatar

    const { data: thread, error: upsertError } = await adminDb
      .from('messenger_threads')
      .upsert(upsertData, {
        onConflict: 'page_id,sender_id',
      })
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

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({ thread }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
