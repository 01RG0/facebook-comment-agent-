import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAiProvider } from '@/lib/ai/factory'
import { sendZernioConversationMessage } from '@/lib/zernio/client'
import type { AiProviderName } from '@/lib/ai/types'

export async function POST(
  req: NextRequest,
  { params }: { params: { pageId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: page } = await (supabase as any)
    .from('pages')
    .select('id, zernio_account_id')
    .eq('id', params.pageId)
    .eq('user_id', user.id)
    .single()
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const { comment_text, recipient_id } = await req.json()
  if (!comment_text) return NextResponse.json({ error: 'comment_text required' }, { status: 400 })

  const { data: settings } = await supabase
    .from('settings')
    .select('ai_provider, ai_model, ai_api_key_enc, ai_api_key_iv, reply_instructions, reply_language')
    .eq('page_id', params.pageId)
    .single()

  if (!settings) return NextResponse.json({ error: 'Settings not found' }, { status: 404 })

  try {
    const provider = createAiProvider(
      {
        provider: (settings.ai_provider as AiProviderName) ?? 'gemini',
        model: settings.ai_model ?? undefined,
      },
      settings.ai_api_key_enc && settings.ai_api_key_iv
        ? { enc: settings.ai_api_key_enc, iv: settings.ai_api_key_iv }
        : undefined
    )

    const result = await provider.generateReply(
      comment_text,
      settings.reply_instructions,
      settings.reply_language
    )

    const replyText = result.text
    let sent = false
    let sendError: string | null = null

    // If a recipient_id is provided, actually send the DM via Zernio
    if (recipient_id?.trim() && page.zernio_account_id) {
      try {
        await sendZernioConversationMessage(recipient_id.trim(), page.zernio_account_id, replyText)
        sent = true
      } catch (err: any) {
        sendError = err?.message || 'Failed to send'
      }
    }

    return NextResponse.json({
      reply: replyText,
      provider: provider.providerName,
      model: provider.modelName,
      tokens: result.tokens,
      latencyMs: result.latencyMs,
      sent,
      sendError,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
