import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  try {
    const form   = await req.formData()
    const file   = form.get('file') as File | null
    const bucket = (form.get('bucket') as string | null) ?? 'site-assets'
    const path   = (form.get('path')   as string | null)

    if (!file || !path) {
      return NextResponse.json({ success: false, error: 'file and path are required' }, { status: 400 })
    }

    const bytes  = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType:  file.type,
        upsert:       true,
      })

    if (uploadError) {
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage
      .from(bucket)
      .getPublicUrl(path)

    return NextResponse.json({ success: true, url: urlData.publicUrl })
  } catch (err) {
    console.error('upload-asset error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
