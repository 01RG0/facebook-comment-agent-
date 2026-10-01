import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/role-permissions'

export async function GET() {
  const { user, error } = await requireAdmin()
  if (error) return error

  const supabase = createClient()
  const { data, error: dbErr } = await supabase
    .from('owner_role_permissions')
    .select('role, allowed_pages')
    .eq('owner_id', user.id)

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  // Merge DB rows with defaults so every role is always present
  const result: Record<string, string[]> = { ...DEFAULT_ROLE_PERMISSIONS }
  for (const row of data ?? []) {
    result[row.role] = row.allowed_pages
  }

  return NextResponse.json(result)
}

export async function PUT(req: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error

  const body = await req.json()
  const validRoles = ['viewer', 'editor', 'reviewer']
  const validPages = ['pages', 'comments', 'reviews', 'contacts', 'sequences', 'inbox', 'handoff', 'activity', 'analytics', 'dlq', 'ai-keys', 'settings']

  const supabase = createClient()

  for (const role of validRoles) {
    if (!Array.isArray(body[role])) continue
    const pages = body[role].filter((p: unknown) => typeof p === 'string' && validPages.includes(p))

    await supabase
      .from('owner_role_permissions')
      .upsert(
        { owner_id: user.id, role, allowed_pages: pages, updated_at: new Date().toISOString() },
        { onConflict: 'owner_id,role' }
      )
  }

  return NextResponse.json({ ok: true })
}
