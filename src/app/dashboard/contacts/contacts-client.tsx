'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  Users,
  Search,
  RefreshCw,
  Loader2,
  MessageSquare,
  Globe,
  FileText,
  Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Contact {
  id: string
  user_id: string
  page_id: string | null
  platform_user_id: string
  platform: string
  name: string | null
  picture: string | null
  first_seen_at: string
  last_seen_at: string
  comment_count: number
  pages?: {
    page_name: string
  } | null
}

const COLORS = [
  'bg-violet-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-orange-500',
  'bg-rose-500',
  'bg-indigo-500',
]

function avatarColor(name: string) {
  let h = 0
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}

function initials(name: string) {
  const p = name.trim().split(/\s+/)
  return p.length === 1
    ? p[0].slice(0, 2).toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

function formatDate(dateString?: string) {
  if (!dateString) return '—'
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true })
  } catch {
    return dateString
  }
}

export default function ContactsClient() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const fetchContacts = useCallback(async (searchQuery = '') => {
    setLoading(true)
    try {
      const url = searchQuery
        ? `/api/contacts?search=${encodeURIComponent(searchQuery)}`
        : '/api/contacts'
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error('Failed to load contacts')
      }
      const data = await res.json()
      setContacts(data.contacts || [])
    } catch (err: any) {
      toast.error(err.message || 'Error fetching contacts')
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchContacts(search)
    }, 300)
    return () => clearTimeout(handler)
  }, [search, fetchContacts])

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-500" />
            Contacts
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Audience and commenters auto-saved from Facebook posts.
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
          </div>
          <button
            onClick={() => fetchContacts(search)}
            disabled={loading}
            className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
            title="Refresh contacts"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-neutral-500 dark:text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-500" />
          <p className="text-sm">Loading contacts...</p>
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-16 px-4 border border-dashed border-neutral-300 dark:border-neutral-800 rounded-2xl bg-neutral-50/50 dark:bg-neutral-900/50">
          <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6 text-indigo-500" />
          </div>
          <h3 className="text-base font-medium text-neutral-900 dark:text-white mb-1">
            No contacts yet
          </h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
            No contacts yet — they&apos;ll appear automatically when comments come in.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-neutral-600 dark:text-neutral-300">
                <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-xs uppercase font-medium text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">
                      Name
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Platform
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Page
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Comments
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      First Seen
                    </th>
                    <th scope="col" className="px-6 py-3.5">
                      Last Seen
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {contacts.map((contact) => {
                    const displayName = contact.name || 'Anonymous'
                    return (
                      <tr
                        key={contact.id}
                        className="hover:bg-neutral-50/75 dark:hover:bg-neutral-800/50 transition-colors"
                      >
                        <td className="px-6 py-4 font-medium text-neutral-900 dark:text-white whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            {contact.picture ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={contact.picture}
                                alt={displayName}
                                className="w-9 h-9 rounded-full object-cover border border-neutral-200 dark:border-neutral-700"
                              />
                            ) : (
                              <div
                                className={cn(
                                  'w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shadow-inner',
                                  avatarColor(displayName)
                                )}
                              >
                                {initials(displayName)}
                              </div>
                            )}
                            <div>
                              <div className="font-semibold text-neutral-900 dark:text-white">
                                {displayName}
                              </div>
                              <div className="text-xs text-neutral-400 font-mono">
                                ID: {contact.platform_user_id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap capitalize">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                            {contact.platform}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {contact.pages?.page_name || '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200">
                            <MessageSquare className="w-3 h-3 text-neutral-400" />
                            {contact.comment_count}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                          {formatDate(contact.first_seen_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
                          {formatDate(contact.last_seen_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card List */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {contacts.map((contact) => {
              const displayName = contact.name || 'Anonymous'
              return (
                <div
                  key={contact.id}
                  className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {contact.picture ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={contact.picture}
                          alt={displayName}
                          className="w-10 h-10 rounded-full object-cover shrink-0 border border-neutral-200 dark:border-neutral-700"
                        />
                      ) : (
                        <div
                          className={cn(
                            'w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0',
                            avatarColor(displayName)
                          )}
                        >
                          {initials(displayName)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h4 className="font-semibold text-neutral-900 dark:text-white truncate text-sm">
                          {displayName}
                        </h4>
                        <p className="text-xs text-neutral-400 truncate">
                          {contact.pages?.page_name || 'No page'}
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 shrink-0">
                      <MessageSquare className="w-3 h-3 text-neutral-400" />
                      {contact.comment_count}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                    <span className="capitalize">{contact.platform}</span>
                    <span>Last seen {formatDate(contact.last_seen_at)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
