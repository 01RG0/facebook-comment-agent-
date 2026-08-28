import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS. Only used in the worker process.
// Never import this file from Next.js API routes or client code.
let _admin: SupabaseClient | null = null

export function getAdminClient(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _admin
}
