import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/crypto'

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const db = getAdminClient()
  const { data, error } = await db
    .from('custom_ai_providers')
    .select('id, name, display_name, provider_type, base_url, default_model, is_enabled, sort_order, notes, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Signal whether a system key is set without exposing it
  const withKeyFlag = (data ?? []).map((row: any) => ({ ...row, has_system_key: false }))
  // Re-query for key presence (separate to avoid returning encrypted data in the list)
  const { data: keyRows } = await db
    .from('custom_ai_providers')
    .select('id, api_key_enc')
  const keySet = new Set((keyRows ?? []).filter((r: any) => r.api_key_enc).map((r: any) => r.id))

  return NextResponse.json(withKeyFlag.map((r: any) => ({ ...r, has_system_key: keySet.has(r.id) })))
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json()
  const { name, display_name, provider_type, base_url, default_model, api_key, is_enabled, sort_order, notes } = body

  if (!name || !display_name) {
    return NextResponse.json({ error: 'name and display_name are required' }, { status: 400 })
  }

  const db = getAdminClient()
  const row: Record<string, unknown> = {
    name, display_name,
    provider_type: provider_type ?? 'openai-compat',
    base_url: base_url ?? null,
    default_model: default_model ?? null,
    is_enabled: is_enabled ?? true,
    sort_order: sort_order ?? 0,
    notes: notes ?? null,
  }

  if (api_key) {
    const { enc, iv } = encrypt(api_key)
    row.api_key_enc = enc
    row.api_key_iv = iv
  }

  const { data, error } = await db.from('custom_ai_providers').insert(row).select('id, name, display_name, provider_type, base_url, default_model, is_enabled, sort_order, notes').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
