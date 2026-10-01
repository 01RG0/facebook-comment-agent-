import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendZernioConversationAttachment } from '@/lib/zernio/client'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const BUCKET = 'inbox-attachments'

export async function POST(
  req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminDb = getAdminClient() as any
  const { threadId } = params

  // Verify access
  const { data: thread, error: threadErr } = await adminDb
    .from('messenger_threads')
    .select('*, page:pages(id, user_id, page_name, zernio_account_id)')
    .eq('id', threadId)
    .maybeSingle()

  if (threadErr || !thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  const page = thread.page
  let hasAccess = thread.user_id === user.id || page?.user_id === user.id
  if (!hasAccess && page) {
    const { data: member } = await adminDb.from('team_members').select('id').eq('page_id', page.id).eq('member_id', user.id).maybeSingle()
    if (member) hasAccess = true
  }
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Parse multipart
  const formData = await req.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'File type not allowed' }, { status: 415 })

  // Ensure bucket exists (idempotent)
  await adminDb.storage.createBucket(BUCKET, { public: true }).catch(() => {})

  // Upload to Supabase Storage
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${user.id}/${threadId}/${Date.now()}.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: uploadErr } = await adminDb.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data: urlData } = adminDb.storage.from(BUCKET).getPublicUrl(path)
  const publicUrl: string = urlData?.publicUrl ?? ''

  // Send via Zernio
  const accountId = page?.zernio_account_id ?? ''
  let zernioMsgId: string | undefined
  if (accountId) {
    try {
      const result = await sendZernioConversationAttachment(thread.sender_id, accountId, publicUrl)
      zernioMsgId = result?.messageId ?? undefined
    } catch (err: any) {
      return NextResponse.json({ error: `Zernio send failed: ${err.message}` }, { status: 502 })
    }
  }

  // Get sender label
  const { data: profile } = await adminDb.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle()
  const sentByLabel = profile?.full_name?.trim() || profile?.email || 'Agent'

  const nowIso = new Date().toISOString()
  const isImage = file.type.startsWith('image/')

  // Insert message row
  const { data: message, error: msgErr } = await adminDb.from('messenger_messages').insert({
    thread_id: threadId,
    fb_message_id: zernioMsgId ?? null,
    direction: 'outbound',
    text: isImage ? null : file.name,
    attachment_url: publicUrl,
    attachment_name: file.name,
    attachment_type: file.type,
    sent_by: user.id,
    sent_by_label: sentByLabel,
    delivered_at: nowIso,
  }).select('*').single()

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })

  // Fire-and-forget thread update
  adminDb.from('messenger_threads').update({ last_message_at: nowIso, status: thread.status === 'open' ? 'in_progress' : thread.status }).eq('id', threadId).then(() => {}).catch(() => {})

  return NextResponse.json({ message, url: publicUrl }, { status: 201 })
}
