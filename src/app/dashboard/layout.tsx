import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/dashboard-nav'
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/role-permissions'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const fetchLayoutData = unstable_cache(
    async (userId: string) => {
      const [profileResult, teamMemberResult] = await Promise.all([
        supabase.from('profiles').select('full_name, email, avatar_url, is_admin').eq('id', userId).single(),
        supabase.from('team_members').select('id, role, owner_id').eq('member_id', userId),
      ])
      return { profileResult, teamMemberResult }
    },
    ['dashboard-layout'],
    { revalidate: 60 }
  )

  const { profileResult, teamMemberResult } = await fetchLayoutData(user.id)

  const teamMemberships = teamMemberResult.data ?? []
  const isTeamMember = teamMemberships.length > 0
  const isAdmin = profileResult.data?.is_admin === true

  // Determine allowed pages for team members based on role + custom permissions
  let allowedPages: string[] | null = null
  if (isTeamMember && !isAdmin) {
    // Use the first membership's role and owner to look up permissions
    const primaryMembership = teamMemberships[0]
    const role = primaryMembership?.role ?? 'viewer'
    const ownerId = primaryMembership?.owner_id

    let rolePages = DEFAULT_ROLE_PERMISSIONS[role] ?? DEFAULT_ROLE_PERMISSIONS.viewer

    if (ownerId) {
      const { data: customPerm } = await supabase
        .from('owner_role_permissions')
        .select('allowed_pages')
        .eq('owner_id', ownerId)
        .eq('role', role)
        .maybeSingle()

      if (customPerm) rolePages = customPerm.allowed_pages
    }

    allowedPages = rolePages
  }

  const canAccessInbox = !isTeamMember || (allowedPages?.includes('inbox') ?? false)

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 flex flex-col">
      <DashboardNav
        user={profileResult.data ?? { email: user.email ?? '', full_name: null, avatar_url: null }}
        isTeamMember={isTeamMember}
        isAdmin={isAdmin}
        canAccessInbox={canAccessInbox}
        allowedPages={allowedPages}
      />
      <div className="flex-1 lg:pl-64 pt-16 transition-all duration-300">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
