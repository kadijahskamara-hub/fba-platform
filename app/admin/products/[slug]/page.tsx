import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import AdminProductForm from '../AdminProductForm'
import ProductExtrasPanel from './ProductExtrasPanel'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const { data } = await supabaseAdmin.from('products').select('name').eq('slug', params.slug).single()
  return { title: data ? `Edit — ${data.name}` : 'Edit Product' }
}

export default async function EditProductPage({ params }: { params: { slug: string } }) {
  const [{ data: product }, { data: categories }, { data: artisans }] = await Promise.all([
    supabaseAdmin
      .from('products')
      .select('*, spec:product_specifications(*)')
      .eq('slug', params.slug)
      .single(),
    supabaseAdmin.from('categories').select('*, subcategories(*)').order('name'),
    supabaseAdmin.from('artisans').select('id, name').eq('is_active', true).order('name'),
  ])

  if (!product) notFound()

  return (
    <>
      <AdminProductForm
        mode="edit"
        product={product}
        categories={categories ?? []}
        artisans={artisans ?? []}
      />
      <ProductExtrasPanel
        productId={product.id}
        slug={product.slug}
        initialFulfilment={{
          technicalDescription: product.technical_description ?? '',
          customisationNote:    product.customisation_note ?? '',
          madeToOrder:          product.made_to_order ?? false,
          dispatchTimeLabel:    product.dispatch_time_label ?? '',
          leadTime:             product.lead_time ?? '',
          shippingNotes:        product.shipping_notes ?? '',
          publicBrandVisible:   product.public_brand_visible ?? false,
        }}
      />
    </>
  )
}
