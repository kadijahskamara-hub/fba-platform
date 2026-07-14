import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial, requireAnyCommercial } from '@/lib/commercial/permissions'
import { supabaseAdmin } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { vEnum, vString, ValidationError } from '@/lib/commercial/validation'

export const runtime = 'nodejs'
const ADAPTERS = ['xero', 'quickbooks', 'sage', 'generic'] as const

// GET — account-code mappings (accounting_view or Ultra).
export async function GET() {
  const cs = await requireAnyCommercial(['accounting_view', 'accounting_export', 'ultra_admin'])
  if (!cs) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data } = await supabaseAdmin.from('account_code_mappings').select('*').order('adapter')
  return NextResponse.json({ mappings: data ?? [] })
}

// PATCH — edit an adapter's account codes (Ultra-only via ultra_admin).
export async function PATCH(req: NextRequest) {
  const cs = await requireCommercial('ultra_admin')
  if (!cs) return NextResponse.json({ error: 'Only Ultra Admin can edit account-code mappings.' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    const adapter = vEnum(body.adapter, 'adapter', ADAPTERS, { required: true })!
    const patch: Record<string, unknown> = { updated_by: cs.user.id, updated_at: new Date().toISOString() }
    for (const f of ['sales_account', 'debtors_account', 'rounding_account', 'bank_account'] as const) {
      if (body[f] !== undefined) patch[f] = vString(body[f], f, { max: 100 })
    }
    if (body.vat_codes !== undefined) {
      if (typeof body.vat_codes !== 'object' || body.vat_codes === null) throw new ValidationError('vat_codes must be an object')
      patch.vat_codes = body.vat_codes
    }
    const { data: before } = await supabaseAdmin.from('account_code_mappings').select('*').eq('adapter', adapter).single()
    const { data, error } = await supabaseAdmin.from('account_code_mappings').update(patch).eq('adapter', adapter).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAudit({ actor: cs.user, action: 'commercial.mapping_updated', entityType: 'account_code_mapping', entityId: data.id, before, after: data })
    return NextResponse.json({ mapping: data })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
