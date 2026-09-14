import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const pageId = searchParams.get('page_id')

    const adminDb = getAdminClient() as any

    const membersMap = new Map<
      string,
      { id: string; full_name: string | null; email: string; avatar_url: string | null }
    >()

    // If pageId is provided, get owner + team members for that page
    if (pageId) {
      // Get page owner
      const { data: page } = await adminDb
        .from('pages')
        .select('user_id, profiles!pages_user_id_fkey(id, full_name, email, avatar_url)')
        .eq('id', pageId)
        .maybeSingle()

      if (page?.profiles) {
        membersMap.set(page.profiles.id, page.profiles)
      }

      // Get accepted team members
      const { data: teamMembers } = await adminDb
        .from('team_members')
        .select('member_id, profiles!team_members_member_id_fkey(id, full_name, email, avatar_url)')
        .eq('page_id', pageId)

      teamMembers?.forEach((tm: any) => {
        if (tm.profiles && tm.profiles.id) {
          membersMap.set(tm.profiles.id, tm.profiles)
        }
      })
    } else {
      // Current user
      const { data: currentUserProfile } = await adminDb
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .eq('id', user.id)
        .maybeSingle()

      if (currentUserProfile) {
        membersMap.set(currentUserProfile.id, currentUserProfile)
      }

      // Pages owned by user
      const { data: ownedPages } = await adminDb
        .from('pages')
        .select('id')
        .eq('user_id', user.id)

      const pageIds = ownedPages?.map((p: any) => p.id) ?? []

      if (pageIds.length > 0) {
        const { data: teamMembers } = await adminDb
          .from('team_members')
          .select('member_id, profiles!team_members_member_id_fkey(id, full_name, email, avatar_url)')
          .in('page_id', pageIds)

        teamMembers?.forEach((tm: any) => {
          if (tm.profiles && tm.profiles.id) {
            membersMap.set(tm.profiles.id, tm.profiles)
          }
        })
      }
    }

    return NextResponse.json({ members: Array.from(membersMap.values()) })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
