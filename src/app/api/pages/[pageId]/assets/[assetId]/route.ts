import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { pageId: string; assetId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: asset } = await supabase
    .from('page_assets')
    .select('id, file_url, user_id')
    .eq('id', params.assetId)
    .eq('page_id', params.pageId)
    .eq('user_id', user.id)
    .single()

  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Derive storage path from public URL to delete the file
  const url = new URL(asset.file_url)
  const storagePath = url.pathname.split('/page-assets/').at(1)
  if (storagePath) {
    await supabase.storage.from('page-assets').remove([storagePath])
  }

  const { error } = await supabase.from('page_assets').delete().eq('id', params.assetId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
