import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin-auth'
import TeamManager from '@/components/team-manager'
import RolePermissions from '@/components/role-permissions'

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin && !isAdminEmail(user.email)) {
    redirect('/dashboard')
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <TeamManager />
      <RolePermissions />
    </div>
  )
}
