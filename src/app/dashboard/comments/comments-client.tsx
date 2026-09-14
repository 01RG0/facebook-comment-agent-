'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  MessageSquare,
  RefreshCw,
  ChevronLeft,
  Reply,
  Mail,
  EyeOff,
  Trash2,
  Send,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export interface CommentAuthor {
  id: string
  name?: string
  username?: string
  pictureUrl?: string
  avatarUrl?: string
  avatar?: string
  authorPicture?: string
}

export interface CommentItem {
  id: string
  platformPostId?: string
  postId?: string
  text?: string
  message?: string
  content?: string
  author?: CommentAuthor
  from?: CommentAuthor
  authorName?: string
  authorPicture?: string
  createdAt?: string | number
  created_time?: string | number
  createdTime?: string | number
  isReply?: boolean
  parentCommentId?: string | null
  hidden?: boolean
}

export interface PostGroup {
  id: string
  platformPostId: string
  page_id: string
  page_name: string
  zernioAccountId: string
  caption: string
  imageUrl?: string | null
  createdAt: string | number
  comments: CommentItem[]
}

const AVATAR_COLORS = [
  'bg-red-500 text-white',
  'bg-blue-500 text-white',
  'bg-emerald-500 text-white',
  'bg-amber-500 text-white',
  'bg-purple-500 text-white',
  'bg-pink-500 text-white',
  'bg-indigo-500 text-white',
  'bg-teal-500 text-white',
  'bg-cyan-500 text-white',
]

function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length
  return AVATAR_COLORS[index]
}

function getInitials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function safeFormatDistance(time?: string | number): string {
  if (!time) return 'recently'
  try {
    const d = typeof time === 'number' ? new Date(time > 1e11 ? time : time * 1000) : new Date(time)
    if (isNaN(d.getTime())) return 'recently'
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return 'recently'
  }
}

