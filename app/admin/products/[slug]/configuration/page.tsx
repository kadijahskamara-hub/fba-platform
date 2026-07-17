import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import ProductConfigurationPanel from '@/components/admin/ProductConfigurationPanel'

export async function generateMetadata(ctx: { params: Promise<{ slug: string }> }) {
  const params = await ctx.params
  const { data } = await supabaseAdmin.from('products').select('name').eq('slug', params.slug).single()
  return { title: data ? `Configuration — ${data.name}` : 'Product Configuration' }
}

// Sprint 11: finish groups & options, media, technical passport and
// specification rows for one product — everything the premium product
// page (Sprint 12) renders.
export default async function ProductConfigurationPage(ctx: { params: Promise<{ slug: string }> }) {
  const params = await ctx.params
  const { data: product } = await supabaseAdmin
    .from('products').select('id, name, slug, sku').eq('slug', params.slug).single()
  if (!product) notFound()

  return (
    <>
      <div className="admin-header">
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href={`/admin/products/${product.slug}`} className="btn btn-ghost btn-sm">← Product</Link>
            <h1 className="admin-title" style={{ margin: 0 }}>{product.name}</h1>
          </div>
          <p className="admin-subtitle">Curated finishes, media, technical passport & specifications{product.sku ? ` · ${product.sku}` : ''}</p>
        </div>
        <Link href="/admin/finishes" className="btn btn-secondary btn-sm">Finish library →</Link>
      </div>
      <ProductConfigurationPanel productId={product.id} />
    </>
  )
}
