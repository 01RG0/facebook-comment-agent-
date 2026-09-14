'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  MessageSquare, RefreshCw, ChevronLeft, Reply,
  Mail, EyeOff, Eye, Trash2, Send, Search, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Post {
  id: string
  accountId: string
  caption: string
  picture: string | null
  commentCount: number
  createdTime: string
  permalink: string | null
  page_id: string
  page_name: string
  zernio_account_id: string
}

interface Comment {
  id: string
  message: string
  authorName: string
  authorPicture: string | null
  authorId: string
  isOwner: boolean
  createdTime: string
  isHidden: boolean
  canReply: boolean
  canDelete: boolean
  canHide: boolean
}

const COLORS = ['bg-violet-500','bg-blue-500','bg-emerald-500','bg-orange-500','bg-rose-500','bg-indigo-500']
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}
function initials(name: string) {
  const p = name.trim().split(/\s+/)
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase()
}
function timeAgo(t?: string) {
  if (!t) return 'recently'
  try { return formatDistanceToNow(new Date(t), { addSuffix: true }) } catch { return 'recently' }
}

export default function CommentsClient() {
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [actionType, setActionType] = useState<'reply' | 'dm' | null>(null)
  const [actionText, setActionText] = useState('')
  const [sending, setSending] = useState(false)
  const [aiRepliedIds, setAiRepliedIds] = useState<Set<string>>(new Set())

  const loadPosts = useCallback(async () => {
    setLoading(true)
    try {
      const [postsRes, aiRes] = await Promise.all([
        fetch('/api/comments'),
        fetch('/api/comments?aiReplied=1'),
      ])
      const postsJson = await postsRes.json()
      setPosts(postsJson.posts ?? [])
      if (aiRes.ok) {
        const aiJson = await aiRes.json()
        if (Array.isArray(aiJson.repliedCommentIds)) {
          setAiRepliedIds(new Set(aiJson.repliedCommentIds))
        }
      }
    } catch {
      toast.error('Failed to load posts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPosts() }, [loadPosts])

  const selectPost = async (post: Post) => {
    setSelectedPost(post)
    setComments([])
    setCommentsLoading(true)
    setActiveId(null)
    setActionType(null)
    try {
      const res = await fetch(`/api/comments?postId=${encodeURIComponent(post.id)}&accountId=${encodeURIComponent(post.zernio_account_id)}`)
      const json = await res.json()
      setComments(json.comments ?? [])
    } catch {
      toast.error('Failed to load comments')
    } finally {
      setCommentsLoading(false)
    }
  }

  const sendAction = async (comment: Comment) => {
    if (!actionText.trim() || !actionType || !selectedPost) return
    setSending(true)
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(comment.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionType,
          platformPostId: selectedPost.id,
          accountId: selectedPost.zernio_account_id,
          message: actionText.trim(),
          recipientId: comment.authorId,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(actionType === 'reply' ? 'Reply posted' : 'DM sent')
      setActiveId(null); setActionType(null); setActionText('')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const hideComment = async (comment: Comment) => {
    if (!selectedPost) return
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(comment.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hide', platformPostId: selectedPost.id, accountId: selectedPost.zernio_account_id }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Comment hidden')
      setComments(prev => prev.map(c => c.id === comment.id ? { ...c, isHidden: true } : c))
    } catch (err: any) { toast.error(err?.message || 'Failed to hide') }
  }

  const unhideComment = async (comment: Comment) => {
    if (!selectedPost) return
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(comment.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unhide', platformPostId: selectedPost.id, accountId: selectedPost.zernio_account_id }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Comment unhidden')
      setComments(prev => prev.map(c => c.id === comment.id ? { ...c, isHidden: false } : c))
    } catch (err: any) { toast.error(err?.message || 'Failed to unhide') }
  }

  const deleteComment = async (comment: Comment) => {
    if (!selectedPost || !confirm('Delete this comment?')) return
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(comment.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', platformPostId: selectedPost.id, accountId: selectedPost.zernio_account_id }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Comment deleted')
      setComments(prev => prev.filter(c => c.id !== comment.id))
    } catch (err: any) { toast.error(err?.message || 'Failed to delete') }
  }

  const filtered = posts.filter(p =>
    !search.trim() ||
    p.caption.toLowerCase().includes(search.toLowerCase()) ||
    p.page_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">

      {/* LEFT: Posts list */}
      <div className={cn(
        'w-full md:w-80 lg:w-96 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50 shrink-0',
        selectedPost ? 'hidden md:flex' : 'flex'
      )}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Posts</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium">{posts.length}</span>
          </div>
          <button onClick={loadPosts} disabled={loading} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>

        <div className="p-3 border-b border-gray-200 dark:border-gray-800">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search posts..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 animate-pulse border border-gray-100 dark:border-gray-800">
                <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
              <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No posts found</p>
              <p className="text-xs mt-1">Make sure your page is connected</p>
            </div>
          ) : filtered.map(post => (
            <button
              key={post.id}
              onClick={() => selectPost(post)}
              className={cn(
                'w-full text-left p-3 rounded-xl transition flex gap-3 items-start border',
                selectedPost?.id === post.id
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800'
                  : 'border-transparent hover:bg-white dark:hover:bg-gray-800/60 hover:border-gray-200 dark:hover:border-gray-700'
              )}
            >
              {post.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.picture} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 border border-gray-200 dark:border-gray-700" />
              ) : (
                <div className={cn('w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-white text-sm font-bold', avatarColor(post.page_name))}>
                  {initials(post.page_name)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-semibold text-gray-500 truncate">{post.page_name}</span>
                  <span className="text-[11px] text-gray-400 shrink-0">{timeAgo(post.createdTime)}</span>
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {post.caption || '(No caption)'}
                </p>
                <span className="inline-flex items-center gap-1 mt-1.5 text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
                  <MessageSquare className="w-3 h-3" />
                  {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT: Comments */}
      <div className={cn('flex-1 flex flex-col', !selectedPost ? 'hidden md:flex' : 'flex')}>
        {!selectedPost ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <MessageSquare className="w-8 h-8 opacity-40" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-700 dark:text-gray-300">Select a post</p>
              <p className="text-sm mt-0.5">Choose a post to view and moderate comments</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 bg-white dark:bg-gray-900">
              <button
                onClick={() => setSelectedPost(null)}
                className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-gray-900 dark:text-white truncate">{selectedPost.caption || '(No caption)'}</h2>
                <p className="text-xs text-gray-500">{selectedPost.page_name} · {comments.length} comments</p>
              </div>
              {selectedPost.permalink && (
                <a href={selectedPost.permalink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0">
                  View post ↗
                </a>
              )}
            </div>

            {/* Comments */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {commentsLoading ? (
                <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading comments...</span>
                </div>
              ) : comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-center">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">No comments on this post yet</p>
                </div>
              ) : comments.map(comment => {
                const isOpen = activeId === comment.id
                const isAiReplied = aiRepliedIds.has(comment.id)
                return (
                  <div
                    key={comment.id}
                    className={cn(
                      'p-4 rounded-xl border transition-all',
                      comment.isHidden
                        ? 'bg-gray-50 dark:bg-gray-800/30 border-dashed border-gray-300 dark:border-gray-700 opacity-60'
                        : 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="shrink-0">
                        {comment.authorPicture ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={comment.authorPicture} alt={comment.authorName} className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold', avatarColor(comment.authorName))}>
                            {initials(comment.authorName)}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                              {comment.authorName}
                              {comment.isOwner && <span className="ml-1 text-xs text-blue-500 font-normal">(you)</span>}
                            </span>
                            {isAiReplied && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-medium">
                                AI Replied
                              </span>
                            )}
                            {comment.isHidden && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700 font-medium">
                                Hidden
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">{timeAgo(comment.createdTime)}</span>
                        </div>

                        <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-300 break-words">
                          {comment.message || <span className="italic text-gray-400">No text</span>}
                        </p>

                        {/* Action buttons */}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {comment.canReply && (
                            <button
                              onClick={() => { setActiveId(isOpen && actionType === 'reply' ? null : comment.id); setActionType('reply'); setActionText('') }}
                              className={cn('flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition', isOpen && actionType === 'reply' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-400' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/30')}
                            >
                              <Reply className="w-3.5 h-3.5" /><span className="hidden sm:inline">Reply</span>
                            </button>
                          )}
                          <button
                            onClick={() => { setActiveId(isOpen && actionType === 'dm' ? null : comment.id); setActionType('dm'); setActionText('') }}
                            className={cn('flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition', isOpen && actionType === 'dm' ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/40 dark:border-blue-700 dark:text-blue-400' : 'border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950/30')}
                          >
                            <Mail className="w-3.5 h-3.5" /><span className="hidden sm:inline">DM</span>
                          </button>
                          {comment.canHide && !comment.isHidden && (
                            <button
                              onClick={() => hideComment(comment)}
                              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 transition"
                            >
                              <EyeOff className="w-3.5 h-3.5" /><span className="hidden sm:inline">Hide</span>
                            </button>
                          )}
                          {comment.isHidden && (
                            <button
                              onClick={() => unhideComment(comment)}
                              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30 transition"
                            >
                              <Eye className="w-3.5 h-3.5" /><span className="hidden sm:inline">Unhide</span>
                            </button>
                          )}
                          {comment.canDelete && (
                            <button
                              onClick={() => deleteComment(comment)}
                              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Delete</span>
                            </button>
                          )}
                        </div>

                        {/* Reply/DM form */}
                        {isOpen && (
                          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                {actionType === 'reply' ? 'Public reply:' : 'Send via Messenger:'}
                              </p>
                              <button onClick={() => { setActiveId(null); setActionType(null) }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                            </div>
                            <textarea
                              rows={2}
                              value={actionText}
                              onChange={e => setActionText(e.target.value)}
                              placeholder={actionType === 'reply' ? 'Write a public reply...' : 'Type a private message...'}
                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            />
                            <div className="flex justify-end">
                              <button
                                disabled={!actionText.trim() || sending}
                                onClick={() => sendAction(comment)}
                                className={cn('flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-white transition disabled:opacity-50', actionType === 'reply' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700')}
                              >
                                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                {actionType === 'reply' ? 'Send Reply' : 'Send DM'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
