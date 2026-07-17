import 'server-only'
import { supabaseAdmin } from './supabase'
import type { SessionUser } from './types'
import { isStaffRole } from './auth'

// Public product-page configuration payload (Sprint 12). One shaping
// function shared by the server-rendered page and the public API route.
//
// Confidentiality (md doc §17): finish supplier fields never leave the
// server; price adjustments only for trade/staff; passport claims only
// when active+public+verified+unexpired; internal spec rows excluded.

export interface PublicConfigurationPayload {
  materialTypes: Array<{ id: string; name: string; slug: string }>
  groups: Array<Record<string, unknown>>
  rules: Array<{ sourceFinishOptionId: string; targetFinishOptionId: string; isAllowed: boolean; explanation: string | null; isActive: boolean }>
  media: Array<{ id: string; url: string; finishOptionId: string | null; role: string; altText: string | null; isPrimary: boolean }>
  passport: Array<{ label: string; value: string | null }>
  specRows: Array<{ id: string; label: string; value: string; unit: string | null }>
}

function mediaUrl(bucket: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  return `${base}/storage/v1/object/public/${bucket}/${path}`
}

export async function getPublicProductConfiguration(
  productId: string,
  session: SessionUser | null,
): Promise<PublicConfigurationPayload> {
  const isTradeOrStaff = !!session && (session.role === 'trade_user' || isStaffRole(session))
  const nowIso = new Date().toISOString()

  const [typesRes, groupsRes, rulesRes, mediaRes, passportRes, specRes] = await Promise.all([
    supabaseAdmin.from('material_types')
      .select('id, name, slug').eq('is_active', true).order('sort_order'),
    supabaseAdmin.from('product_finish_groups')
      .select(`id, label, key, required, help_text, sort_order,
        material_type:material_types(id, name, slug),
        options:product_finish_options(id, is_available, is_default, price_adjustment,
          lead_time_adjustment_weeks, description_override, sample_available, sort_order,
          finish:finishes(id, name, code, hex_colour, texture_storage_path, origin, description, technical_notes, sample_available, is_active))`)
      .eq('product_id', productId).eq('is_active', true).order('sort_order'),
    supabaseAdmin.from('finish_compatibility_rules')
      .select('id, source_finish_option_id, target_finish_option_id, is_allowed, explanation')
      .eq('product_id', productId).eq('is_active', true),
    supabaseAdmin.from('product_media')
      .select('id, finish_option_id, storage_bucket, storage_path, media_role, alt_text, sort_order, is_primary')
      .eq('product_id', productId).eq('is_active', true).order('sort_order'),
    supabaseAdmin.from('product_passport_attributes')
      .select('label, value_text, sort_order, expires_at')
      .eq('product_id', productId).eq('is_active', true).eq('is_public', true).eq('is_verified', true)
      .order('sort_order'),
    supabaseAdmin.from('product_spec_rows')
      .select('id, label, value, unit, visibility, sort_order')
      .eq('product_id', productId).neq('visibility', 'internal').order('sort_order'),
  ])

  const groups = (groupsRes.data ?? []).map(g => ({
    id: g.id,
    label: g.label,
    key: g.key,
    required: g.required,
    helpText: g.help_text,
    materialType: g.material_type ?? null,
    options: ((g.options ?? []) as Array<Record<string, unknown>>)
      .filter(o => (o.finish as Record<string, unknown> | null)?.is_active !== false)
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
      .map(o => {
        const f = (o.finish ?? {}) as Record<string, unknown>
        return {
          id: o.id,
          isAvailable: o.is_available,
          isDefault: o.is_default,
          priceAdjustment: isTradeOrStaff ? Number(o.price_adjustment ?? 0) : null,
          leadTimeAdjustmentWeeks: Number(o.lead_time_adjustment_weeks ?? 0),
          sampleAvailable: (o.sample_available as boolean | null) ?? (f.sample_available as boolean | null) ?? false,
          finish: {
            id: f.id,
            name: f.name,
            code: f.code,
            hexColour: f.hex_colour,
            textureUrl: f.texture_storage_path ? mediaUrl('product-media', f.texture_storage_path as string) : null,
            origin: f.origin,
            description: (o.description_override as string | null) ?? (f.description as string | null),
            technicalNotes: f.technical_notes,
          },
        }
      }),
  }))

  return {
    materialTypes: (typesRes.data ?? []).map(t => ({ id: t.id as string, name: t.name as string, slug: t.slug as string })),
    groups,
    rules: (rulesRes.data ?? []).map(r => ({
      sourceFinishOptionId: r.source_finish_option_id as string,
      targetFinishOptionId: r.target_finish_option_id as string,
      isAllowed: r.is_allowed as boolean,
      explanation: (r.explanation as string | null) ?? null,
      isActive: true,
    })),
    media: (mediaRes.data ?? []).map(m => ({
      id: m.id as string,
      url: mediaUrl((m.storage_bucket as string) ?? 'product-media', m.storage_path as string),
      finishOptionId: m.finish_option_id as string | null,
      role: m.media_role as string,
      altText: m.alt_text as string | null,
      isPrimary: m.is_primary as boolean,
    })),
    passport: (passportRes.data ?? [])
      .filter(p => !p.expires_at || (p.expires_at as string) > nowIso)
      .map(p => ({ label: p.label as string, value: p.value_text as string | null })),
    specRows: (specRes.data ?? [])
      .filter(r => r.visibility === 'public' || isTradeOrStaff)
      .map(r => ({ id: r.id as string, label: r.label as string, value: r.value as string, unit: r.unit as string | null })),
  }
}
