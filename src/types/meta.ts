export interface MetaWebhookBody {
  object: string
  entry: MetaEntry[]
}

export interface MetaEntry {
  id: string
  time: number
  changes: MetaChange[]
}

export interface MetaChange {
  value: MetaChangeValue
  field: string
}

export interface MetaChangeValue {
  item: 'comment' | 'post' | 'status' | 'photo' | 'video'
  verb: 'add' | 'edited' | 'remove' | 'like' | 'unlike' | 'hide' | 'unhide'
  comment_id?: string
  post_id?: string
  parent_id?: string
  from?: { id: string; name: string }
  message?: string
  created_time?: number
  can_reply_privately?: boolean
  link?: string
  photo?: string
  photo_id?: string
  video_id?: string
  video?: string
}

export interface CommentJobPayload {
  pageId: string
  fbPageId: string
  commentId: string
  postId: string
  from: { id: string; name: string }
  message: string
  createdTime: number
}
