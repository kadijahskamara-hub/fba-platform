import { NextResponse } from 'next/server'
import { requireAnyCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

// GET /api/admin/communication-templates — active templates (for prepare
// and for the settings editor). Readable by anyone who can prepare comms
// or manage templates.
export async function GET() {
  const cs = await requireAnyCommercial(['communication_prepare', 'communication_mark_sent', 'template_manage'])
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data } = await supabaseAdmin.from('communication_templates')
    .select('id, template_key, label, audience, subject_template, body_template, variables, version, updated_at')
    .eq('is_active', true).order('audience').order('label')
  return NextResponse.json({ templates: data ?? [] })
}
