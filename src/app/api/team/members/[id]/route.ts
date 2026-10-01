import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminClient } from '@/lib/supabase/admin'

// Verify the target member belongs to this admin
async function verifyOwnership(db: ReturnType<typeof getAdminClient>, memberId: string, ownerId: string): Promise<boolean> {
  const { data } = await db
    .from('team_members')
    .select('id')
    .eq('member_id', memberId)
    .eq('owner_id', ownerId)
    .eq('is_managed', true)
    .limit(1)
    .maybeSingle()
  return !!data
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error

  const db = getAdminClient()
  const memberId = params.id

  const owned = await verifyOwnership(db, memberId, user.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { email, password, display_name, role } = await req.json()

  // Update auth user (email and/or password)
  const authUpdate: { email?: string; password?: string } = {}
  if (email?.trim()) authUpdate.email = email.trim().toLowerCase()
  if (password && password.length >= 6) authUpdate.password = password

  if (Object.keys(authUpdate).length > 0) {
    const { error: authErr } = await db.auth.admin.updateUserById(memberId, authUpdate)
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })
  }

  // Update profiles.full_name if display_name provided
  if (display_name !== undefined) {
    await db
      .from('profiles')
      .update({ full_name: display_name?.trim() || null })
      .eq('id', memberId)
  }

  // Update all team_members rows for this member (display_name + role)
  const updateFields: Record<string, unknown> = {}
  if (display_name !== undefined) updateFields.display_name = display_name?.trim() || null
  if (role && ['viewer', 'editor', 'reviewer'].includes(role)) updateFields.role = role
  if (email?.trim()) updateFields.member_email = email.trim().toLowerCase()

  if (Object.keys(updateFields).length > 0) {
    await db
      .from('team_members')
      .update(updateFields)
      .eq('member_id', memberId)
      .eq('owner_id', user.id)
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error

  const db = getAdminClient()
  const memberId = params.id

  const owned = await verifyOwnership(db, memberId, user.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Delete the auth user — this cascades to profiles (via trigger) and team_members (via FK ON DELETE CASCADE on member_id if set)
  const { error: authErr } = await db.auth.admin.deleteUser(memberId)
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  // Clean up team_members rows (in case ON DELETE SET NULL is used instead of CASCADE)
  await db
    .from('team_members')
    .delete()
    .eq('member_id', memberId)
    .eq('owner_id', user.id)

  return NextResponse.json({ ok: true })
}
