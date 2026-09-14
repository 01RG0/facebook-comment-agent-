import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function requireAdmin(): Promise<
  { user: { id: string; email: string }; error: null } |
  { user: null; error: NextResponse }
> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return { user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user: { id: user.id, email: user.email }, error: null }
}

export async function isAdminUser(userId: string): Promise<boolean> {
  const supabase = createClient()
  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single()
  return data?.is_admin === true
}

// Sync helper for layouts — checks env var as fast path, DB as fallback
export function isAdminEmail(email: string | undefined): boolean {
  const adminEmail = process.env.ADMIN_EMAIL
  return !!adminEmail && email === adminEmail
}
