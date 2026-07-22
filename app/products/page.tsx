import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getSession } from '@/lib/auth'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { ProductsClient } from './ProductsClient'
import type { HeroImageSetting } from '@/lib/types'

export const metadata: Metadata = {
  title: 'The Edit — Curated FF&E Catalogue',
  alternates: { canonical: '/products' },
  description: 'Browse our curated collection of luxury furniture, lighting, textiles and artisan accessories. Trade pricing available to approved accounts.',
}

async function getHeroImage(): Promise<HeroImageSetting> {
  const { data } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('key', 'the_edit_hero_image')
    .single()
  const val = data?.value as { url?: string; alt?: string } | null
  return { url: val?.url ?? '', alt: val?.alt ?? 'Curated craft and design pieces' }
}

export default async function ProductsPage(props: {
  searchParams: Promise<{
    category?:       string
    subcategory?:    string
    q?:              string
    page?:           string
    artisan?:        string
    material?:       string
    min_price?:      string
    max_price?:      string
    audience?:       string
    sort?:           string
    fire_retardant?: string
    stain_proofed?:  string
    rub_count_40k?:  string
    max_lead_time?:  string
    finish_type?:    string
    region?:         string
  }>
}) {
  const searchParams = await props.searchParams
  const [session, categoriesResult, heroImage] = await Promise.all([
    getSession(),
    // Final amendments §5: only visible, non-archived categories appear
    // in the public catalogue navigation and filters.
    supabase.from('categories').select('*, subcategories(*)')
      .eq('is_visible', true).is('archived_at', null).order('sort_order'),
    getHeroImage(),
  ])

  const categories = categoriesResult.data ?? []

  return (
    <div className="page-body" style={{ paddingTop: 0 }}>
      <Suspense fallback={<div style={{ padding: 80, textAlign: 'center', color: 'var(--stone)' }}>Loading…</div>}>
        <ProductsClient
          session={session}
          categories={categories}
          heroImage={heroImage}
          initialFilters={{
            category:      searchParams.category,
            subcategory:   searchParams.subcategory,
            q:             searchParams.q,
            page:          searchParams.page ? parseInt(searchParams.page) : 1,
            artisan:       searchParams.artisan,
            material:      searchParams.material,
            minPrice:      searchParams.min_price,
            maxPrice:      searchParams.max_price,
            audience:      searchParams.audience,
            sort:          searchParams.sort,
            fireRetardant: searchParams.fire_retardant,
            stainProofed:  searchParams.stain_proofed,
            rubCount40k:   searchParams.rub_count_40k,
            maxLeadTime:   searchParams.max_lead_time,
            finishType:    searchParams.finish_type,
            region:        searchParams.region,
          }}
        />
      </Suspense>
    </div>
  )
}
