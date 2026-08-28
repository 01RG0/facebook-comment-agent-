import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/crypto'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { providerId: string } }
) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json()
  const { display_name, provider_type, base_url, default_model, api_key, is_enabled, sort_order, notes } = body

  const db = getAdminClient()
  const update: Record<string, unknown> = {}
  if (display_name !== undefined) update.display_name = display_name
  if (provider_type !== undefined) update.provider_type = provider_type
  if (base_url !== undefined) update.base_url = base_url
  if (default_model !== undefined) update.default_model = default_model
  if (is_enabled !== undefined) update.is_enabled = is_enabled
  if (sort_order !== undefined) update.sort_order = sort_order
  if (notes !== undefined) update.notes = notes

  if (api_key) {
    const { enc, iv } = encrypt(api_key)
    update.api_key_enc = enc
    update.api_key_iv = iv
  }

  const { data, error } = await db
    .from('custom_ai_providers')
    .update(update)
    .eq('id', params.providerId)
    .select('id, name, display_name, provider_type, base_url, default_model, is_enabled, sort_order, notes, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { providerId: string } }
) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const db = getAdminClient()
  const { error } = await db.from('custom_ai_providers').delete().eq('id', params.providerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
