'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { friendlyError } from '@/lib/friendly-errors'
import { formatDistanceToNow } from 'date-fns'
import { CheckCircle2, MessageSquarePlus, RotateCcw, Send, X } from 'lucide-react'

interface HandoffItem {
  id: string
  fb_comment_id: string
  commenter_name: string
  comment_text: string
  ai_draft: string | null
  status: 'pending' | 'replied' | 'dismissed'
  notes: string | null
  created_at: string
  pages: { page_name: string } | null
}

interface PageItem {
  id: string
  page_name: string
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-orange-500', 'bg-rose-500', 'bg-indigo-500',
]
function avatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function HandoffPage() {
  const [items, setItems] = useState<HandoffItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [followUpId, setFollowUpId] = useState<string | null>(null)
  const [followUpText, setFollowUpText] = useState('')
  const [sendingFollowUp, setSendingFollowUp] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending')
  const [pages, setPages] = useState<PageItem[]>([])
  const [selectedPageId, setSelectedPageId] = useState('')

  useEffect(() => {
    fetch('/api/pages')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setPages(data) })
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    const supabase = createClient()
    const q = supabase
      .from('handoff_queue')
      .select('id, fb_comment_id, commenter_name, comment_text, ai_draft, status, notes, created_at, pages(page_name)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (statusFilter === 'pending') q.eq('status', 'pending')
    if (selectedPageId) q.eq('page_id', selectedPageId)

    const { data } = await q
    setItems((data ?? []) as unknown as HandoffItem[])
    setLoading(false)
  }, [statusFilter, selectedPageId])

  useEffect(() => { load() }, [load])

  const openReply = (item: HandoffItem) => {
    setActiveId(item.id)
    setReplyText(item.ai_draft ?? '')
  }

  const handleReply = async (item: HandoffItem) => {
    if (!replyText.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/handoff/${item.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_text: replyText }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Reply sent')
      setActiveId(null)
      setReplyText('')
      await load()
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSending(false)
    }
  }

  const handleFollowUp = async (item: HandoffItem) => {
    if (!followUpText.trim()) return
    setSendingFollowUp(true)
    try {
      const res = await fetch(`/api/handoff/${item.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_text: followUpText, is_followup: true }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Follow-up sent')
      setFollowUpId(null)
      setFollowUpText('')
      await load()
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSendingFollowUp(false)
    }
  }

  const handleDismiss = async (id: string) => {
    const res = await fetch('/api/handoff/' + id + '/reply', { method: 'DELETE' })
    if (!res.ok) { toast.error('Could not dismiss this item. Please try again.'); return }
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const pendingCount = items.filter(i => i.status === 'pending').length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            Human Handoff
            {pendingCount > 0 && statusFilter === 'pending' && (
              <span className="text-sm bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2.5 py-0.5 rounded-full font-medium">
                {pendingCount} pending
              </span>
            )}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-0.5 text-sm">
            Comments flagged for manual review — edit the AI draft before sending
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedPageId}
            onChange={e => setSelectedPageId(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Pages</option>
            {pages.map(page => (
              <option key={page.id} value={page.id}>{page.page_name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'pending' | 'all')}
            className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="pending">Pending only</option>
            <option value="all">All statuses</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-16 text-center">
          <div className="flex items-center justify-center w-16 h-16 bg-emerald-50 dark:bg-emerald-900/20 rounded-full mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">All caught up!</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No comments waiting for review. New ones will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => {
            const pageName = (item.pages as unknown as { page_name: string } | null)?.page_name
            const color = avatarColor(item.commenter_name)
            const timeAgo = formatDistanceToNow(new Date(item.created_at), { addSuffix: true })

            return (
              <div
                key={item.id}
                className={`bg-white dark:bg-gray-900 rounded-2xl border shadow-sm transition-shadow hover:shadow-md ${
                  item.status === 'pending'
                    ? 'border-orange-200 dark:border-orange-800/60'
                    : item.status === 'replied'
                    ? 'border-emerald-200 dark:border-emerald-800/60 opacity-75'
                    : 'border-gray-200 dark:border-gray-800 opacity-50'
                }`}
              >
                <div className="p-5">
                  {/* Top row: avatar + name + badges + time */}
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full ${color} flex items-center justify-center text-white text-sm font-bold`}>
                      {getInitials(item.commenter_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">{item.commenter_name}</span>
                        {pageName && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">{pageName}</span>
                        )}
                        <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                          Private DM
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          item.status === 'pending'
                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                            : item.status === 'replied'
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                        }`}>
                          {item.status}
                        </span>
                        <span className="text-xs text-gray-400 ml-auto">{timeAgo}</span>
                      </div>

                      {/* Original comment quoted */}
                      <blockquote className="mt-2 pl-3 border-l-2 border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 italic">
                        {item.comment_text}
                      </blockquote>
                    </div>
                  </div>

                  {/* AI draft preview when not editing */}
                  {item.ai_draft && activeId !== item.id && followUpId !== item.id && (
                    <div className="mt-4 ml-13 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3">
                      <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1">AI Draft</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{item.ai_draft}</p>
                    </div>
                  )}

                  {/* Edit & send reply (pending only) */}
                  {activeId === item.id && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          AI Draft — edit before sending
                        </p>
                        {item.ai_draft && (
                          <button
                            onClick={() => setReplyText(item.ai_draft ?? '')}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Reset to AI draft
                          </button>
                        )}
                      </div>
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        rows={4}
                        placeholder="Edit the reply before sending..."
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReply(item)}
                          disabled={sending || !replyText.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {sending ? 'Sending...' : 'Send Reply'}
                        </button>
                        <button
                          onClick={() => { setActiveId(null); setReplyText('') }}
                          className="flex items-center gap-1 px-3 py-2 text-gray-600 dark:text-gray-400 text-sm hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Follow-up for replied items */}
                  {followUpId === item.id && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        Send follow-up message
                      </p>
                      <textarea
                        value={followUpText}
                        onChange={e => setFollowUpText(e.target.value)}
                        rows={3}
                        placeholder="Type a follow-up message..."
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleFollowUp(item)}
                          disabled={sendingFollowUp || !followUpText.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-sm font-medium rounded-lg transition"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {sendingFollowUp ? 'Sending...' : 'Send Follow-up'}
                        </button>
                        <button
                          onClick={() => { setFollowUpId(null); setFollowUpText('') }}
                          className="flex items-center gap-1 px-3 py-2 text-gray-600 dark:text-gray-400 text-sm hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                {((item.status === 'pending' && activeId !== item.id) || (item.status === 'replied' && followUpId !== item.id)) && (
                  <div className="px-5 pb-4 flex gap-2">
                    {item.status === 'pending' && (
                      <>
                        <button
                          onClick={() => openReply(item)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Reply
                        </button>
                        <button
                          onClick={() => handleDismiss(item.id)}
                          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition"
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                    {item.status === 'replied' && (
                      <button
                        onClick={() => { setFollowUpId(item.id); setFollowUpText('') }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-sm font-medium rounded-lg border border-amber-200 dark:border-amber-800 transition"
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5" />
                        Send Follow-up
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
