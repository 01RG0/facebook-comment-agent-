'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import useSWR from 'swr'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Search,
  CheckCircle2,
  Clock,
  Send,
  StickyNote,
  MessageSquare,
  AlertCircle,
  Sparkles,
  User,
  Inbox as InboxIcon,
  RefreshCw,
  MoreVertical,
  ChevronDown,
  ChevronLeft,
  Building2,
  Filter,
  X
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

import type {
  MessengerThread,
  MessengerMessage,
  MessengerNote,
  TeamMemberItem,
  PageOption,
  ThreadStatus,
} from '@/types/inbox'

const fetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    return res.json()
  })

function getInitials(name?: string | null, fallback = '?'): string {
  if (!name || !name.trim()) return fallback
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function MessengerInboxPage() {
  // State
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved'>('all')
  const [selectedPageId, setSelectedPageId] = useState<string>('all')

  // Forms state
  const [replyText, setReplyText] = useState('')
  const [isSendingReply, setIsSendingReply] = useState(false)
  const [isNoteOpen, setIsNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Fetch Pages for page filter dropdown
  const { data: pagesData } = useSWR<PageOption[]>('/api/pages', fetcher)
  const pages = useMemo(() => pagesData ?? [], [pagesData])

  // Build threads URL with filters
  const threadsQuery = useMemo(() => {
    const params = new URLSearchParams()
    if (selectedPageId && selectedPageId !== 'all') {
      params.set('page_id', selectedPageId)
    }
    if (statusFilter && statusFilter !== 'all') {
      params.set('status', statusFilter)
    }
    if (searchQuery.trim()) {
      params.set('search', searchQuery.trim())
    }
    params.set('limit', '50')
    return `/api/inbox/threads?${params.toString()}`
  }, [selectedPageId, statusFilter, searchQuery])

  // Fetch Threads
  const {
    data: threadsData,
    error: threadsError,
    isLoading: threadsLoading,
    mutate: mutateThreads,
  } = useSWR<{ threads: MessengerThread[]; count: number }>(threadsQuery, fetcher, {
    revalidateOnFocus: true,
  })

  const threads = useMemo(() => threadsData?.threads ?? [], [threadsData])

  // Realtime subscription via Supabase client channel on messenger_threads
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('messenger_threads_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messenger_threads',
        },
        () => {
          mutateThreads()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [mutateThreads])

  // Selected thread data
  const selectedThreadSummary = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  )

  // Fetch Thread Details (messages, notes, detail info)
  const threadDetailUrl = selectedThreadId ? `/api/inbox/threads/${selectedThreadId}` : null
  const {
    data: threadDetail,
    isLoading: threadDetailLoading,
    mutate: mutateThreadDetail,
  } = useSWR<
    MessengerThread & {
      messages: MessengerMessage[]
      notes: MessengerNote[]
    }
  >(threadDetailUrl, fetcher, {
    revalidateOnFocus: true,
  })

  // Fetch Team members for assigned agent dropdown
  const teamUrl = useMemo(() => {
    const pageId = selectedThreadSummary?.page_id || (selectedPageId !== 'all' ? selectedPageId : '')
    return pageId ? `/api/inbox/team?page_id=${pageId}` : '/api/inbox/team'
  }, [selectedThreadSummary?.page_id, selectedPageId])

  const { data: teamData, mutate: mutateTeam } = useSWR<{ members: TeamMemberItem[] }>(
    teamUrl,
    fetcher
  )
  const teamMembers = useMemo(() => teamData?.members ?? [], [teamData])

  // Scroll to bottom of message timeline on new messages or thread switch
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [threadDetail?.messages, threadDetail?.notes, selectedThreadId])

  // Actions
  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId)
    setIsNoteOpen(false)
    setNoteText('')
    setReplyText('')
  }

  const handleSendReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!selectedThreadId || !replyText.trim() || isSendingReply) return

    const messageText = replyText.trim()
    setIsSendingReply(true)

    try {
      const res = await fetch(`/api/inbox/threads/${selectedThreadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: messageText }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to send message')
      }

      setReplyText('')
      toast.success('Message sent')
      await Promise.all([mutateThreadDetail(), mutateThreads()])
    } catch (err: any) {
      toast.error(err.message || 'Could not send message')
    } finally {
      setIsSendingReply(false)
    }
  }

  const handleAddNote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!selectedThreadId || !noteText.trim() || isSavingNote) return

    const text = noteText.trim()
    setIsSavingNote(true)

    try {
      const res = await fetch(`/api/inbox/threads/${selectedThreadId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to add internal note')
      }

      setNoteText('')
      setIsNoteOpen(false)
      toast.success('Internal note added')
      await mutateThreadDetail()
    } catch (err: any) {
      toast.error(err.message || 'Could not add note')
    } finally {
      setIsSavingNote(false)
    }
  }

  const handleUpdateStatus = async (newStatus: ThreadStatus) => {
    if (!selectedThreadId || isUpdatingStatus) return
    setIsUpdatingStatus(true)

    try {
      const res = await fetch(`/api/inbox/threads/${selectedThreadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update status')
      }

      toast.success(`Conversation marked as ${newStatus.replace('_', ' ')}`)
      await Promise.all([mutateThreadDetail(), mutateThreads()])
    } catch (err: any) {
      toast.error(err.message || 'Status update failed')
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const handleAssignAgent = async (agentId: string) => {
    if (!selectedThreadId) return
    const targetId = agentId === 'unassigned' ? null : agentId

    try {
      const res = await fetch(`/api/inbox/threads/${selectedThreadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: targetId }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to assign agent')
      }

      toast.success(targetId ? 'Agent assigned' : 'Thread unassigned')
      await Promise.all([mutateThreadDetail(), mutateThreads()])
    } catch (err: any) {
      toast.error(err.message || 'Assignment failed')
    }
  }

  const handleSnooze = async () => {
    if (!selectedThreadId || isUpdatingStatus) return
    setIsUpdatingStatus(true)

    // Snooze for 24 hours
    const snoozeUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    try {
      const res = await fetch(`/api/inbox/threads/${selectedThreadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'snoozed',
          snoozed_until: snoozeUntil,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to snooze conversation')
      }

      toast.success('Conversation snoozed for 24 hours')
      await Promise.all([mutateThreadDetail(), mutateThreads()])
    } catch (err: any) {
      toast.error(err.message || 'Snooze failed')
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  // Active displayed thread (prefers threadDetail if selected, falls back to summary)
  const activeThread = threadDetail || selectedThreadSummary

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] md:h-[calc(100vh-8.5rem)] w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      {/* ==================================================================== */}
      {/* LEFT PANEL: THREAD LIST (340px-360px wide for comfortable spacing)    */}
      {/* ==================================================================== */}
      <div
        className={cn(
          'flex flex-col w-full md:w-[340px] md:min-w-[340px] md:max-w-[340px] border-r border-gray-200 bg-gray-50/60 dark:border-gray-800 dark:bg-gray-950/40',
          selectedThreadId ? 'hidden md:flex' : 'flex'
        )}
      >
        {/* Top bar: Header & Page dropdown filter */}
        <div className="flex flex-col gap-2.5 border-b border-gray-200 p-3.5 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <InboxIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Messenger
              </h1>
            </div>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => mutateThreads()}
              className="h-7 w-7 p-0 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              title="Refresh threads"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Page Filter Dropdown (fetch from /api/pages) */}
          <div className="w-full">
            <Select value={selectedPageId} onValueChange={setSelectedPageId}>
              <SelectTrigger className="h-8 w-full bg-white text-xs dark:bg-gray-900">
                <div className="flex items-center gap-1.5 truncate">
                  <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <SelectValue placeholder="All Facebook Pages" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  All Connected Pages
                </SelectItem>
                {pages.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.page_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search bar to filter threads by sender name */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sender name..."
              className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-7 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Status filter tabs: All / Open / In Progress / Resolved */}
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-gray-200/70 p-1 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'open', label: 'Open' },
                { key: 'in_progress', label: 'Prog' },
                { key: 'resolved', label: 'Done' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={cn(
                  'rounded px-1.5 py-1 text-center transition-all truncate',
                  statusFilter === tab.key
                    ? 'bg-white font-semibold text-gray-900 shadow-sm dark:bg-gray-900 dark:text-white'
                    : 'hover:text-gray-900 dark:hover:text-white'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Thread List ScrollArea */}
        <ScrollArea className="flex-1">
          {threadsLoading && threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-gray-500">
              <RefreshCw className="mb-2 h-5 w-5 animate-spin text-blue-500" />
              Loading conversations...
            </div>
          ) : threadsError ? (
            <div className="p-4 text-center text-xs text-red-500">
              Failed to load conversations
            </div>
          ) : threads.length === 0 ? (
            /* ISSUE 1 — Empty left panel when no threads */
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center p-6 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <MessageSquare className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                No conversations yet
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed max-w-[220px]">
                Messenger DMs from your Facebook page will appear here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
              {threads.map((thread) => {
                const isSelected = thread.id === selectedThreadId
                const isUnread = (thread.unread_count ?? 0) > 0
                const isUrgent = thread.priority === 'urgent'
                const assignedInitials = thread.assigned_profile?.full_name
                  ? getInitials(thread.assigned_profile.full_name)
                  : thread.assigned_profile?.email
                  ? thread.assigned_profile.email.slice(0, 2).toUpperCase()
                  : null

                const timeAgo = thread.last_message_at
                  ? formatDistanceToNow(new Date(thread.last_message_at), {
                      addSuffix: true,
                    }).replace('about ', '')
                  : ''

                const previewText =
                  thread.last_message?.text || 'No messages yet'

                {/* ISSUE 3 — Thread list items feel cramped */}
                return (
                  <button
                    key={thread.id}
                    onClick={() => handleSelectThread(thread.id)}
                    className={cn(
                      'group relative flex w-full items-start gap-3 p-4 text-left transition-colors',
                      isSelected
                        ? 'bg-blue-50/80 border-l-4 border-blue-600 dark:bg-blue-950/30 dark:border-blue-500'
                        : 'hover:bg-gray-100/70 border-l-4 border-transparent dark:hover:bg-gray-800/40'
                    )}
                  >
                    {/* Unread dot: filled blue circle (8px) on the left edge of the card */}
                    {isUnread && (
                      <span
                        className="absolute left-1.5 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white dark:ring-gray-900"
                        title="Unread"
                      />
                    )}

                    {/* Avatar with fallback initials */}
                    <div className="relative shrink-0">
                      <Avatar className="h-10 w-10 border border-gray-200 dark:border-gray-700">
                        {thread.sender_avatar && (
                          <AvatarImage
                            src={thread.sender_avatar}
                            alt={thread.sender_name || 'Sender'}
                          />
                        )}
                        <AvatarFallback className="bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                          {getInitials(thread.sender_name, 'U')}
                        </AvatarFallback>
                      </Avatar>
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      {/* Top line: Sender name (bolder) and Time in top-right corner */}
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span
                          className={cn(
                            'truncate text-sm font-semibold text-gray-900 dark:text-gray-100',
                            isUnread ? 'font-bold text-gray-950 dark:text-white' : 'font-semibold'
                          )}
                        >
                          {thread.sender_name || 'Facebook User'}
                        </span>
                        <span className="shrink-0 text-[11px] text-gray-400">
                          {timeAgo}
                        </span>
                      </div>

                      {/* Last message preview: gray-500, max 2 lines (line-clamp-2) */}
                      <p
                        className={cn(
                          'text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed',
                          isUnread && 'font-medium text-gray-800 dark:text-gray-200'
                        )}
                      >
                        {previewText}
                      </p>

                      {/* Footer badges: Priority badge / Urgent chip, Status, Assigned agent */}
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        {isUrgent && (
                          <Badge
                            variant="destructive"
                            className="h-4.5 px-1.5 text-[9px] font-bold uppercase tracking-wider bg-red-600 text-white flex items-center gap-1"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                            Urgent
                          </Badge>
                        )}

                        {thread.status === 'resolved' && (
                          <Badge
                            variant="secondary"
                            className="h-4.5 px-1.5 text-[9px] font-medium text-green-700 bg-green-50 dark:bg-green-950/40 dark:text-green-400"
                          >
                            Resolved
                          </Badge>
                        )}

                        {thread.status === 'in_progress' && (
                          <Badge
                            variant="secondary"
                            className="h-4.5 px-1.5 text-[9px] font-medium text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400"
                          >
                            In Progress
                          </Badge>
                        )}

                        {assignedInitials && (
                          <span
                            className="ml-auto flex h-4.5 w-4.5 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                            title={`Assigned to ${thread.assigned_profile?.full_name || thread.assigned_profile?.email}`}
                          >
                            {assignedInitials}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ==================================================================== */}
      {/* RIGHT PANEL: CONVERSATION VIEW                                       */}
      {/* ==================================================================== */}
      <div className={cn('flex flex-col flex-1 min-w-0 bg-white dark:bg-gray-900', selectedThreadId ? 'flex' : 'hidden md:flex')}>
        {!selectedThreadId ? (
          /* ISSUE 2 — Empty right panel when no thread selected (desktop) */
          <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-gray-50/50 dark:bg-gray-950/20">
            <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gray-100/80 text-gray-400 dark:bg-gray-800/80 dark:text-gray-500 shadow-inner">
              <InboxIcon className="h-16 w-16 stroke-[1.25]" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Select a conversation to get started
            </h2>
            <p className="mt-1.5 max-w-sm text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Choose a thread from the left panel to review messages, send replies via Messenger, or collaborate with team notes.
            </p>
          </div>
        ) : (
          <>
            {/* ISSUE 4 — Conversation header: more padding, larger name, clear badges, labeled Assign dropdown, prominent action buttons */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800 bg-white dark:bg-gray-900">
              <div className="flex items-center gap-3.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedThreadId(null)}
                  className="md:hidden -ml-2 h-8 px-2 text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>

                <Avatar className="h-11 w-11 border border-gray-200 dark:border-gray-700">
                  {activeThread?.sender_avatar && (
                    <AvatarImage
                      src={activeThread.sender_avatar}
                      alt={activeThread?.sender_name || 'Sender'}
                    />
                  )}
                  <AvatarFallback className="bg-blue-100 text-sm font-semibold text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                    {getInitials(activeThread?.sender_name, 'U')}
                  </AvatarFallback>
                </Avatar>

                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {activeThread?.sender_name || 'Facebook User'}
                    </h2>

                    {/* Status badge */}
                    {activeThread?.status === 'resolved' ? (
                      <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-950/60 dark:text-green-300 dark:border-green-900/40 text-xs px-2 py-0.5 font-medium">
                        Resolved
                      </Badge>
                    ) : activeThread?.status === 'in_progress' ? (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900/40 text-xs px-2 py-0.5 font-medium">
                        In Progress
                      </Badge>
                    ) : activeThread?.status === 'snoozed' ? (
                      <Badge className="bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-900/40 text-xs px-2 py-0.5 font-medium">
                        Snoozed
                      </Badge>
                    ) : (
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900/40 text-xs px-2 py-0.5 font-medium">
                        Open
                      </Badge>
                    )}

                    {/* Priority badge */}
                    {activeThread?.priority === 'urgent' && (
                      <Badge variant="destructive" className="text-xs px-2 py-0.5 uppercase tracking-wide font-semibold flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                        Urgent
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 mt-0.5">
                    User ID: {activeThread?.sender_id || '—'}
                  </p>
                </div>
              </div>

              {/* Controls: Labeled assign dropdown + Resolve + Snooze buttons */}
              <div className="flex items-center gap-2.5 flex-wrap">
                {/* Clear 'Assign to' dropdown */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    Assign to:
                  </span>
                  <div className="w-40">
                    <Select
                      value={activeThread?.assigned_to || 'unassigned'}
                      onValueChange={handleAssignAgent}
                    >
                      <SelectTrigger className="h-8 text-xs bg-white dark:bg-gray-900">
                        <div className="flex items-center gap-1.5 truncate">
                          <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          <SelectValue placeholder="Select agent..." />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned" className="text-xs">
                          Unassigned
                        </SelectItem>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.id} value={member.id} className="text-xs">
                            {member.full_name || member.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Resolve / Reopen action button */}
                {activeThread?.status === 'resolved' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                    disabled={isUpdatingStatus}
                    onClick={() => handleUpdateStatus('open')}
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Reopen
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs font-medium text-green-700 border-green-200 bg-green-50/50 hover:bg-green-100 hover:text-green-800 dark:border-green-900 dark:text-green-400 dark:bg-green-950/30 dark:hover:bg-green-950/50"
                    disabled={isUpdatingStatus}
                    onClick={() => handleUpdateStatus('resolved')}
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    Resolve
                  </Button>
                )}

                {/* Snooze button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-medium text-gray-700 border-gray-300 hover:bg-gray-100 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800"
                  disabled={isUpdatingStatus}
                  onClick={handleSnooze}
                >
                  <Clock className="h-4 w-4 text-gray-500" />
                  Snooze
                </Button>
              </div>
            </div>

            {/* Conversation Messages + Notes Timeline */}
            <ScrollArea className="flex-1 p-6">
              {threadDetailLoading && !threadDetail ? (
                <div className="flex h-60 items-center justify-center">
                  <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* ISSUE 5 — Message Timeline & Bubbles */}
                  {threadDetail?.messages && threadDetail.messages.length > 0 ? (
                    threadDetail.messages.map((msg, index, allMsgs) => {
                      const isInbound = msg.direction === 'inbound'
                      const isAi =
                        msg.sent_by_label?.toLowerCase() === 'ai' ||
                        msg.sent_by_label?.toLowerCase() === 'auto-reply' ||
                        (Boolean(msg.ai_confidence) && !msg.sent_by)

                      const senderLabel = isAi
                        ? 'AI'
                        : msg.sent_by_label || activeThread?.assigned_profile?.full_name || 'Agent'

                      // Group consecutive messages from same sender (check if next message has same direction and AI status)
                      const nextMsg = allMsgs[index + 1]
                      const isNextSameSender =
                        nextMsg &&
                        nextMsg.direction === msg.direction &&
                        (nextMsg.sent_by_label?.toLowerCase() === 'ai' ||
                          nextMsg.sent_by_label?.toLowerCase() === 'auto-reply' ||
                          (Boolean(nextMsg.ai_confidence) && !nextMsg.sent_by)) === isAi

                      const isLastInGroup = !isNextSameSender

                      // Format timestamp and relative distance
                      const sentDate = msg.sent_at ? new Date(msg.sent_at) : null
                      const timeString = sentDate ? format(sentDate, 'h:mm a') : ''
                      const relativeTime = sentDate
                        ? formatDistanceToNow(sentDate, { addSuffix: true })
                        : ''

                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            'flex flex-col',
                            isInbound ? 'items-start' : 'items-end',
                            isLastInGroup ? 'mb-3' : 'mb-1'
                          )}
                        >
                          {/* Message Bubble:
                              Inbound: light gray, rounded-2xl rounded-tl-sm, left-aligned, max-w-[75%]
                              Outbound AI: light blue background with subtle 'AI' purple chip, right-aligned
                              Outbound Human: darker blue, right-aligned, no AI chip
                          */}
                          <div
                            className={cn(
                              'max-w-[75%] px-4 py-2.5 text-xs shadow-sm leading-relaxed whitespace-pre-wrap break-words',
                              isInbound
                                ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 rounded-2xl rounded-tl-sm'
                                : isAi
                                ? 'bg-blue-100 text-blue-950 border border-blue-200/80 dark:bg-blue-950/60 dark:text-blue-100 dark:border-blue-800/60 rounded-2xl rounded-tr-sm'
                                : 'bg-blue-700 text-white dark:bg-blue-600 rounded-2xl rounded-tr-sm'
                            )}
                          >
                            {msg.text}
                          </div>

                          {/* Footer with sent time and sender label (only show on last message of group or always with relative time) */}
                          <div
                            className={cn(
                              'mt-1 flex items-center gap-1.5 px-1 text-[10px] text-gray-400',
                              isInbound ? 'justify-start' : 'justify-end'
                            )}
                          >
                            <span>
                              {timeString} {relativeTime ? `(sent ${relativeTime})` : ''}
                            </span>

                            {/* Below each outbound message show tiny label: AI chip or sender label */}
                            {!isInbound && (
                              <>
                                <span>•</span>
                                {isAi ? (
                                  <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 font-medium text-[9px]">
                                    <Sparkles className="h-2.5 w-2.5" />
                                    AI
                                  </span>
                                ) : (
                                  <span className="text-gray-500 dark:text-gray-400 font-medium">
                                    {senderLabel}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="py-6 text-center text-xs text-gray-400">
                      No customer messages in this thread yet.
                    </div>
                  )}

                  {/* Internal Notes section below messages (yellow background bubbles, labeled 'Internal Note') */}
                  {threadDetail?.notes && threadDetail.notes.length > 0 && (
                    <div className="pt-4 border-t border-dashed border-gray-200 dark:border-gray-800 space-y-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        <StickyNote className="h-3.5 w-3.5" />
                        Internal Team Notes
                      </div>

                      {threadDetail.notes.map((note) => {
                        const authorName =
                          note.author?.full_name || note.author?.email || 'Team member'
                        const noteTime = note.created_at
                          ? format(new Date(note.created_at), 'MMM d, h:mm a')
                          : ''

                        return (
                          <div
                            key={note.id}
                            className="rounded-xl border border-amber-200/80 bg-amber-50/90 p-3.5 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20"
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center rounded-md bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                                  Internal Note
                                </span>
                                <span className="text-xs font-medium text-amber-900 dark:text-amber-200">
                                  {authorName}
                                </span>
                              </div>
                              <span className="text-[10px] text-amber-700/70 dark:text-amber-400/70">
                                {noteTime}
                              </span>
                            </div>
                            <p className="text-xs text-amber-950 dark:text-amber-100 whitespace-pre-wrap leading-relaxed">
                              {note.text}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* ISSUE 6 — Reply Box */}
            <div className="border-t border-gray-200 bg-gray-50/50 p-5 dark:border-gray-800 dark:bg-gray-950/40 space-y-3">
              {/* Add Note toggle section */}
              {isNoteOpen ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                      <StickyNote className="h-3.5 w-3.5" />
                      Add Internal Note (Not visible to customer)
                    </span>
                    <button
                      onClick={() => setIsNoteOpen(false)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Type an internal note for your team..."
                    rows={2}
                    className="border-amber-200 bg-white text-xs text-gray-900 focus-visible:ring-amber-500 focus-visible:border-amber-400 dark:border-amber-900/50 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <div className="mt-2.5 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setIsNoteOpen(false)}
                      className="h-7 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="xs"
                      onClick={handleAddNote}
                      disabled={!noteText.trim() || isSavingNote}
                      className="h-7 bg-amber-600 text-white hover:bg-amber-700 text-xs gap-1 shadow-sm"
                    >
                      {isSavingNote ? 'Saving...' : 'Save Note'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Replies are sent directly to customer via Messenger
                  </span>
                  {/* 'Add Note' button: yellow/amber color to distinguish from send */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsNoteOpen(true)}
                    className="h-7 gap-1.5 text-xs font-medium text-amber-800 border-amber-300 bg-amber-50 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
                  >
                    <StickyNote className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    Add Note
                  </Button>
                </div>
              )}

              {/* Reply Input: textarea with padding & focus ring, character count below, full blue send button */}
              <form onSubmit={handleSendReply} className="space-y-2">
                <div className="relative rounded-lg border border-gray-200 bg-white shadow-sm transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendReply()
                      }
                    }}
                    placeholder="Type your reply to customer (Enter to send, Shift+Enter for newline)..."
                    rows={3}
                    className="w-full resize-none border-0 bg-transparent p-3 text-xs leading-relaxed focus-visible:ring-0 focus-visible:outline-none dark:text-gray-100 placeholder:text-gray-400"
                  />
                  <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 dark:border-gray-800">
                    {/* Character count below textarea */}
                    <span className="text-[11px] text-gray-400 font-mono">
                      {replyText.length} characters
                    </span>

                    {/* Send button: full blue, with Send icon, disabled when empty */}
                    <Button
                      type="submit"
                      disabled={!replyText.trim() || isSendingReply}
                      className="h-8 px-4 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-300 dark:disabled:bg-blue-900/50 shrink-0 gap-1.5 text-xs font-semibold shadow-sm transition-colors"
                    >
                      {isSendingReply ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          Send
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

