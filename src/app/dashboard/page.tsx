import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardHome from './dashboard-home'

export const metadata: Metadata = { title: 'Pages' }

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { count } = await supabase
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', user.id)
  if ((count ?? 0) > 0) redirect('/dashboard/handoff')

  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'there'
  const firstName = fullName.split(' ')[0]

  return <DashboardHome firstName={firstName} />
}
