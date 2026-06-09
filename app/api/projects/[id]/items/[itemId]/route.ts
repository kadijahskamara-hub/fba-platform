import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// DELETE /api/projects/:id/items/:itemId
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 })

  // Verify project belongs to user
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', session.id)
    .single()

  if (!project) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  const { error } = await supabaseAdmin
    .from('project_items')
    .delete()
    .eq('id', params.itemId)
    .eq('project_id', params.id)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// PATCH /api/projects/:id/items/:itemId — update quantity or notes
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 })

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', session.id)
    .single()

  if (!project) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.quantity !== undefined) updates.quantity = body.quantity
  if (body.notes     !== undefined) updates.notes    = body.notes

  const { data, error } = await supabaseAdmin
    .from('project_items')
    .update(updates)
    .eq('id', params.itemId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
