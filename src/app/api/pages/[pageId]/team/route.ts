import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getAuthorizedPage(supabase: ReturnType<typeof createClient>, pageId: string, userId: string) {
  const { data } = await supabase
    .from('pages')
    .select('id')
    .eq('id', pageId)
    .eq('user_id', userId)
    .single()
  return data
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { pageId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const page = await getAuthorizedPage(supabase, params.pageId, user.id)
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data } = await supabase
    .from('team_members')
    .select('id, member_email, role, invited_at, accepted_at')
    .eq('page_id', params.pageId)
    .order('invited_at', { ascending: false })

  return NextResponse.json(data ?? [])
}

export async function POST(
  req: NextRequest,
  { params }: { params: { pageId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const page = await getAuthorizedPage(supabase, params.pageId, user.id)
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { member_email, role } = await req.json()
  if (!member_email) return NextResponse.json({ error: 'member_email required' }, { status: 400 })
  if (!['viewer', 'editor'].includes(role ?? 'viewer')) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('team_members')
    .insert({ page_id: params.pageId, owner_id: user.id, member_email, role: role ?? 'viewer' })
    .select('id, member_email, role, invited_at, accepted_at')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Member already invited' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { pageId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const page = await getAuthorizedPage(supabase, params.pageId, user.id)
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { memberId } = await req.json()
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 })

  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', memberId)
    .eq('page_id', params.pageId)
    .eq('owner_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
