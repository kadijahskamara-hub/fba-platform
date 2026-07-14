import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial, requireAnyCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'
import { vString, ValidationError } from '@/lib/commercial/validation'
import { extractVariables } from '@/lib/commercial/communications'

export const runtime = 'nodejs'

const KEY_RE = /^[a-z0-9_]{2,64}$/

// GET /api/admin/communication-templates/:key — active version + history.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  const cs = await requireAnyCommercial(['communication_prepare', 'template_manage'])
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!KEY_RE.test(key)) return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  const { data: active } = await supabaseAdmin.from('communication_templates')
    .select('*').eq('template_key', key).eq('is_active', true).single()
  if (!active) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  const { data: history } = await supabaseAdmin.from('communication_templates')
    .select('id, version, updated_at, updated_by, is_active').eq('template_key', key).order('version', { ascending: false })
  return NextResponse.json({ template: active, history: history ?? [] })
}

// PUT /api/admin/communication-templates/:key — edit = deactivate the
// current version and insert a new active version (history preserved).
// Ultra-by-default (template_manage). Templates are plain text.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  const cs = await requireCommercial('template_manage')
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!KEY_RE.test(key)) return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  try {
    const body = await req.json().catch(() => ({}))
    const subject = vString(body.subject_template, 'subject_template', { required: true, max: 500 })!
    const bodyTpl = vString(body.body_template, 'body_template', { required: true, max: 20000 })!
    const label = vString(body.label, 'label', { max: 200 })

    const { data: current } = await supabaseAdmin.from('communication_templates')
      .select('*').eq('template_key', key).eq('is_active', true).single()
    if (!current) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

    const variables = [...new Set([...extractVariables(subject), ...extractVariables(bodyTpl)])]

    // Deactivate current, then insert the new active version. The partial
    // unique index (one active per key) is satisfied by ordering these.
    await supabaseAdmin.from('communication_templates').update({ is_active: false }).eq('id', current.id)
    const { data: created, error } = await supabaseAdmin.from('communication_templates').insert({
      template_key: key,
      label: label ?? current.label,
      audience: current.audience,
      subject_template: subject,
      body_template: bodyTpl,
      variables,
      version: Number(current.version ?? 1) + 1,
      is_active: true,
      updated_by: cs.user.id,
    }).select().single()
    if (error || !created) {
      // roll back the deactivation on failure
      await supabaseAdmin.from('communication_templates').update({ is_active: true }).eq('id', current.id)
      return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 })
    }
    return NextResponse.json({ template: created })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
