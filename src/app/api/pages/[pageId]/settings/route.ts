import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'

export async function GET(
  _req: NextRequest,
  { params }: { params: { pageId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: page } = await supabase
    .from('pages')
    .select('id')
    .eq('id', params.pageId)
    .eq('user_id', user.id)
    .single()
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const { data: settings, error } = await supabase
    .from('settings')
    .select('id, ai_provider, ai_model, reply_instructions, reply_language, reply_delay_seconds, max_replies_per_hour, keyword_filter, blacklisted_user_ids, reply_to_own_posts_only, updated_at')
    .eq('page_id', params.pageId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Never return encrypted API key — just signal whether it's set
  return NextResponse.json({ ...settings, has_custom_api_key: false })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { pageId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: page } = await supabase
    .from('pages')
    .select('id')
    .eq('id', params.pageId)
    .eq('user_id', user.id)
    .single()
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const body = await req.json()
  const {
    ai_provider, ai_model, ai_api_key,
    reply_instructions, reply_language,
    reply_delay_seconds, max_replies_per_hour,
    keyword_filter, blacklisted_user_ids, reply_to_own_posts_only,
  } = body

  const update: Record<string, unknown> = {}
  if (ai_provider !== undefined) update.ai_provider = ai_provider
  if (ai_model !== undefined) update.ai_model = ai_model
  if (reply_instructions !== undefined) update.reply_instructions = reply_instructions
  if (reply_language !== undefined) update.reply_language = reply_language
  if (reply_delay_seconds !== undefined) update.reply_delay_seconds = reply_delay_seconds
  if (max_replies_per_hour !== undefined) update.max_replies_per_hour = max_replies_per_hour
  if (keyword_filter !== undefined) update.keyword_filter = keyword_filter
  if (blacklisted_user_ids !== undefined) update.blacklisted_user_ids = blacklisted_user_ids
  if (reply_to_own_posts_only !== undefined) update.reply_to_own_posts_only = reply_to_own_posts_only

  // Encrypt API key if provided
  if (ai_api_key) {
    const { enc, iv } = encrypt(ai_api_key)
    update.ai_api_key_enc = enc
    update.ai_api_key_iv = iv
  }

  const { data, error } = await supabase
    .from('settings')
    .update(update)
    .eq('page_id', params.pageId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ...data, has_custom_api_key: !!(data.ai_api_key_enc) })
}
