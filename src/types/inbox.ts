export type ThreadStatus = 'open' | 'in_progress' | 'resolved' | 'snoozed'
export type ThreadPriority = 'normal' | 'urgent'
export type MessageDirection = 'inbound' | 'outbound'

export interface MessengerThread {
  id: string
  page_id: string
  user_id: string
  sender_id: string
  sender_name: string | null
  sender_avatar: string | null
  status: ThreadStatus
  priority: ThreadPriority
  assigned_to: string | null
  labels: string[]
  unread_count: number
  snoozed_until: string | null
  last_message_at: string
  created_at: string
  assigned_profile?: {
    id: string
    full_name: string | null
    email: string
    avatar_url: string | null
  } | null
  page?: {
    id: string
    page_name: string
    fb_page_id?: string
  } | null
  last_message?: {
    id: string
    thread_id: string
    direction: MessageDirection
    text: string
    sent_by_label: string | null
    sent_at: string
  } | null
}

export interface MessengerMessage {
  id: string
  thread_id: string
  fb_message_id: string | null
  direction: MessageDirection
  text: string
  sent_by: string | null
  sent_by_label: string | null
  ai_confidence: number | null
  delivered_at: string | null
  read_at: string | null
  sent_at: string
}

export interface MessengerNote {
  id: string
  thread_id: string
  author_id: string
  text: string
  mentions: string[]
  created_at: string
  author?: {
    id: string
    full_name: string | null
    email: string
    avatar_url: string | null
  } | null
}

export interface ThreadEvent {
  id: string
  thread_id: string
  actor_id: string | null
  event_type: string
  payload: Record<string, any>
  created_at: string
  actor?: {
    id: string
    full_name: string | null
    email: string
    avatar_url: string | null
  } | null
}

export interface TeamMemberItem {
  id: string
  full_name: string | null
  email: string
  avatar_url: string | null
}

export interface PageOption {
  id: string
  page_name: string
}
