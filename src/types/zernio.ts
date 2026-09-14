export interface ZernioAuthor {
  id: string
  name?: string
  username?: string
  isOwnAccount?: boolean
}

export interface ZernioComment {
  id: string
  platformPostId: string
  platform: 'facebook' | 'instagram' | string
  text: string
  isReply: boolean
  parentCommentId: string | null
  author: ZernioAuthor
  createdAt: string
}

export interface ZernioPost {
  platformPostId: string
}

export interface ZernioAccount {
  id: string
  platform: string
  username: string
}

export interface ZernioCommentPayload {
  id: string
  event: 'comment.received'
  timestamp: string
  comment: ZernioComment
  post: ZernioPost
  account: ZernioAccount
}

export interface CommentJobPayload {
  pageId: string
  fbPageId: string
  zernioAccountId: string
  commentId: string
  platformPostId: string
  postId: string
  from: { id: string; name: string }
  message: string
  createdTime: number
}

export interface DmJobPayload {
  pageId: string
  fbPageId: string
  zernioAccountId: string
  threadId: string
  messageId: string
  fbMessageId: string
  senderId: string
  senderName: string
  senderAvatar: string | null
  message: string
  createdTime: number
}

