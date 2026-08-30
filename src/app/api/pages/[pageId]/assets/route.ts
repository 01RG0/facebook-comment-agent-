import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: { pageId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: page } = await supabase
    .from('pages').select('id').eq('id', params.pageId).eq('user_id', user.id).single()
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: assets } = await supabase
    .from('page_assets')
    .select('id, label, description, tags, file_url, file_type, created_at')
    .eq('page_id', params.pageId)
    .order('created_at', { ascending: false })

  return NextResponse.json(assets ?? [])
}

export async function POST(
  req: NextRequest,
  { params }: { params: { pageId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: page } = await supabase
    .from('pages').select('id').eq('id', params.pageId).eq('user_id', user.id).single()
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const label = (formData.get('label') as string | null)?.trim()
  const description = (formData.get('description') as string | null)?.trim() ?? ''
  const tagsRaw = (formData.get('tags') as string | null) ?? ''
  const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)

  if (!file || !label) return NextResponse.json({ error: 'file and label are required' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })

  const ext = file.name.split('.').pop() ?? 'jpg'
  const storagePath = `${user.id}/${params.pageId}/${Date.now()}.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: uploadErr } = await supabase.storage
    .from('page-assets')
    .upload(storagePath, bytes, { contentType: file.type, upsert: false })

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('page-assets').getPublicUrl(storagePath)

  const { data: asset, error } = await supabase
    .from('page_assets')
    .insert({
      page_id: params.pageId,
      user_id: user.id,
      label,
      description,
      tags,
      file_url: publicUrl,
      file_name: file.name,
      file_type: file.type.startsWith('image/') ? 'image' : 'file',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(asset, { status: 201 })
}
