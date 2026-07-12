import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, isStaffRole } from '@/lib/auth'

// POST /api/admin/contacts/:id/notes — add an activity/note entry
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !isStaffRole(session)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  if (!body.body?.trim()) return NextResponse.json({ success: false, error: 'Note text is required.' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('contact_notes')
    .insert({ contact_id: params.id, author_id: session.id, body: body.body.trim() })
    .select('id, body, created_at, author:users(first_name, last_name)')
    .single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
