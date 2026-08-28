import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminClient } from '@/lib/supabase/admin'

export async function PUT(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json()
  const {
    max_requests_per_day,
    max_tokens_per_day,
    max_requests_per_month,
    max_tokens_per_month,
    is_suspended,
    notes,
  } = body

  const db = getAdminClient()

  const { data, error } = await db
    .from('usage_limits')
    .upsert({
      user_id: params.userId,
      max_requests_per_day: max_requests_per_day ?? null,
      max_tokens_per_day: max_tokens_per_day ?? null,
      max_requests_per_month: max_requests_per_month ?? null,
      max_tokens_per_month: max_tokens_per_month ?? null,
      is_suspended: is_suspended ?? false,
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const db = getAdminClient()
  await db.from('usage_limits').delete().eq('user_id', params.userId)
  return NextResponse.json({ success: true })
}
