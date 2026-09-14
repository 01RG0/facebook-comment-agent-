import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim()

  let query = supabase
    .from('contacts')
    .select('*, pages(page_name)')
    .eq('user_id', user.id)
    .order('last_seen_at', { ascending: false })
    .limit(100)

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data: contacts, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ contacts: contacts || [] })
}
