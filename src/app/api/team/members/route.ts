import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const { user, error } = await requireAdmin()
  if (error) return error

  const db = getAdminClient()

  const { data: rows, error: dbErr } = await db
    .from('team_members')
    .select('id, member_id, member_email, display_name, role, invited_at, page_id')
    .eq('owner_id', user.id)
    .eq('is_managed', true)
    .order('invited_at', { ascending: false })

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  // Deduplicate by member_id — return one entry per unique user
  const seen = new Set<string>()
  const members: {
    memberId: string
    email: string
    displayName: string | null
    role: string
    createdAt: string
    pageCount: number
  }[] = []

  for (const row of rows ?? []) {
    if (!row.member_id || seen.has(row.member_id)) continue
    seen.add(row.member_id)
    const pageCount = (rows ?? []).filter(r => r.member_id === row.member_id).length
    members.push({
      memberId: row.member_id,
      email: row.member_email,
      displayName: row.display_name,
      role: row.role,
      createdAt: row.invited_at,
      pageCount,
    })
  }

  return NextResponse.json(members)
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error

  const { email, password, display_name, role } = await req.json()
  if (!email?.trim()) return NextResponse.json({ error: 'email required' }, { status: 400 })
  if (!password || password.length < 6) return NextResponse.json({ error: 'password must be at least 6 characters' }, { status: 400 })
  const validRoles = ['viewer', 'editor', 'reviewer']
  const memberRole = validRoles.includes(role) ? role : 'reviewer'

  const db = getAdminClient()

  // Create auth user
  const { data: authData, error: authErr } = await db.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name: display_name?.trim() || '' },
  })

  if (authErr) {
    if (authErr.message?.includes('already registered')) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: authErr.message }, { status: 500 })
  }

  const newUserId = authData.user.id

  // Get all pages owned by this admin
  const { data: pages } = await db
    .from('pages')
    .select('id')
    .eq('user_id', user.id)

  // Insert team_members rows for each page (pre-accepted since admin created the account)
  if (pages && pages.length > 0) {
    const now = new Date().toISOString()
    const rows = pages.map(p => ({
      page_id: p.id,
      owner_id: user.id,
      member_id: newUserId,
      member_email: email.trim().toLowerCase(),
      display_name: display_name?.trim() || null,
      role: memberRole,
      is_managed: true,
      invited_at: now,
      accepted_at: now,
    }))

    await db
      .from('team_members')
      .upsert(rows, { onConflict: 'page_id,member_email' })
  }

  return NextResponse.json({
    memberId: newUserId,
    email: email.trim().toLowerCase(),
    displayName: display_name?.trim() || null,
    role: memberRole,
    createdAt: new Date().toISOString(),
    pageCount: pages?.length ?? 0,
  }, { status: 201 })
}
