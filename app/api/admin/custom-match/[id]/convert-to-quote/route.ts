import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireCommercial } from '@/lib/commercial/permissions'
import { getCommercialSettings } from '@/lib/commercial/settings'
import { nextQuoteNumber } from '@/lib/commercial/numbering'
import { recalculateAndPersist } from '@/lib/commercial/recalc'
import { logAudit } from '@/lib/audit'
import { vUuid, ValidationError } from '@/lib/commercial/validation'
import { canTransition, type CustomMatchStatus, CUSTOM_MATCH_STATUS_LABELS, GLOSS_LEVELS } from '@/lib/customMatch/logic'

// POST /api/admin/custom-match/[id]/convert-to-quote (Sprint 14)
//
// Turns an approved Custom Match request into a real quote line:
// - attaches to the request's existing proforma when present & unlocked,
//   otherwise creates a new pipeline quote for the requester;
// - the line carries the FULL structured CM specification (spec_details +
//   selected_finish summary) so it flows into client documents, supplier
//   POs and order-sheet snapshots without re-keying;
// - internal cost/lead-time adjustments are applied server-side;
// - the request is linked and moved to converted_to_quote (transition map
//   enforced — same rule the status buttons follow).

function glossLabel(g: string | null): string | null {
  if (!g || !(GLOSS_LEVELS as readonly string[]).includes(g)) return null
  return g.replace(/_/g, ' ')
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('quote_create')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  try {
    vUuid(params.id, 'id')

    const { data: cm } = await supabaseAdmin
      .from('custom_match_requests')
      .select('*, product:products(id, name, sku, trade_price, supplier_cost, artisan_id), material_type:material_types(name)')
      .eq('id', params.id).single()
    if (!cm) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 })

    const from = cm.status as CustomMatchStatus
    if (!canTransition(from, 'converted_to_quote')) {
      return NextResponse.json({
        success: false,
        error: `A request in "${CUSTOM_MATCH_STATUS_LABELS[from] ?? from}" cannot be converted yet — approve it first.`,
      }, { status: 409 })
    }
    const product = cm.product as Record<string, unknown> | null
    if (!product) return NextResponse.json({ success: false, error: 'The linked product no longer exists.' }, { status: 409 })

    // ── Target proforma: existing (unlocked) or a new pipeline quote ──
    let proformaId = cm.proforma_id as string | null
    let created = false
    if (proformaId) {
      const { data: pf } = await supabaseAdmin
        .from('proformas').select('id, locked_at').eq('id', proformaId).single()
      if (!pf) proformaId = null
      else if (pf.locked_at) {
        return NextResponse.json({ success: false, error: 'The linked quote is issued and locked — create a revision first, then convert again.' }, { status: 409 })
      }
    }
    if (!proformaId) {
      const settings = await getCommercialSettings()
      const expiry = new Date(Date.now() + settings.default_quote_expiry_days * 86400000)
      const { data: pf, error: pfErr } = await supabaseAdmin.from('proformas').insert({
        quote_request_id: cm.quote_request_id ?? null,
        contact_user_id: cm.requester_user_id ?? null,
        client_name: cm.requester_name,
        client_email: cm.requester_email,
        client_company: cm.requester_studio ?? null,
        project_name: cm.project_id ? null : `Custom Match ${cm.reference_number}`,
        currency: settings.default_currency,
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
        created_by: cs.user.id,
      }).select('id, quote_number').single()
      if (pfErr || !pf) return NextResponse.json({ success: false, error: 'Could not create the quote.' }, { status: 500 })
      proformaId = pf.id
      created = true
    }
    // proformaId is definitely set on every path above; give TS the proof.
    const targetProformaId: string = proformaId!

    // ── Compose the structured CM specification (order-sheet ready) ──
    const selections = (cm.selected_finishes_snapshot ?? []) as Array<{ groupLabel?: string; finishLabel?: string; finishCode?: string | null }>
    const selectionSummary = selections
      .map(sel => `${sel.groupLabel}: ${sel.finishLabel}`).join('; ')

    const reqBits = [
      cm.grain_pattern_match && 'grain/pattern direction match',
      cm.stain_tone_match && 'stain/tone match',
      cm.exact_batch_match && 'exact batch match',
      cm.sheen_gloss_match && 'sheen/gloss match',
      cm.physical_sample_available && 'client sample available',
    ].filter(Boolean).join(', ')
    const dims = (cm.dimensions_application ?? {}) as Record<string, string>
    const specLines = [
      `CUSTOM MATCH ${cm.reference_number}`,
      (cm.material_type as { name?: string } | null)?.name && `Material: ${(cm.material_type as { name?: string }).name}`,
      cm.supplier_brand && `Supplier/brand: ${cm.supplier_brand}`,
      cm.material_code && `Material code: ${cm.material_code}`,
      cm.sample_batch_reference && `Sample/batch: ${cm.sample_batch_reference}`,
      cm.requested_colour && `Colour: ${cm.requested_colour}`,
      glossLabel(cm.gloss_level as string | null) && `Gloss: ${glossLabel(cm.gloss_level as string | null)}`,
      reqBits && `Match requirements: ${reqBits}`,
      cm.fire_requirement && `Fire: ${cm.fire_requirement}`,
      cm.performance_requirement && `Performance: ${cm.performance_requirement}`,
      ...Object.entries(dims).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`),
      cm.additional_notes && `Notes: ${cm.additional_notes}`,
    ].filter(Boolean).join('\n')

    // ── Line: cost adjustments applied to the INTERNAL side only ──
    const baseCost = product.supplier_cost != null ? Number(product.supplier_cost) : null
    const costAdj = cm.cost_adjustment != null ? Number(cm.cost_adjustment) : 0
    const supplierCostUnit = baseCost != null ? baseCost + costAdj : (costAdj !== 0 ? costAdj : null)

    const { data: maxSort } = await supabaseAdmin
      .from('proforma_line_items').select('sort_order').eq('proforma_id', targetProformaId)
      .order('sort_order', { ascending: false }).limit(1)
    const nextSort = ((maxSort?.[0]?.sort_order as number) ?? -1) + 1

    const { data: line, error: lineErr } = await supabaseAdmin.from('proforma_line_items').insert({
      proforma_id: targetProformaId,
      line_type: 'product',
      product_id: product.id,
      is_bespoke: false,
      name: `${product.name} — Custom Match`,
      fba_sku: product.sku ?? null,
      manufacturer_id: product.artisan_id ?? null,
      quantity: Number(cm.quantity ?? 1),
      pricing_method: 'manual',
      selling_price_unit: product.trade_price != null ? Number(product.trade_price) : null,
      unit_price: product.trade_price != null ? Number(product.trade_price) : null,
      supplier_cost_unit: supplierCostUnit,
      supplier_cost_source: supplierCostUnit != null ? 'manual' : 'unavailable',
      supplier_cost_overridden: costAdj !== 0,
      supplier_cost_override_reason: costAdj !== 0 ? `Custom Match ${cm.reference_number} cost adjustment` : null,
      tax_category: 'standard',
      selected_finish: [selectionSummary, `Custom Match ${cm.reference_number}`].filter(Boolean).join(' · ').slice(0, 490),
      spec_details: specLines,
      notes: null,
      internal_notes: cm.internal_notes ?? null,
      sort_order: nextSort,
    }).select('id').single()
    if (lineErr || !line) return NextResponse.json({ success: false, error: 'Could not create the quote line.' }, { status: 500 })

    // Structured selection snapshots for the line
    if (selections.length > 0) {
      await supabaseAdmin.from('quote_item_finish_selections').insert(
        selections.filter(sel => sel.groupLabel && sel.finishLabel).map(sel => ({
          proforma_line_item_id: line.id,
          group_label: sel.groupLabel,
          finish_label: sel.finishLabel,
          finish_code: sel.finishCode ?? null,
        }))
      )
    }

    await recalculateAndPersist(targetProformaId)

    // Link + transition (map-enforced above)
    await supabaseAdmin.from('custom_match_requests').update({
      proforma_id: targetProformaId,
      proforma_line_item_id: line.id,
      status: 'converted_to_quote',
      updated_at: new Date().toISOString(),
    }).eq('id', cm.id)

    await logAudit({
      actor: cs.user, action: 'custom_match.converted_to_quote', entityType: 'custom_match_request',
      entityId: cm.id, after: { reference: cm.reference_number, proformaId: targetProformaId, lineId: line.id, createdQuote: created },
    })

    return NextResponse.json({ success: true, data: { proformaId: targetProformaId, lineId: line.id, createdQuote: created } })
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ success: false, error: e.message }, { status: 400 })
    console.error('convert-to-quote failed:', e)
    return NextResponse.json({ success: false, error: 'Conversion failed.' }, { status: 500 })
  }
}
