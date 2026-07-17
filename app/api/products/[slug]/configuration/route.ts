import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { getPublicProductConfiguration } from '@/lib/publicProduct'

// GET /api/products/[slug]/configuration — public product-page payload
// (Sprint 12). Shaping + confidentiality rules live in lib/publicProduct.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const params = await ctx.params
  const session = await getSession()

  const { data: product } = await supabaseAdmin
    .from('products')
    .select('id, visibility, archived_at, deleted_at')
    .eq('slug', params.slug)
    .single()
  if (!product || product.visibility !== 'published' || product.archived_at || product.deleted_at) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }

  const data = await getPublicProductConfiguration(product.id, session)
  return NextResponse.json({ success: true, data })
}
