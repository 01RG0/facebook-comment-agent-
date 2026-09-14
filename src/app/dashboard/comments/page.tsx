import { Metadata } from 'next'
import CommentsClient from './comments-client'

export const metadata: Metadata = {
  title: 'Comments',
  description: 'Manage and moderate Facebook comments across your pages',
}

export default function CommentsPage() {
  return <CommentsClient />
}
