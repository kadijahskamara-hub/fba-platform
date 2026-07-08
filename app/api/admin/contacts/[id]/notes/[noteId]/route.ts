import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'

// DELETE /api/admin/contacts/:id/notes/:noteId
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; noteId: string } }) {
  if (!(await isStaff())) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  const { error } = await supabaseAdmin
    .from('contact_notes').delete().eq('id', params.noteId).eq('contact_id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
