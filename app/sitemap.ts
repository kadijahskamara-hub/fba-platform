import type { MetadataRoute } from 'next'
import { supabaseAdmin } from '@/lib/supabase'
import {
  applyCategoryVisibilityFilter,
  getNonPublicCategoryIds,
} from '@/lib/categoryVisibility'

const BASE = 'https://fullbloom.uk.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // ── Static pages ──────────────────────────────────────────
  const staticPages: MetadataRoute.Sitemap = [
    {
      url:             BASE,
      lastModified:    new Date(),
      changeFrequency: 'weekly',
      priority:        1.0,
    },
    {
      url:             `${BASE}/products`,
      lastModified:    new Date(),
      changeFrequency: 'daily',
      priority:        0.9,
    },
    {
      url:             `${BASE}/collection`,
      lastModified:    new Date(),
      changeFrequency: 'weekly',
      priority:        0.9,
    },
    {
      url:             `${BASE}/artisans`,
      lastModified:    new Date(),
      changeFrequency: 'weekly',
      priority:        0.8,
    },
    {
      url:             `${BASE}/journal`,
      lastModified:    new Date(),
      changeFrequency: 'weekly',
      priority:        0.8,
    },
    {
      url:             `${BASE}/home`,
      lastModified:    new Date(),
      changeFrequency: 'monthly',
      priority:        0.7,
    },
    {
      url:             `${BASE}/about`,
      lastModified:    new Date(),
      changeFrequency: 'monthly',
      priority:        0.7,
    },
    {
      url:             `${BASE}/contact`,
      lastModified:    new Date(),
      changeFrequency: 'monthly',
      priority:        0.6,
    },
    {
      url:             `${BASE}/trade/apply`,
      lastModified:    new Date(),
      changeFrequency: 'monthly',
      priority:        0.5,
    },
  ]

  // ── Dynamic: published products ───────────────────────────
  // Spec §5: products in a hidden or archived category are not publicly
  // reachable, so they must not be advertised in the sitemap either.
  const hiddenCategoryIds = await getNonPublicCategoryIds()
  const { data: products } = await applyCategoryVisibilityFilter(
    supabaseAdmin
      .from('products')
      .select('slug, updated_at')
      .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null),
    hiddenCategoryIds,
  )

  const productEntries: MetadataRoute.Sitemap = (products ?? []).map(p => ({
    url:             `${BASE}/products/${p.slug}`,
    lastModified:    new Date(p.updated_at),
    changeFrequency: 'weekly',
    priority:        0.8,
  }))

  // ── Dynamic: active artisans ──────────────────────────────
  const { data: artisans } = await supabaseAdmin
    .from('artisans')
    .select('slug, updated_at')
    .eq('is_active', true)

  const artisanEntries: MetadataRoute.Sitemap = (artisans ?? []).map(a => ({
    url:             `${BASE}/artisans/${a.slug}`,
    lastModified:    new Date(a.updated_at),
    changeFrequency: 'monthly',
    priority:        0.7,
  }))

  // ── Dynamic: published journal posts ─────────────────────
  const { data: posts } = await supabaseAdmin
    .from('journal_posts')
    .select('slug, updated_at')
    .eq('status', 'published')

  const postEntries: MetadataRoute.Sitemap = (posts ?? []).map(p => ({
    url:             `${BASE}/journal/${p.slug}`,
    lastModified:    new Date(p.updated_at),
    changeFrequency: 'monthly',
    priority:        0.6,
  }))

  return [...staticPages, ...productEntries, ...artisanEntries, ...postEntries]
}
