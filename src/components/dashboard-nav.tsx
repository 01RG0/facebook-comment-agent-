'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  BarChart2,
  Inbox,
  GitPullRequestArrow,
  TrendingUp,
  AlertTriangle,
  KeyRound,
  Settings,
  ShieldCheck,
  MessageSquare,
  Star,
  Bell,
  LogOut,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react'

interface Props {
  user: { full_name: string | null; email: string; avatar_url: string | null }
  isTeamMember?: boolean
  isAdmin?: boolean
  canAccessInbox?: boolean
}

interface NavLink {
  href: string
  label: string
  icon: React.ReactNode
  hasBadge?: boolean
}

function getInitials(name: string | null, email: string) {
  if (name) return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return email.slice(0, 2).toUpperCase()
}

const ownerLinks: NavLink[] = [
  { href: '/dashboard', label: 'Pages', icon: <LayoutDashboard className="w-4 h-4" /> },
  { href: '/dashboard/comments', label: 'Comments', icon: <MessageSquare className="w-4 h-4" /> },
  { href: '/dashboard/reviews', label: 'Reviews', icon: <Star className="w-4 h-4" /> },
  { href: '/dashboard/activity', label: 'Activity', icon: <BarChart2 className="w-4 h-4" /> },
  { href: '/dashboard/inbox', label: 'Inbox', icon: <Inbox className="w-4 h-4" />, hasBadge: true },
  { href: '/dashboard/handoff', label: 'Handoff', icon: <GitPullRequestArrow className="w-4 h-4" /> },
  { href: '/dashboard/analytics', label: 'Analytics', icon: <TrendingUp className="w-4 h-4" /> },
  { href: '/dashboard/dlq', label: 'Failed', icon: <AlertTriangle className="w-4 h-4" /> },
  { href: '/dashboard/ai-keys', label: 'AI Keys', icon: <KeyRound className="w-4 h-4" /> },
  { href: '/dashboard/settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
]

const memberLinks: NavLink[] = [
  { href: '/dashboard/handoff', label: 'Handoff', icon: <GitPullRequestArrow className="w-4 h-4" /> },
]

export default function DashboardNav({ user, isTeamMember = false, isAdmin = false, canAccessInbox = true }: Props) {
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
      ? [...memberLinks, { href: '/dashboard/inbox', label: 'Inbox', icon: <Inbox className="w-4 h-4" />, hasBadge: true }]
      : memberLinks
    : ownerLinks

  if (!canAccessInbox) {
    navLinks = navLinks.filter(link => link.href !== '/dashboard/inbox')
  }

  const allLinks: NavLink[] = [
    ...navLinks,
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: <ShieldCheck className="w-4 h-4" /> }] : []),
  ]

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/auth/login')
    router.refresh()
  }

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  const initials = getInitials(user.full_name, user.email)
  const displayName = user.full_name ?? user.email.split('@')[0]

  return (
    <>
      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between gap-4">

            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-2.5 flex-shrink-0">
              <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-lg">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <span className="font-bold text-gray-900 dark:text-white text-sm hidden sm:block tracking-tight">
                CommentAI
              </span>
            </Link>

            {/* Desktop nav links */}
            <div className="hidden lg:flex items-center gap-0.5 flex-1 overflow-x-auto">
              {allLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                    isActive(link.href)
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800'
                  )}
                >
                  {link.icon}
                  <span>{link.label}</span>
                  {link.hasBadge && unreadCount !== null && unreadCount > 0 && (
                    <span className="ml-0.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-blue-600 text-white rounded-full flex items-center justify-center leading-none">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
              ))}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Notification bell (inbox unread) */}
              {canAccessInbox && unreadCount !== null && unreadCount > 0 && (
                <Link
                  href="/dashboard/inbox"
                  className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-500 dark:text-gray-400 hidden md:flex"
                >
                  <Bell className="w-4.5 h-4.5" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full" />
                </Link>
              )}

              {/* User avatar + dropdown */}
              <div className="relative hidden md:block" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(o => !o)}
                  className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt={displayName} className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                      {initials}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-900 dark:text-white max-w-[120px] truncate">
                    {displayName}
                  </span>
                  <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', userMenuOpen && 'rotate-180')} />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg py-1 z-50">
                    <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{displayName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                    </div>
                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                      >
                        <ShieldCheck className="w-4 h-4 text-purple-500" />
                        Admin Panel
                      </Link>
                    )}
                    <button
                      onClick={() => { setUserMenuOpen(false); handleSignOut() }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>

              {/* Hamburger — mobile */}
              <button
                onClick={() => setMobileOpen(o => !o)}
                aria-label="Open menu"
                className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-600 dark:text-gray-400"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative ml-auto w-72 h-full bg-white dark:bg-gray-900 shadow-xl flex flex-col">
            {/* Drawer header */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-200 dark:border-gray-800">
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar_url} alt={displayName} className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{displayName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Links */}
            <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
              {allLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition',
                    isActive(link.href)
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800'
                  )}
                >
                  {link.icon}
                  <span>{link.label}</span>
                  {link.hasBadge && unreadCount !== null && unreadCount > 0 && (
                    <span className="ml-auto min-w-[20px] h-5 px-1.5 text-xs font-bold bg-blue-600 text-white rounded-full flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </Link>
              ))}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={() => { setMobileOpen(false); handleSignOut() }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
