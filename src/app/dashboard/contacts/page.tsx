import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ContactsClient from './contacts-client'

export default async function ContactsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return <ContactsClient />
}
