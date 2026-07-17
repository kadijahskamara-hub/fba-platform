import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

/**
 * POST /api/quote-requests
 * Submit a quote request, optionally linked to a project folder.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: 'You must be logged in to request a quote.' }, { status: 401 })
  }

  const body = await req.json()
  const {
    projectId,
    projectName,
    projectLocation,
    budget,
    requiredBy,
    notes,
    productIds = [],
    items = [],
  } = body

  // Rich item format: [{ productId, quantity, selectedFinish, selectedFabric, selectedSize }]
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const clean = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null

  const richItems: Array<{ productId: string; quantity: number; selectedFinish: string | null; selectedFabric: string | null; selectedSize: string | null }> =
    (Array.isArray(items) ? items : [])
      .filter((i: Record<string, unknown>) => typeof i?.productId === 'string' && UUID_RE.test(i.productId as string))
      .slice(0, 100)
      .map((i: Record<string, unknown>) => ({
        productId: i.productId as string,
        quantity: Math.min(999, Math.max(1, Number(i.quantity) || 1)),
        selectedFinish: clean(i.selectedFinish),
        selectedFabric: clean(i.selectedFabric),
        selectedSize: clean(i.selectedSize),
      }))

  if (!richItems.length && !productIds.length && !projectId) {
    return NextResponse.json({ success: false, error: 'At least one product or a project is required.' }, { status: 400 })
  }

  // If a projectId is given, collect its items (carrying quantity through)
  let resolvedProductIds: string[] = productIds
  let projectLineItems: Array<{ projectItemId: string; productId: string; quantity: number; selectionSummary: string | null }> = []

  if (projectId && !productIds.length && !richItems.length) {
    // Verify ownership FIRST before fetching any project data
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.id)
      .single()

    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found.' }, { status: 404 })
    }

    const { data: items } = await supabaseAdmin
      .from('project_items')
      .select('id, product_id, quantity, selections:project_item_finish_selections(group_label, finish_label)')
      .eq('project_id', projectId)

    projectLineItems = (items ?? []).map(i => ({
      projectItemId: i.id as string,
      productId: i.product_id as string,
      quantity:  Math.min(999, Math.max(1, Number(i.quantity) || 1)),
      // Sprint 14: the saved configuration travels with the request
      selectionSummary: ((i.selections ?? []) as Array<{ group_label: string; finish_label: string }>)
        .map(sel => `${sel.group_label}: ${sel.finish_label}`).join('; ').slice(0, 190) || null,
    }))
    resolvedProductIds = projectLineItems.map(i => i.productId)
  }

  // Create quote request
  const { data: quote, error: quoteError } = await supabaseAdmin
    .from('quote_requests')
    .insert({
      user_id:          session.id,
      project_id:       projectId ?? null,
      project_name:     projectName?.trim() || null,
      project_location: projectLocation?.trim() || null,
      budget:           budget ?? null,
      required_by:      requiredBy ?? null,
      notes:            notes?.trim() || null,
      status:           'new',
    })
    .select()
    .single()

  if (quoteError) {
    return NextResponse.json({ success: false, error: quoteError.message }, { status: 500 })
  }

  // Link products to the quote — rich items carry selections through.
  // quote_request_items.product_name is NOT NULL, so resolve names first
  // (QA item 4: missing names made every item insert fail silently, and
  // converted proformas started with no lines).
  const allProductIds = Array.from(new Set([
    ...richItems.map(i => i.productId),
    ...projectLineItems.map(i => i.productId),
    ...resolvedProductIds,
  ]))
  const productNames = new Map<string, string>()
  if (allProductIds.length) {
    const { data: prods } = await supabaseAdmin
      .from('products').select('id, name').in('id', allProductIds)
    for (const pr of prods ?? []) productNames.set(pr.id as string, (pr.name as string) ?? 'Item')
  }
  const nameFor = (pid: string) => productNames.get(pid) ?? 'Item'

  let itemsError: string | null = null
  if (richItems.length) {
    const { error } = await supabaseAdmin.from('quote_request_items').insert(
      richItems.map(i => ({
        quote_request_id: quote.id,
        product_id:       i.productId,
        product_name:     nameFor(i.productId),
        quantity:         i.quantity,
        selected_finish:  i.selectedFinish,
        selected_fabric:  i.selectedFabric,
        selected_size:    i.selectedSize,
      }))
    )
    itemsError = error?.message ?? null
  } else if (projectLineItems.length) {
    const { error } = await supabaseAdmin.from('quote_request_items').insert(
      projectLineItems.map(i => ({
        quote_request_id: quote.id,
        product_id:       i.productId,
        product_name:     nameFor(i.productId),
        quantity:         i.quantity,
        project_item_id:  i.projectItemId,
        selected_finish:  i.selectionSummary,
      }))
    )
    itemsError = error?.message ?? null
  } else if (resolvedProductIds.length) {
    const { error } = await supabaseAdmin.from('quote_request_items').insert(
      resolvedProductIds.map((pid: string) => ({
        quote_request_id: quote.id,
        product_id:       pid,
        product_name:     nameFor(pid),
        quantity:         1,
      }))
    )
    itemsError = error?.message ?? null
  }
  if (itemsError) console.error('quote_request_items insert failed:', itemsError)

  // Also record in contacts
  await supabaseAdmin.from('contacts').upsert({
    user_id:      session.id,
    email:        session.email,
    first_name:   session.firstName,
    last_name:    session.lastName,
    contact_type: 'trade_prospect',
    source:       'quote_request',
    message:      notes ?? null,
  }, { onConflict: 'email' })

  return NextResponse.json({ success: true, data: quote })
}

/**
 * GET /api/quote-requests — user's own quotes
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('quote_requests')
    .select(`
      *,
      items:quote_request_items(
        id, quantity,
        product:products(id, name, slug, images, price_type, retail_price, trade_price)
      )
    `)
    .eq('user_id', session.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}
