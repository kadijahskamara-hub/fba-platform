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
  } = body

  if (!productIds.length && !projectId) {
    return NextResponse.json({ success: false, error: 'At least one product or a project is required.' }, { status: 400 })
  }

  // If a projectId is given, collect its items
  let resolvedProductIds: string[] = productIds

  if (projectId && !productIds.length) {
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
      .select('product_id')
      .eq('project_id', projectId)

    resolvedProductIds = (items ?? []).map(i => i.product_id)
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

  // Link products to the quote
  if (resolvedProductIds.length) {
    const items = resolvedProductIds.map((pid: string) => ({
      quote_request_id: quote.id,
      product_id:       pid,
      quantity:         1,
    }))
    await supabaseAdmin.from('quote_request_items').insert(items)
  }

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
