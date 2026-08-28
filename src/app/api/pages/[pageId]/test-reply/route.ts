import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAiProvider } from '@/lib/ai/factory'
import type { AiProviderName } from '@/lib/ai/types'

// Generate a preview reply without sending to Facebook
export async function POST(
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

  const { comment_text } = await req.json()
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

    const reply = await provider.generateReply(
      comment_text,
      settings.reply_instructions,
      settings.reply_language
    )

    return NextResponse.json({ reply, provider: provider.providerName, model: provider.modelName })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
