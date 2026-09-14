import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SequencesClient from './sequences-client'

export default async function SequencesPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return <SequencesClient />
}
