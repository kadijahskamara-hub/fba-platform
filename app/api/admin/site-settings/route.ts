import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// GET /api/admin/site-settings?key=the_edit_hero_image
// Returns { key, value } or all settings if no key param
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'admin' && session?.role !== 'staff') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const key = req.nextUrl.searchParams.get('key')

  let query = supabaseAdmin.from('site_settings').select('key, value, updated_at')
  if (key) query = query.eq('key', key) as typeof query

  const { data, error } = await query

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  // If querying a specific key, return unwrapped
  if (key) {
    return NextResponse.json({ success: true, data: data?.[0] ?? null })
  }

  return NextResponse.json({ success: true, data: data ?? [] })
}

// PUT /api/admin/site-settings
// Body: { key: string, value: Record<string, unknown> }
export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { key, value } = body as { key: string; value: Record<string, unknown> }

    if (!key || value === undefined) {
      return NextResponse.json({ success: false, error: 'key and value are required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('site_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .select()
      .single()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('site-settings PUT error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
