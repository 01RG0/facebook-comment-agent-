import { Metadata } from 'next'
import AdminUsersPanel from '@/components/admin/admin-users-panel'

export const metadata: Metadata = { title: 'Admin — Users' }

export default function AdminUsersPage() {
  return <AdminUsersPanel />
}
