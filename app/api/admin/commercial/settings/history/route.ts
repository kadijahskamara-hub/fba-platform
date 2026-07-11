import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'

// GET /api/admin/commercial/settings/history — immutable change log.
// Values are stored masked for sensitive fields at write time, so this
// list never exposes full bank details.
export async function GET() {
  const cs = await requireCommercial('commercial_settings_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('commercial_setting_changes')
    .select('id, setting_group, changed_fields, before_value, after_value, reason, actor_email_snapshot, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ success: false, error: 'Could not load change history.' }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}
