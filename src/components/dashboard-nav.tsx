'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  user: { full_name: string | null; email: string; avatar_url: string | null }
  isTeamMember?: boolean
  isAdmin?: boolean
  canAccessInbox?: boolean
}

interface NavLink {
  href: string
  label: string
  icon: string
  hasBadge?: boolean
}

const ownerLinks: NavLink[] = [
  { href: '/dashboard', label: 'Pages', icon: '📄' },
  { href: '/dashboard/activity', label: 'Activity', icon: '📊' },
  { href: '/dashboard/inbox', label: 'Inbox', icon: '📥', hasBadge: true },
  { href: '/dashboard/handoff', label: 'Handoff', icon: '🤝' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: '📈' },
  { href: '/dashboard/dlq', label: 'Failed Messages', icon: '⚠️' },
  { href: '/dashboard/ai-keys', label: 'AI Keys', icon: '🔑' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
]

const memberLinks: NavLink[] = [
  { href: '/dashboard/handoff', label: 'Handoff', icon: '🤝' },
]

export default function DashboardNav({ user, isTeamMember = false, isAdmin = false, canAccessInbox = true }: Props) {
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  // Close mobile menu on navigation
  useEffect(() => { setMobileOpen(false) }, [pathname])

  useEffect(() => {
    if (!canAccessInbox) return
    fetch('/api/inbox/threads?status=open&limit=1')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!data) return
        if (typeof data.count === 'number') setUnreadCount(data.count)
        else if (typeof data.total === 'number') setUnreadCount(data.total)
        else if (Array.isArray(data)) setUnreadCount(data.length)
      })
      .catch(() => {})
  }, [canAccessInbox])

  let navLinks = isTeamMember
    ? canAccessInbox
      ? [...memberLinks, { href: '/dashboard/inbox', label: 'Inbox', icon: '📥', hasBadge: true }]
      : memberLinks
    : ownerLinks

  if (!canAccessInbox) {
    navLinks = navLinks.filter(link => link.href !== '/dashboard/inbox')
  }

  const allLinks: NavLink[] = [
    ...navLinks,
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: '🛡️' }] : []),
  ]

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/auth/login')
    router.refresh()
  }

  const LinkItem = ({ link, onClick }: { link: NavLink; onClick?: () => void }) => {
    const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href))
    return (
      <Link
        href={link.href}
        onClick={onClick}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition',
          isActive
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800'
        )}
      >
        <span>{link.icon}</span>
        <span>{link.label}</span>
        {link.hasBadge && unreadCount !== null && unreadCount > 0 && (
          <span className="ml-auto px-1.5 py-0.5 text-xs font-semibold bg-blue-600 text-white rounded-full leading-none">
            {unreadCount}
          </span>
        )}
      </Link>
    )
  }

  return (
    <>
      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-lg flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <span className="font-semibold text-gray-900 dark:text-white hidden sm:block">
                FB Comment Agent
              </span>
            </div>

            {/* Desktop Nav Links */}
            <div className="hidden md:flex items-center gap-1">
              {allLinks.map(link => {
                const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href))
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition',
                      isActive
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800'
                    )}
                  >
                    <span>{link.icon}</span>
                    <span>{link.label}</span>
                    {link.hasBadge && unreadCount !== null && unreadCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-blue-600 text-white rounded-full leading-none">
                        {unreadCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>

            {/* Right: user + hamburger */}
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[160px]">
                  {user.full_name ?? user.email}
                </span>
                {user.full_name && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[160px]">
                    {user.email}
                  </span>
                )}
              </div>
              <button
                onClick={handleSignOut}
                className="hidden md:block text-sm text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Sign out
              </button>

              {/* Hamburger button — mobile only */}
              <button
                onClick={() => setMobileOpen(o => !o)}
                aria-label="Open menu"
                className="md:hidden flex flex-col items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition gap-1.5"
              >
                <span className={cn('block w-5 h-0.5 bg-gray-700 dark:bg-gray-300 transition-transform', mobileOpen && 'translate-y-2 rotate-45')} />
                <span className={cn('block w-5 h-0.5 bg-gray-700 dark:bg-gray-300 transition-opacity', mobileOpen && 'opacity-0')} />
                <span className={cn('block w-5 h-0.5 bg-gray-700 dark:bg-gray-300 transition-transform', mobileOpen && '-translate-y-2 -rotate-45')} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          {/* Drawer */}
          <div className="relative ml-auto w-72 h-full bg-white dark:bg-gray-900 shadow-xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm">{user.full_name ?? user.email}</p>
                {user.full_name && <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>}
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
              >
                ✕
              </button>
            </div>
            {/* Links */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {allLinks.map(link => (
                <LinkItem key={link.href} link={link} onClick={() => setMobileOpen(false)} />
              ))}
            </div>
            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={() => { setMobileOpen(false); handleSignOut() }}
                className="w-full py-2.5 px-4 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition text-left"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
