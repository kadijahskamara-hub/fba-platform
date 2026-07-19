import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { getCommercialSettings } from '@/lib/commercial/settings'
import { nextQuoteNumber } from '@/lib/commercial/numbering'
import { recalculateAndPersist } from '@/lib/commercial/recalc'
import { logAudit } from '@/lib/audit'
import { ValidationError, vString, vUuidOrNull } from '@/lib/commercial/validation'

// GET /api/admin/proformas — list (optional ?stage= filter)
export async function GET(req: NextRequest) {
  const cs = await requireCommercial('quote_pipeline_view')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const stage = req.nextUrl.searchParams.get('stage')

  let query = supabaseAdmin
    .from('proformas')
    .select('*, items:proforma_line_items(id, name, quantity, unit_price, selling_price_unit, line_type, manufacturer_id, manufacturer_name, is_bespoke), contact:users!proformas_contact_user_id_fkey(id, first_name, last_name, email)')
    .order('created_at', { ascending: false })

  if (stage && stage !== 'all') query = query.eq('stage', stage) as typeof query

  const { data, error } = await query
  if (error) return NextResponse.json({ success: false, error: 'Could not load pipeline.' }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}

// POST /api/admin/proformas — create a commercial document (quote),
// optionally seeded from a quote request. Defaults come from the
// protected commercial settings, not hard-coded values.
export async function POST(req: NextRequest) {
  const cs = await requireCommercial('quote_create')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const settings = await getCommercialSettings()

  let header: Record<string, unknown>
  try {
    const expiry = new Date(Date.now() + settings.default_quote_expiry_days * 86400000)
    header = {
      quote_request_id: vUuidOrNull(body.quoteRequestId, 'quoteRequestId'),
      contact_user_id: vUuidOrNull(body.contactUserId, 'contactUserId'),
      client_name: vString(body.clientName, 'clientName', { max: 300 }),
      client_email: vString(body.clientEmail, 'clientEmail', { max: 300 }),
      client_company: vString(body.clientCompany, 'clientCompany', { max: 300 }),
      project_name: vString(body.projectName, 'projectName', { max: 300 }),
      project_location: vString(body.projectLocation, 'projectLocation', { max: 300 }),
      currency: vString(body.currency, 'currency', { max: 3 }) ?? settings.default_currency,
      stage: 'draft',
      document_status: 'draft',
      quote_number: await nextQuoteNumber(),
      revision_number: 1,
      pricing_method: settings.pricing_method_default,
      default_tax_category: settings.default_tax_category,
      vat_rate: settings.default_vat_rate,
      deposit_percent: settings.default_deposit_percent,
      valid_until: expiry.toISOString().slice(0, 10),
      payment_terms: settings.default_payment_terms,
      lead_time: settings.default_lead_time,
      procurement_fee_type: settings.procurement_fee_type,
      procurement_fee_basis: settings.procurement_fee_basis,
      procurement_fee_value: settings.procurement_fee_value,
      notes: vString(body.notes, 'notes', { max: 5000 }),
      admin_notes: vString(body.adminNotes, 'adminNotes', { max: 5000 }),
      created_by: cs.user.id,
    }
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    throw e
  }

  const { data: proforma, error } = await supabaseAdmin
    .from('proformas').insert(header).select().single()
  if (error) return NextResponse.json({ success: false, error: 'Create failed.' }, { status: 500 })

  // Seed line items from the quote request. The catalogue trade price
  // seeds the client SELLING price (that is how the studio quotes
  // today); the supplier COST seeds from the catalogue supplier_cost
  // when set (QA item 3), otherwise it is recorded as 'unavailable'.
  if (header.quote_request_id) {
    const { data: qItems } = await supabaseAdmin
      .from('quote_request_items')
      .select('product_id, product_name, quantity, selected_finish, selected_fabric, selected_size, notes, project_item_id, product:products(name, trade_price, supplier_cost, artisan_id, sku)')
      .eq('quote_request_id', header.quote_request_id)

    if (qItems && qItems.length > 0) {
      const rows = qItems.map((it: Record<string, unknown>, i: number) => {
        const prod = it.product as Record<string, unknown> | null
        return {
          proforma_id: proforma.id,
          line_type: 'product',
          product_id: it.product_id ?? null,
          is_bespoke: false,
          name: (prod?.name as string) ?? (it.product_name as string) ?? 'Item',
          manufacturer_id: (prod?.artisan_id as string) ?? null,
          fba_sku: (prod?.sku as string) ?? null,
          quantity: (it.quantity as number) ?? 1,
          pricing_method: 'manual',
          selling_price_unit: (prod?.trade_price as number) ?? null,
          unit_price: (prod?.trade_price as number) ?? null,
          supplier_cost_unit: (prod?.supplier_cost as number | null) ?? null,
          supplier_cost_source: prod?.supplier_cost != null ? 'catalogue_supplier' : 'unavailable',
          tax_category: settings.default_tax_category,
          currency: header.currency,
          selected_finish: it.selected_finish ?? null,
          selected_fabric: it.selected_fabric ?? null,
          selected_size: it.selected_size ?? null,
          // Sprint 17: seed the line's Full specification from the carried
          // selections so the admin editor is not blank while the PDF shows
          // the same detail. Staff can overwrite it; it is only a starting point.
          spec_details: [it.selected_finish, it.selected_fabric, it.selected_size]
            .filter(Boolean).join('\n').slice(0, 700) || null,
          notes: it.notes ?? null,
          sort_order: i,
        }
      })
      const { data: insertedLines } = await supabaseAdmin
        .from('proforma_line_items').insert(rows).select('id, sort_order')

      // Sprint 14: copy each project item's STRUCTURED finish selections
      // onto its quote line (label/code/adjustment snapshots — md §14.12).
      if (insertedLines && insertedLines.length > 0) {
        const bySort = new Map(insertedLines.map(l => [l.sort_order as number, l.id as string]))
        const selRows: Array<Record<string, unknown>> = []
        for (let i = 0; i < qItems.length; i++) {
          const projectItemId = qItems[i].project_item_id as string | null
          const lineId = bySort.get(i)
          if (!projectItemId || !lineId) continue
          const { data: sels } = await supabaseAdmin
            .from('project_item_finish_selections')
            .select('finish_group_id, finish_option_id, finish_id, group_key, group_label, finish_label, finish_code, price_adjustment, lead_time_adjustment_weeks')
            .eq('project_item_id', projectItemId)
          for (const sel of sels ?? []) {
            selRows.push({ ...sel, proforma_line_item_id: lineId })
          }
        }
        if (selRows.length > 0) {
          const { error: selErr } = await supabaseAdmin.from('quote_item_finish_selections').insert(selRows)
          if (selErr) console.error('quote_item_finish_selections insert failed:', selErr.message)
        }
      }
    }
  }

  // Move the source request out of the "incoming" inbox: it now has a
  // live proforma, so it shows as quoted rather than new/reviewing.
  if (header.quote_request_id) {
    await supabaseAdmin
      .from('quote_requests')
      .update({ status: 'quoted' })
      .eq('id', header.quote_request_id)
      .in('status', ['new', 'reviewing'])
  }

  await recalculateAndPersist(proforma.id)

  await logAudit({
    actor: cs.user, action: 'commercial.quote_created', entityType: 'proforma', entityId: proforma.id,
    after: { quoteNumber: header.quote_number, proformaNumber: proforma.proforma_number, fromQuoteRequest: header.quote_request_id ?? null },
  })

  return NextResponse.json({ success: true, data: proforma })
}
