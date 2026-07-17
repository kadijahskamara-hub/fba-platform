import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import {
  validateConfiguration,
  type FinishGroupDef, type CompatibilityRule, type ProductConfiguration, type FinishSelection,
} from '@/lib/customMatch/logic'

// POST /api/projects/:id/items — add product to project
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 })

  // Verify project belongs to user
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', session.id)
    .single()

  if (!project) return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })

  const body = await req.json()
  const { productId, notes } = body as { productId?: string; notes?: string }
  const quantity = Math.min(999, Math.max(1, Number(body.quantity) || 1))
  const roomArea = typeof body.roomArea === 'string' ? body.roomArea.trim().slice(0, 200) || null : null
  if (!productId) return NextResponse.json({ success: false, error: 'productId required' }, { status: 400 })

  // Optional configured finish selections (Sprint 12). Each selection is
  // re-validated server-side against the product's groups and
  // compatibility rules — the client is never trusted (md doc §17.2).
  const rawSelections = Array.isArray(body.selections) ? (body.selections as Array<Record<string, unknown>>) : []
  let selections: FinishSelection[] = []
  let configurationComplete = true

  if (rawSelections.length > 0) {
    const [{ data: groups }, { data: rules }, { data: options }] = await Promise.all([
      supabaseAdmin.from('product_finish_groups')
        .select('id, key, label, required, is_active').eq('product_id', productId),
      supabaseAdmin.from('finish_compatibility_rules')
        .select('source_finish_option_id, target_finish_option_id, is_allowed, explanation, is_active')
        .eq('product_id', productId),
      supabaseAdmin.from('product_finish_options')
        .select('id, finish_group_id, finish_id, is_available, price_adjustment, lead_time_adjustment_weeks, finish:finishes(name, code), group:product_finish_groups(id, key, label, product_id)')
        .eq('is_available', true),
    ])

    const optionById = new Map((options ?? [])
      .filter(o => ((o.group as unknown as Record<string, unknown> | null)?.product_id) === productId)
      .map(o => [o.id as string, o]))

    // Rebuild selections from OUR data — only option IDs are trusted.
    for (const raw of rawSelections.slice(0, 20)) {
      const opt = optionById.get(String(raw.finishOptionId))
      if (!opt) return NextResponse.json({ success: false, error: 'A selected finish option is not available on this product.' }, { status: 400 })
      const grp = opt.group as unknown as Record<string, unknown>
      const fin = opt.finish as unknown as Record<string, unknown>
      selections.push({
        finishGroupId: String(grp.id),
        finishOptionId: String(opt.id),
        finishId: String(opt.finish_id),
        groupLabel: String(grp.label ?? ''),
        finishLabel: String(fin?.name ?? ''),
        priceAdjustment: Number(opt.price_adjustment ?? 0),
        leadTimeAdjustmentWeeks: Number(opt.lead_time_adjustment_weeks ?? 0),
      })
    }
    // One selection per group
    const seen = new Set<string>()
    selections = selections.filter(sel => (seen.has(sel.finishGroupId) ? false : (seen.add(sel.finishGroupId), true)))

    const groupDefs: FinishGroupDef[] = (groups ?? []).map(g => ({
      id: g.id as string, key: g.key as string, label: g.label as string,
      required: g.required as boolean, isActive: g.is_active as boolean,
    }))
    const ruleDefs: CompatibilityRule[] = (rules ?? []).map(r => ({
      sourceFinishOptionId: r.source_finish_option_id as string,
      targetFinishOptionId: r.target_finish_option_id as string,
      isAllowed: r.is_allowed as boolean,
      explanation: r.explanation as string | null,
      isActive: r.is_active as boolean,
    }))
    const config: ProductConfiguration = {
      productId, quantity,
      selections: Object.fromEntries(selections.map(sel => [sel.finishGroupId, sel])),
    }
    const check = validateConfiguration(groupDefs, config, ruleDefs)
    // Incomplete required groups may still be saved to a project (it is a
    // working board, not an order) — but incompatible pairs never are.
    const hardProblems = check.problems.filter(pr => !pr.includes('must be selected'))
    if (hardProblems.length > 0) {
      return NextResponse.json({ success: false, error: hardProblems.join(' ') }, { status: 400 })
    }
    configurationComplete = check.valid
  }

  // Product snapshot (name/price/lead time at save time — md doc §9)
  const { data: prod } = await supabaseAdmin
    .from('products')
    .select('name, sku, retail_price, trade_price, currency, lead_time, price_type')
    .eq('id', productId).single()
  if (!prod) return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 })
  const isTrade = session.role === 'trade_user' || session.role === 'admin' || session.role === 'staff'
  const visiblePrice = isTrade ? (prod.trade_price ?? null) : (prod.retail_price ?? null)

  // Unconfigured adds keep the old de-duplicate behaviour; configured
  // saves always create a NEW item (same product, different configuration
  // — md doc §9).
  if (selections.length === 0) {
    const { data: existing } = await supabaseAdmin
      .from('project_items')
      .select('id, quantity')
      .eq('project_id', params.id).eq('product_id', productId)
      .order('created_at').limit(1)
    if (existing && existing.length > 0) {
      const { data, error } = await supabaseAdmin.from('project_items')
        .update({ quantity, notes: notes || null })
        .eq('id', existing[0].id).select().single()
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, data })
    }
  }

  const { data: item, error } = await supabaseAdmin
    .from('project_items')
    .insert({
      project_id: params.id,
      product_id: productId,
      quantity,
      notes: notes || null,
      room_area: roomArea,
      configuration_complete: configurationComplete,
      price_snapshot: visiblePrice,
      currency_snapshot: (prod.currency as string | null) ?? 'GBP',
      lead_time_snapshot: (prod.lead_time as string | null) ?? null,
      product_snapshot: { name: prod.name, sku: prod.sku, priceType: prod.price_type },
    })
    .select()
    .single()
  if (error || !item) return NextResponse.json({ success: false, error: error?.message ?? 'Save failed' }, { status: 500 })

  if (selections.length > 0) {
    const { error: selErr } = await supabaseAdmin.from('project_item_finish_selections').insert(
      selections.map(sel => ({
        project_item_id: item.id,
        finish_group_id: sel.finishGroupId,
        finish_option_id: sel.finishOptionId,
        finish_id: sel.finishId,
        group_label: sel.groupLabel,
        finish_label: sel.finishLabel,
        price_adjustment: sel.priceAdjustment ?? 0,
        lead_time_adjustment_weeks: sel.leadTimeAdjustmentWeeks ?? 0,
      }))
    )
    if (selErr) console.error('project_item_finish_selections insert failed:', selErr.message)
  }

  return NextResponse.json({ success: true, data: item })
}

// GET /api/projects/:id/items — list items in project
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 })

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', session.id)
    .single()

  if (!project) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  const { data, error } = await supabaseAdmin
    .from('project_items')
    .select(`
      *, product:products(id, name, slug, images, retail_price, trade_price, price_type, currency, artisan:artisans(name))
    `)
    .eq('project_id', params.id)
    .order('created_at')

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}
