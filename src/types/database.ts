export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          updated_at?: string
        }
      }
      pages: {
        Row: {
          id: string
          user_id: string
          fb_page_id: string
          page_name: string
          page_picture_url: string | null
          access_token_enc: string
          access_token_iv: string
          agent_enabled: boolean
          webhook_subscribed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          fb_page_id: string
          page_name: string
          page_picture_url?: string | null
          access_token_enc: string
          access_token_iv: string
          agent_enabled?: boolean
          webhook_subscribed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          page_name?: string
          page_picture_url?: string | null
          access_token_enc?: string
          access_token_iv?: string
          agent_enabled?: boolean
          webhook_subscribed?: boolean
          updated_at?: string
        }
      }
      settings: {
        Row: {
          id: string
          page_id: string
          user_id: string
          ai_provider: string
          ai_model: string | null
          ai_api_key_enc: string | null
          ai_api_key_iv: string | null
          reply_instructions: string
          reply_language: string
          reply_delay_seconds: number
          max_replies_per_hour: number
          keyword_filter: string[] | null
          blacklisted_user_ids: string[] | null
          reply_to_own_posts_only: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          page_id: string
          user_id: string
          ai_provider?: string
          ai_model?: string | null
          ai_api_key_enc?: string | null
          ai_api_key_iv?: string | null
          reply_instructions?: string
          reply_language?: string
          reply_delay_seconds?: number
          max_replies_per_hour?: number
          keyword_filter?: string[] | null
          blacklisted_user_ids?: string[] | null
          reply_to_own_posts_only?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          ai_provider?: string
          ai_model?: string | null
          ai_api_key_enc?: string | null
          ai_api_key_iv?: string | null
          reply_instructions?: string
          reply_language?: string
          reply_delay_seconds?: number
          max_replies_per_hour?: number
          keyword_filter?: string[] | null
          blacklisted_user_ids?: string[] | null
          reply_to_own_posts_only?: boolean
          updated_at?: string
        }
      }
      comments_log: {
        Row: {
          id: string
          page_id: string
          user_id: string
          fb_comment_id: string
          fb_post_id: string
          commenter_id: string
          commenter_name: string
          comment_text: string
          reply_text: string | null
          status: 'pending' | 'replied' | 'skipped' | 'failed' | 'manual'
          skip_reason: string | null
          ai_provider: string | null
          ai_model: string | null
          error_message: string | null
          replied_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          page_id: string
          user_id: string
          fb_comment_id: string
          fb_post_id: string
          commenter_id: string
          commenter_name: string
          comment_text: string
          reply_text?: string | null
          status?: 'pending' | 'replied' | 'skipped' | 'failed' | 'manual'
          skip_reason?: string | null
          ai_provider?: string | null
          ai_model?: string | null
          error_message?: string | null
          replied_at?: string | null
          created_at?: string
        }
        Update: {
          reply_text?: string | null
          status?: 'pending' | 'replied' | 'skipped' | 'failed' | 'manual'
          skip_reason?: string | null
          ai_provider?: string | null
          ai_model?: string | null
          error_message?: string | null
          replied_at?: string | null
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
