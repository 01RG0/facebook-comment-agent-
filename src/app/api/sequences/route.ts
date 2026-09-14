import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: sequences, error } = await supabase
    .from('sequences')
    .select('*, sequence_steps(count), sequence_enrollments(count)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ sequences: sequences || [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, page_id, trigger, steps } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Sequence name is required' }, { status: 400 })
    }

    // Insert sequence
    const { data: sequence, error: seqError } = await supabase
      .from('sequences')
      .insert({
        user_id: user.id,
        name: name.trim(),
        page_id: page_id || null,
        trigger: trigger || 'comment_replied',
      })
      .select()
      .single()

    if (seqError || !sequence) {
      return NextResponse.json({ error: seqError?.message || 'Failed to create sequence' }, { status: 500 })
    }

    // Insert steps if provided
    if (Array.isArray(steps) && steps.length > 0) {
      const stepRows = steps.map((s: any, idx: number) => ({
        sequence_id: sequence.id,
        step_number: s.step_number ?? idx + 1,
        delay_hours: typeof s.delay_hours === 'number' ? s.delay_hours : parseInt(s.delay_hours, 10) || 24,
        message_template: s.message_template || '',
      }))

      const { error: stepsError } = await supabase.from('sequence_steps').insert(stepRows)
      if (stepsError) {
        return NextResponse.json({ error: stepsError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ sequence })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
