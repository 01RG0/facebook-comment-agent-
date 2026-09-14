import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Params {
  params: {
    id: string
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: sequence, error } = await supabase
    .from('sequences')
    .select(`
      *,
      sequence_steps (
        id,
        step_number,
        delay_hours,
        message_template
      ),
      sequence_enrollments (
        id,
        contact_id,
        current_step,
        next_step_at,
        status,
        enrolled_at,
        contacts (
          id,
          name,
          picture,
          platform_user_id
        )
      )
    `)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!sequence) {
    return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })
  }

  // Sort steps by step_number
  if (Array.isArray(sequence.sequence_steps)) {
    sequence.sequence_steps.sort((a: any, b: any) => a.step_number - b.step_number)
  }

  return NextResponse.json({ sequence })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const updates: Record<string, any> = {}

    if (body.name !== undefined) updates.name = body.name
    if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active)
    if (body.trigger !== undefined) updates.trigger = body.trigger

    const { data: sequence, error } = await supabase
      .from('sequences')
      .update(updates)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ sequence })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('sequences')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
