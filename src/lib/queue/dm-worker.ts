import { getAdminClient } from '@/lib/supabase/admin'
import { createAiProvider } from '@/lib/ai/factory'
import { sendZernioConversationMessage } from '@/lib/zernio/client'
import { validateExternalUrl } from '@/lib/utils'
import { decrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import type { AiProviderName } from '@/lib/ai/types'

export interface DmJobPayload {
  threadId: string
  pageId: string
  senderId: string
  senderName: string
  message: string
}

export async function processDmJob(data: DmJobPayload): Promise<void> {
  const { threadId, pageId, senderId, senderName, message } = data
  const log = logger.child({ threadId, pageId })
  const jobStart = Date.now()
  log.info({ senderName, messagePreview: message.slice(0, 80) }, 'DM job started')

  const db = getAdminClient()

  try {
    const { data: page, error: pageErr } = await db
      .from('pages')
      .select('id, user_id, fb_page_id, zernio_account_id, agent_enabled')
      .eq('id', pageId)
      .single()

    if (pageErr || !page) { log.warn({ pageId }, 'Page not found, skipping DM'); return }
    if (!page.agent_enabled) { log.info('Agent disabled, skipping DM'); return }

    // Dedup: skip if an outbound AI reply was already sent in the last 30s (race condition guard)
    const { data: recentOutbound } = await db
      .from('messenger_messages')
      .select('id')
      .eq('thread_id', threadId)
      .eq('direction', 'outbound')
      .eq('sent_by_label', 'ai')
      .gte('sent_at', new Date(Date.now() - 30000).toISOString())
      .limit(1)
      .maybeSingle()
    if (recentOutbound) {
      log.info('AI already replied to this thread in the last 30s, skipping duplicate')
      return
    }

    const { data: settings } = await db
      .from('settings')
      .select('ai_provider, ai_model, custom_base_url, ai_api_key_enc, ai_api_key_iv, preferred_ai_key_ids, reply_instructions, reply_language, review_mode_enabled, dm_agent_enabled, dm_reply_instructions, dm_reply_language, dm_reply_tone, dm_reply_length, dm_ai_provider, dm_ai_model, dm_preferred_key_id')
      .eq('page_id', pageId)
      .maybeSingle()

    // Check DM agent toggle (defaults to enabled if column not yet set)
    if (settings?.dm_agent_enabled === false) {
      log.info('DM agent disabled for this page, skipping')
      return
    }

    if (settings?.review_mode_enabled) {
      await db.from('handoff_queue').insert({
        page_id: pageId,
        user_id: page.user_id,
        fb_comment_id: `dm-${threadId}-${Date.now()}`,
        fb_post_id: threadId,
        commenter_id: senderId,
        commenter_name: senderName,
        comment_text: message,
        status: 'pending',
      })
      log.info('Review mode: DM routed to handoff queue')
      return
    }

    let apiKey: string | undefined
    // Use DM-specific provider/model if set, otherwise fall back to page defaults
    let providerName = ((settings?.dm_ai_provider || settings?.ai_provider) ?? 'gemini') as AiProviderName
    let modelName = (settings?.dm_ai_model || settings?.ai_model) ?? undefined
    let baseUrl = settings?.custom_base_url ?? undefined

    // DM-specific key takes priority over everything else
    const dmKeyId: string | null = (settings as any)?.dm_preferred_key_id ?? null
    const preferredKeyIds: string[] = dmKeyId ? [dmKeyId] : (settings?.preferred_ai_key_ids ?? [])
    if (preferredKeyIds.length > 0) {
      const { data: keyRow } = await db
        .from('ai_provider_keys')
        .select('provider, model, base_url, api_key_enc, api_key_iv')
        .eq('id', preferredKeyIds[0])
        .eq('user_id', page.user_id)
        .eq('is_active', true)
        .single()

      if (keyRow?.api_key_enc && keyRow?.api_key_iv) {
        apiKey = decrypt(keyRow.api_key_enc, keyRow.api_key_iv)
        providerName = keyRow.provider as AiProviderName
        modelName = keyRow.model ?? modelName
        baseUrl = keyRow.base_url ?? baseUrl
      }
    } else if (settings?.ai_api_key_enc && settings?.ai_api_key_iv) {
      apiKey = decrypt(settings.ai_api_key_enc, settings.ai_api_key_iv)
    }

    if (baseUrl) { try { validateExternalUrl(baseUrl) } catch { baseUrl = undefined } }
    if (!message.trim()) {
      log.warn({ threadId }, 'DM job skipped — empty message text after all fallbacks')
      return
    }

    // Fetch last 10 messages for context (excludes current — it hasn't been inserted yet)
    const { data: historyRows } = await db
      .from('messenger_messages')
      .select('direction, text')
      .eq('thread_id', threadId)
      .order('sent_at', { ascending: false })
      .limit(10)

    const conversationHistory = (historyRows ?? [])
      .reverse()
      .map(m => ({ role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant', text: m.text ?? '' }))
      .filter(m => m.text)

    // Use DM-specific instructions if set, otherwise fall back to comment instructions
    const instructions = settings?.dm_reply_instructions || settings?.reply_instructions || 'You are a helpful assistant. Reply professionally and concisely.'
    const language = settings?.dm_reply_language || settings?.reply_language || 'auto'
    const provider = createAiProvider({ provider: providerName, apiKey, model: modelName, baseUrl })
    log.info({ provider: providerName, historyLength: conversationHistory.length }, 'DM AI generation started')
    const aiStart = Date.now()
    const aiResult = await provider.generateReply(message, instructions, language, conversationHistory)
    const aiLatencyMs = Date.now() - aiStart
    const aiReply = aiResult.text
    log.info({ provider: providerName, latencyMs: aiLatencyMs, tokens: aiResult.tokens?.totalTokens }, 'DM AI generation done')
    if (aiLatencyMs > 500) log.warn({ provider: providerName, latencyMs: aiLatencyMs }, 'Slow DM AI generation')

    await sendZernioConversationMessage(senderId, page.zernio_account_id ?? '', aiReply)
    const totalMs = Date.now() - jobStart
    log.info({ senderId, totalMs }, 'DM reply sent via Zernio')

    await db.from('messenger_messages').insert({
      thread_id: threadId,
      direction: 'outbound',
      text: aiReply,
      sent_by_label: 'ai',
      sent_at: new Date().toISOString(),
    })

    await db.from('messenger_threads').update({
      last_message_at: new Date().toISOString(),
      unread_count: 0,
    }).eq('id', threadId)

  } catch (err) {
    log.error({ err: (err as Error).message, totalMs: Date.now() - jobStart }, 'DM processing error')
  }
}