export default function CommentsClient() {
  const [posts, setPosts] = useState<PostGroup[]>([])
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [aiRepliedIds, setAiRepliedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Action state per comment
  const [activeActionCommentId, setActiveActionCommentId] = useState<string | null>(null)
  const [actionType, setActionType] = useState<'reply' | 'dm' | null>(null)
  const [actionText, setActionText] = useState('')
  const [submittingAction, setSubmittingAction] = useState(false)

  const normalizeApiData = (rawList: any[]): PostGroup[] => {
    // If raw items are already posts with comments
    const postsMap = new Map<string, PostGroup>()

    for (const raw of rawList) {
      if (!raw) continue

      // Case 1: The item is a Post object that contains a list of comments
      if (Array.isArray(raw.comments) || raw.platformPostId && (raw.caption || raw.message || raw.text)) {
        const postId = String(raw.platformPostId || raw.id || `post-${Math.random()}`)
        const rawComments: any[] = Array.isArray(raw.comments) ? raw.comments : []
        const normalizedComments: CommentItem[] = rawComments.map((c) => ({
          id: String(c.id || c.commentId || c.fb_comment_id),
          platformPostId: postId,
          text: c.text ?? c.message ?? c.content ?? '',
          author: c.author ?? c.from ?? {
            id: c.authorId || c.fromId || 'unknown',
            name: c.authorName || c.name || 'Anonymous',
            pictureUrl: c.authorPicture || c.pictureUrl,
          },
          createdAt: c.createdAt || c.created_time || c.createdTime || Date.now(),
          isReply: Boolean(c.isReply),
          parentCommentId: c.parentCommentId ?? null,
          hidden: Boolean(c.hidden),
        }))

        postsMap.set(postId, {
          id: postId,
          platformPostId: postId,
          page_id: raw.page_id || '',
          page_name: raw.page_name || 'Facebook Page',
          zernioAccountId: raw.zernio_account_id || raw.accountId || raw.account?.id || '',
          caption: raw.caption ?? raw.message ?? raw.text ?? 'Facebook Post',
          imageUrl: raw.imageUrl || raw.picture || raw.mediaUrl || null,
          createdAt: raw.createdAt || raw.created_time || Date.now(),
          comments: normalizedComments,
        })
      } else {
        // Case 2: The item is directly a comment object with post info
        const postId = String(raw.platformPostId || raw.postId || raw.post?.platformPostId || raw.post?.id || 'default-post')
        const commentId = String(raw.id || raw.commentId || raw.fb_comment_id || `comment-${Math.random()}`)

        const commentItem: CommentItem = {
          id: commentId,
          platformPostId: postId,
          text: raw.text ?? raw.message ?? raw.content ?? '',
          author: raw.author ?? raw.from ?? {
            id: raw.authorId || raw.fromId || raw.commenter_id || 'unknown',
            name: raw.authorName || raw.author?.name || raw.from?.name || 'Anonymous',
            pictureUrl: raw.authorPicture || raw.pictureUrl || raw.author?.pictureUrl,
          },
          createdAt: raw.createdAt || raw.created_time || raw.createdTime || Date.now(),
          isReply: Boolean(raw.isReply),
          parentCommentId: raw.parentCommentId ?? null,
          hidden: Boolean(raw.hidden),
        }

        if (postsMap.has(postId)) {
          const existing = postsMap.get(postId)!
          // Avoid duplicate comments
          if (!existing.comments.some((c) => c.id === commentId)) {
            existing.comments.push(commentItem)
          }
        } else {
          postsMap.set(postId, {
            id: postId,
            platformPostId: postId,
            page_id: raw.page_id || '',
            page_name: raw.page_name || 'Facebook Page',
            zernioAccountId: raw.zernio_account_id || raw.accountId || raw.account?.id || '',
            caption: raw.postCaption || raw.post?.text || raw.post?.caption || raw.caption || 'Facebook Post',
            imageUrl: raw.postImageUrl || raw.post?.imageUrl || null,
            createdAt: raw.createdAt || Date.now(),
            comments: [commentItem],
          })
        }
      }
    }

    return Array.from(postsMap.values())
  }

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    else setRefreshing(true)

    try {
      const [commentsRes, repliedRes] = await Promise.all([
        fetch('/api/comments'),
        fetch('/api/comments?aiReplied=1'),
      ])

      if (!commentsRes.ok) {
        throw new Error(`Failed to load comments (${commentsRes.status})`)
      }

      const commentsJson = await commentsRes.json()
      const rawData = commentsJson.data ?? []
      const normalized = normalizeApiData(rawData)
      setPosts(normalized)

      if (repliedRes.ok) {
        const repliedJson = await repliedRes.json()
        if (Array.isArray(repliedJson.repliedCommentIds)) {
          setAiRepliedIds(new Set(repliedJson.repliedCommentIds))
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load comments')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return posts
    const q = searchQuery.toLowerCase()
    return posts.filter(
      (p) =>
        p.caption.toLowerCase().includes(q) ||
        p.page_name.toLowerCase().includes(q) ||
        p.comments.some((c) => (c.text ?? '').toLowerCase().includes(q))
    )
  }, [posts, searchQuery])

  const selectedPost = useMemo(() => {
    return posts.find((p) => p.id === selectedPostId) ?? null
  }, [posts, selectedPostId])

  const handleActionClick = (commentId: string, type: 'reply' | 'dm') => {
    if (activeActionCommentId === commentId && actionType === type) {
      // Toggle off
      setActiveActionCommentId(null)
      setActionType(null)
      setActionText('')
    } else {
      setActiveActionCommentId(commentId)
      setActionType(type)
      setActionText('')
    }
  }

  const handleSendAction = async (comment: CommentItem) => {
    if (!actionText.trim() || !actionType || !selectedPost) return

    setSubmittingAction(true)
    try {
      const recipientId = comment.author?.id || comment.from?.id

      const payload: Record<string, any> = {
        action: actionType,
        platformPostId: selectedPost.platformPostId,
        accountId: selectedPost.zernioAccountId,
        message: actionText.trim(),
        recipientId,
      }

      const res = await fetch(`/api/comments/${encodeURIComponent(comment.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || `Action failed (${res.status})`)
      }

      toast.success(actionType === 'reply' ? 'Reply posted successfully' : 'DM sent successfully')
      setActiveActionCommentId(null)
      setActionType(null)
      setActionText('')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to execute action')
    } finally {
      setSubmittingAction(false)
    }
  }

  const handleHideComment = async (comment: CommentItem) => {
    if (!selectedPost) return
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(comment.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hide',
          platformPostId: selectedPost.platformPostId,
          accountId: selectedPost.zernioAccountId,
        }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Failed to hide comment')
      }

      toast.success('Comment hidden')
      // Update local state
      setPosts((prev) =>
        prev.map((post) => {
          if (post.id !== selectedPost.id) return post
          return {
            ...post,
            comments: post.comments.map((c) =>
              c.id === comment.id ? { ...c, hidden: true } : c
            ),
          }
        })
      )
    } catch (err: any) {
      toast.error(err?.message || 'Error hiding comment')
    }
  }

  const handleDeleteComment = async (comment: CommentItem) => {
    if (!selectedPost) return
    if (!confirm('Are you sure you want to delete this comment?')) return

    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(comment.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          platformPostId: selectedPost.platformPostId,
          accountId: selectedPost.zernioAccountId,
        }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Failed to delete comment')
      }

      toast.success('Comment deleted')
      // Update local state
      setPosts((prev) =>
        prev.map((post) => {
          if (post.id !== selectedPost.id) return post
          return {
            ...post,
            comments: post.comments.filter((c) => c.id !== comment.id),
          }
        })
      )
    } catch (err: any) {
      toast.error(err?.message || 'Error deleting comment')
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Posts List */}
        <div
          className={cn(
            'w-full md:w-80 lg:w-96 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 shrink-0',
            selectedPostId ? 'hidden md:flex' : 'flex'
          )}
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Posts</h2>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                {posts.length}
              </span>
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={() => loadData(true)}
              disabled={loading || refreshing}
              className="gap-1.5 text-xs text-gray-600 dark:text-gray-400"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', (refreshing || loading) && 'animate-spin')} />
              <span>Refresh</span>
            </Button>
          </div>

          {/* Search bar */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Filter posts by caption..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/60 p-2 space-y-1">
            {loading ? (
              <div className="space-y-3 p-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-xl bg-white dark:bg-gray-800/40 animate-pulse border border-gray-100 dark:border-gray-800">
                    <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-gray-500 dark:text-gray-400">
                <MessageSquare className="w-10 h-10 stroke-[1.5] mb-2 opacity-40" />
                <p className="text-sm font-medium">No posts found</p>
                <p className="text-xs text-gray-400 mt-1">Connect your pages to start viewing comments</p>
              </div>
            ) : (
              filteredPosts.map((post) => {
                const isSelected = selectedPostId === post.id
                const commentCount = post.comments.length
                return (
                  <button
                    key={post.id}
                    onClick={() => setSelectedPostId(post.id)}
                    className={cn(
                      'w-full text-left p-3 rounded-xl transition flex gap-3 items-start group relative',
                      isSelected
                        ? 'bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 shadow-xs'
                        : 'hover:bg-white dark:hover:bg-gray-800/60 border border-transparent'
                    )}
                  >
                    {/* Thumbnail */}
                    {post.imageUrl ? (
                      <img
                        src={post.imageUrl}
                        alt="Post media"
                        className="w-12 h-12 rounded-lg object-cover shrink-0 border border-gray-200 dark:border-gray-700"
                      />
                    ) : (
                      <div
                        className={cn(
                          'w-12 h-12 rounded-lg shrink-0 flex items-center justify-center font-bold text-sm select-none',
                          avatarColor(post.page_name)
                        )}
                      >
                        {getInitials(post.page_name)}
                      </div>
                    )}

                    {/* Post info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate">
                          {post.page_name}
                        </span>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">
                          {safeFormatDistance(post.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {post.caption || 'No caption'}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
                          <MessageSquare className="w-3 h-3" />
                          {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Right panel: Comments */}
        <div
          className={cn(
            'flex-1 flex flex-col bg-white dark:bg-gray-900',
            !selectedPostId ? 'hidden md:flex' : 'flex'
          )}
        >
          {!selectedPost ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500 dark:text-gray-400">
              <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 stroke-[1.5] text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Select a post to view comments
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mt-1">
                Choose any post from the left sidebar to moderate comments, send replies, or reply via DM.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3 bg-white dark:bg-gray-900 sticky top-0 z-10">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setSelectedPostId(null)}
                    className="md:hidden p-1.5 -ml-1 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
                    aria-label="Back to posts"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate">
                      {selectedPost.caption || 'Facebook Post'}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedPost.page_name} &bull; ({selectedPost.comments.length}{' '}
                      {selectedPost.comments.length === 1 ? 'comment' : 'comments'})
                    </p>
                  </div>
                </div>
              </div>

              {/* Scrollable comments list */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                {selectedPost.comments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center text-gray-400">
                    <MessageSquare className="w-8 h-8 opacity-40 mb-2" />
                    <p className="text-sm">No comments on this post yet</p>
                  </div>
                ) : (
                  selectedPost.comments.map((comment) => {
                    const commenterName =
                      comment.author?.name ||
                      comment.from?.name ||
                      comment.authorName ||
                      'Anonymous'
                    const authorPic =
                      comment.author?.pictureUrl ||
                      comment.author?.avatarUrl ||
                      comment.authorPicture ||
                      comment.from?.pictureUrl
                    const isAiReplied = aiRepliedIds.has(comment.id)
                    const isActionOpen = activeActionCommentId === comment.id

                    return (
                      <div
                        key={comment.id}
                        className={cn(
                          'p-4 rounded-xl border transition-all',
                          comment.hidden
                            ? 'bg-gray-50/60 dark:bg-gray-800/30 border-dashed border-gray-300 dark:border-gray-700 opacity-60'
                            : 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {/* Avatar */}
                          <Avatar className="h-9 w-9 shrink-0">
                            {authorPic && <AvatarImage src={authorPic} alt={commenterName} />}
                            <AvatarFallback className={cn('text-xs font-semibold', avatarColor(commenterName))}>
                              {getInitials(commenterName)}
                            </AvatarFallback>
                          </Avatar>

                          {/* Comment Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {commenterName}
                                </span>
                                {isAiReplied && (
                                  <Badge
                                    variant="outline"
                                    className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 text-[10px] px-1.5 py-0"
                                  >
                                    AI Replied
                                  </Badge>
                                )}
                                {comment.hidden && (
                                  <Badge
                                    variant="outline"
                                    className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-[10px] px-1.5 py-0"
                                  >
                                    Hidden
                                  </Badge>
                                )}
                              </div>
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                {safeFormatDistance(comment.createdAt)}
                              </span>
                            </div>

                            <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-300 break-words whitespace-pre-wrap">
                              {comment.text || 'No comment text'}
                            </p>

                            {/* Action Bar */}
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                              {/* Reply Button (Emerald) */}
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => handleActionClick(comment.id, 'reply')}
                                className={cn(
                                  'border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/50 gap-1.5 font-medium',
                                  isActionOpen && actionType === 'reply' && 'bg-emerald-50 dark:bg-emerald-950/50 ring-1 ring-emerald-500'
                                )}
                              >
                                <Reply className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Reply</span>
                              </Button>

                              {/* DM Button (Blue) */}
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => handleActionClick(comment.id, 'dm')}
                                className={cn(
                                  'border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950/50 gap-1.5 font-medium',
                                  isActionOpen && actionType === 'dm' && 'bg-blue-50 dark:bg-blue-950/50 ring-1 ring-blue-500'
                                )}
                              >
                                <Mail className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">DM</span>
                              </Button>

                              {/* Hide Button (Gray) */}
                              {!comment.hidden && (
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={() => handleHideComment(comment)}
                                  className="text-gray-600 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 gap-1.5 font-medium"
                                >
                                  <EyeOff className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Hide</span>
                                </Button>
                              )}

                              {/* Delete Button (Red) */}
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => handleDeleteComment(comment)}
                                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/50 gap-1.5 font-medium"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Delete</span>
                              </Button>
                            </div>

                            {/* Inline Form for Reply / DM */}
                            {isActionOpen && (
                              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900/80 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2 animate-in fade-in-50 duration-200">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                    {actionType === 'reply' ? 'Public Reply to Comment:' : 'Direct Message (Messenger):'}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setActiveActionCommentId(null)
                                      setActionType(null)
                                    }}
                                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                  >
                                    Cancel
                                  </button>
                                </div>
                                <Textarea
                                  rows={2}
                                  placeholder={actionType === 'reply' ? 'Write a public reply...' : 'Type a private Messenger message...'}
                                  value={actionText}
                                  onChange={(e) => setActionText(e.target.value)}
                                  className="bg-white dark:bg-gray-800 text-sm focus-visible:ring-1"
                                />
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="xs"
                                    disabled={!actionText.trim() || submittingAction}
                                    onClick={() => handleSendAction(comment)}
                                    className={cn(
                                      'gap-1.5 text-white',
                                      actionType === 'reply' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
                                    )}
                                  >
                                    <Send className="w-3 h-3" />
                                    <span>{actionType === 'reply' ? 'Send Reply' : 'Send DM'}</span>
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
