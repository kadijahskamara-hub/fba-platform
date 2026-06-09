import 'server-only'
import { cache } from 'react'
import { supabase } from './supabase'

// ── Types ────────────────────────────────────────────────────

export interface LaunchFlags {
  show_collection: boolean
  show_home:       boolean
  show_artisans:   boolean
  show_journal:    boolean
  show_trade_cta:  boolean
}

// All flags default to true so the site works even if the DB row is absent
const DEFAULT_FLAGS: LaunchFlags = {
  show_collection: true,
  show_home:       true,
  show_artisans:   true,
  show_journal:    true,
  show_trade_cta:  true,
}

// ── Flag fetcher ─────────────────────────────────────────────
// Wrapped in React cache() so multiple server components in the same
// request (layout + page) share a single DB call.

export const getFlags = cache(async (): Promise<LaunchFlags> => {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'launch_flags')
      .single()

    if (error || !data) return DEFAULT_FLAGS

    // Merge DB value over defaults so missing keys stay true
    return { ...DEFAULT_FLAGS, ...(data.value as Partial<LaunchFlags>) }
  } catch {
    return DEFAULT_FLAGS
  }
})

// ── Admin updater (server-side, used by API route) ───────────
// Returns the updated flags.
export async function updateFlags(
  partial: Partial<LaunchFlags>
): Promise<LaunchFlags> {
  // Import here to avoid bundling supabaseAdmin into client bundles
  const { supabaseAdmin } = await import('./supabase')

  // Read current value first
  const { data: existing } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('key', 'launch_flags')
    .single()

  const current: LaunchFlags = {
    ...DEFAULT_FLAGS,
    ...((existing?.value ?? {}) as Partial<LaunchFlags>),
  }

  const updated: LaunchFlags = { ...current, ...partial }

  await supabaseAdmin
    .from('site_settings')
    .upsert({ key: 'launch_flags', value: updated as unknown as Record<string, unknown> })

  return updated
}
