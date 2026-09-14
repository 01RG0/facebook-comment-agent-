import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Params {
  params: {
    id: string
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { contactId } = await req.json()
    if (!contactId) {
      return NextResponse.json({ error: 'contactId is required' }, { status: 400 })
    }

    // Ownership check on the sequence
    const { data: sequence, error: seqErr } = await supabase
      .from('sequences')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (seqErr || !sequence) {
      return NextResponse.json({ error: 'Sequence not found or unauthorized' }, { status: 404 })
    }

    // Get step 1 delay
    const { data: step1, error: stepErr } = await supabase
      .from('sequence_steps')
      .select('delay_hours')
      .eq('sequence_id', params.id)
      .eq('step_number', 1)
      .maybeSingle()

    const delayHours = step1?.delay_hours ?? 24
    const nextStepAt = new Date(Date.now() + delayHours * 3600000).toISOString()

    const { data: enrollment, error: enrollErr } = await supabase
      .from('sequence_enrollments')
      .insert({
        sequence_id: params.id,
        contact_id: contactId,
        current_step: 1,
        next_step_at: nextStepAt,
        status: 'active',
      })
      .select()
      .single()

    if (enrollErr) {
      return NextResponse.json({ error: enrollErr.message }, { status: 500 })
    }

    return NextResponse.json({ enrollment })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
