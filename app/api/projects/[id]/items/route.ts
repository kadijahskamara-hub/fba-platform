import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// POST /api/projects/:id/items — add product to project
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const { productId, quantity = 1, notes } = await req.json()
  if (!productId) return NextResponse.json({ success: false, error: 'productId required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('project_items')
    .upsert({
      project_id: params.id,
      product_id: productId,
      quantity,
      notes: notes || null,
    }, { onConflict: 'project_id,product_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

// GET /api/projects/:id/items — list items in project
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
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
