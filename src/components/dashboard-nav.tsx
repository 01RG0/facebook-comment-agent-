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
  Users,
  GitMerge,
  Bell,
  LogOut,
  ChevronDown,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
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
  badgeCount?: number
}

function getInitials(name: string | null, email: string) {
  if (name) return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return email.slice(0, 2).toUpperCase()
}

const ownerLinks: Omit<NavLink, 'badgeCount'>[] = [
  { href: '/dashboard', label: 'Pages', icon: <LayoutDashboard className="w-5 h-5 flex-shrink-0" /> },
  { href: '/dashboard/comments', label: 'Comments', icon: <MessageSquare className="w-5 h-5 flex-shrink-0" /> },
  { href: '/dashboard/reviews', label: 'Reviews', icon: <Star className="w-5 h-5 flex-shrink-0" /> },
  { href: '/dashboard/contacts', label: 'Contacts', icon: <Users className="w-5 h-5 flex-shrink-0" /> },
  { href: '/dashboard/sequences', label: 'Sequences', icon: <GitMerge className="w-5 h-5 flex-shrink-0" /> },
  { href: '/dashboard/inbox', label: 'Inbox', icon: <Inbox className="w-5 h-5 flex-shrink-0" />, hasBadge: true },
  { href: '/dashboard/handoff', label: 'Handoff', icon: <GitPullRequestArrow className="w-5 h-5 flex-shrink-0" /> },
  { href: '/dashboard/activity', label: 'Activity', icon: <BarChart2 className="w-5 h-5 flex-shrink-0" /> },
  { href: '/dashboard/analytics', label: 'Analytics', icon: <TrendingUp className="w-5 h-5 flex-shrink-0" /> },
  { href: '/dashboard/dlq', label: 'Failed DLQ', icon: <AlertTriangle className="w-5 h-5 flex-shrink-0" /> },
  { href: '/dashboard/ai-keys', label: 'AI Keys', icon: <KeyRound className="w-5 h-5 flex-shrink-0" /> },
  { href: '/dashboard/settings', label: 'Settings', icon: <Settings className="w-5 h-5 flex-shrink-0" /> },
]

const memberLinks: Omit<NavLink, 'badgeCount'>[] = [
  { href: '/dashboard/handoff', label: 'Handoff', icon: <GitPullRequestArrow className="w-5 h-5 flex-shrink-0" /> },
]

export default function DashboardNav({ user, isTeamMember = false, isAdmin = false, canAccessInbox = true }: Props) {
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
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

  // Poll or fetch inbox unread count
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
      ? [...memberLinks, { href: '/dashboard/inbox', label: 'Inbox', icon: <Inbox className="w-5 h-5 flex-shrink-0" />, hasBadge: true }]
      : memberLinks
    : ownerLinks

  if (!canAccessInbox) {
    navLinks = navLinks.filter(link => link.href !== '/dashboard/inbox')
  }

  const allLinks: NavLink[] = [
    ...navLinks,
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: <ShieldCheck className="w-5 h-5 flex-shrink-0" /> }] : []),
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
      {/* ── Top Header Bar ── */}
      <header
        className={cn(
          'fixed top-0 right-0 z-30 h-16 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 transition-all duration-300',
          isCollapsed ? 'left-0 lg:left-20' : 'left-0 lg:left-64'
        )}
      >
        <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Mobile menu button */}
          <div className="flex items-center gap-3 lg:hidden">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-7 h-7 bg-blue-600 rounded-lg text-white font-bold text-xs">
                AI
              </div>
              <span className="font-bold text-gray-900 dark:text-white text-sm">CommentAI</span>
            </div>
          </div>

          {/* Current Page Title (Desktop) */}
          <div className="hidden lg:flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Section</span>
            <span className="text-gray-300 dark:text-gray-700">/</span>
            <h1 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {allLinks.find(l => isActive(l.href))?.label ?? 'Dashboard'}
            </h1>
          </div>

          {/* Right Header Controls: Notifications & User Menu */}
          <div className="flex items-center gap-3 ml-auto">
            {/* Notification Bell with Unread Badge */}
            {canAccessInbox && (
              <Link
                href="/dashboard/inbox"
                className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                title="Notifications / Inbox"
              >
                <Bell className="w-5 h-5" />
                {unreadCount !== null && unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600" />
                  </span>
                )}
              </Link>
            )}

            {/* User Profile Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(o => !o)}
                className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
              >
                {user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar_url} alt={displayName} className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                    {initials}
                  </div>
                )}
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">
                    {displayName}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight truncate max-w-[130px]">
                    {user.email}
                  </span>
                </div>
                <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform duration-200', userMenuOpen && 'rotate-180')} />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-medium text-gray-400">Signed in as</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user.email}</p>
                  </div>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition"
                    >
                      <ShieldCheck className="w-4 h-4 text-purple-600" />
                      Admin Panel
                    </Link>
                  )}
                  <Link
                    href="/dashboard/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition"
                  >
                    <Settings className="w-4 h-4 text-gray-500" />
                    Account Settings
                  </Link>
                  <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                  <button
                    onClick={() => { setUserMenuOpen(false); handleSignOut() }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Left Sidebar (Desktop) ── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 hidden lg:flex flex-col',
          isCollapsed ? 'w-20' : 'w-64'
        )}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center px-4 border-b border-gray-100 dark:border-gray-800 justify-between">
          <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
            <div className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-xl text-white shadow-md flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </div>
            {!isCollapsed && (
              <div className="flex flex-col">
                <span className="font-bold text-gray-900 dark:text-white text-base tracking-tight leading-none">
                  CommentAI
                </span>
                <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 mt-1 uppercase tracking-wider">
                  Social Agent
                </span>
              </div>
            )}
          </Link>
          <button
            onClick={() => setIsCollapsed(c => !c)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Sidebar Nav Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-thin">
          {allLinks.map(link => {
            const active = isActive(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                title={isCollapsed ? link.label : undefined}
                className={cn(
                  'group flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 relative',
                  active
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                )}
              >
                {link.icon}
                {!isCollapsed && <span className="truncate">{link.label}</span>}

                {/* Badge */}
                {link.hasBadge && unreadCount !== null && unreadCount > 0 && (
                  <span
                    className={cn(
                      'ml-auto text-xs font-bold rounded-full flex items-center justify-center',
                      isCollapsed
                        ? 'absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500'
                        : active
                        ? 'bg-white text-blue-600 min-w-[20px] h-5 px-1.5'
                        : 'bg-blue-600 text-white min-w-[20px] h-5 px-1.5'
                    )}
                  >
                    {!isCollapsed && (unreadCount > 99 ? '99+' : unreadCount)}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={handleSignOut}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition',
              isCollapsed && 'justify-center px-0'
            )}
            title={isCollapsed ? 'Sign out' : undefined}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* ── Mobile Drawer ── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-lg text-white font-bold text-xs">
                  AI
                </div>
                <span className="font-bold text-gray-900 dark:text-white text-sm">CommentAI</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Links */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {allLinks.map(link => {
                const active = isActive(link.href)
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition',
                      active
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                    )}
                  >
                    {link.icon}
                    <span>{link.label}</span>
                    {link.hasBadge && unreadCount !== null && unreadCount > 0 && (
                      <span
                        className={cn(
                          'ml-auto text-xs font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center',
                          active ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
                        )}
                      >
                        {unreadCount}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={() => { setMobileOpen(false); handleSignOut() }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition"
              >
                <LogOut className="w-5 h-5" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
