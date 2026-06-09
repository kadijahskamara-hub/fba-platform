// ── Client-safe types & constants for the sync engine ────────────
// This file has NO server-side imports — safe to use in 'use client' components.
// Server-only logic (supabaseAdmin calls) lives in lib/syncEngine.ts

export type FieldMappings = Record<string, string>

export type SourceType = 'rest_api' | 'shopify' | 'woocommerce' | 'csv_url' | 'manual_csv'

export interface BrandIntegration {
  id: string
  brand_name: string
  source_type: SourceType
  api_endpoint: string | null
  api_key: string | null
  api_secret: string | null
  field_mappings: FieldMappings
  sync_enabled: boolean
  sync_frequency: string
  last_synced_at: string | null
  last_sync_status: string | null
  last_sync_message: string | null
  products_imported: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SyncResult {
  imported: number
  skipped: number
  errors: string[]
}

export const DEFAULT_MAPPINGS: Record<SourceType, FieldMappings> = {
  shopify: {
    name:            'title',
    description:     'body_html',
    retail_price:    'variants.0.price',
    sku:             'variants.0.sku',
    images:          'images.*.src',
    shipping_origin: 'vendor',
  },
  woocommerce: {
    name:              'name',
    description:       'description',
    short_description: 'short_description',
    retail_price:      'price',
    sku:               'sku',
    images:            'images.*.src',
    shipping_origin:   'meta_data.origin',
  },
  rest_api: {
    name:            'name',
    description:     'description',
    retail_price:    'price',
    sku:             'sku',
    images:          'images',
    lead_time:       'lead_time',
    shipping_origin: 'origin',
  },
  csv_url: {
    name:            'name',
    description:     'description',
    retail_price:    'price',
    sku:             'sku',
    images:          'image_url',
    lead_time:       'lead_time',
    shipping_origin: 'origin',
  },
  manual_csv: {
    name:            'name',
    description:     'description',
    retail_price:    'price',
    sku:             'sku',
    images:          'image_url',
    lead_time:       'lead_time',
    shipping_origin: 'origin',
  },
}
