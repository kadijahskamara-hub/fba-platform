import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import {
  SIGNUP_POPUP_KEY, normalizeSignupPopupConfig, isPopupActive,
  isPopupAudience, isValidPopupEmail,
} from '@/lib/signupPopup'

// ============================================================
// Public signup-popup endpoints (Sprint 25).
//
// GET  — the active popup config for the storefront. Returns
//        { active: false } when disabled, out of schedule, or
//        the visitor is logged-in staff/admin (never nag staff).
// POST — lead capture: { email, audience: 'retail'|'trade' }.
//        Rate-limited per IP; email format validated; upserts
//        into contacts with source 'signup_popup' and explicit
//        marketing consent. Existing contacts are never
//        downgraded — we only add consent and fill blanks.
// ============================================================

export async function GET() {
  const session = await getSession()
  if (session?.role === 'admin' || session?.role === 'staff') {
    return NextResponse.json({ active: false })
  }

  const { data } = await supabaseAdmin
    .from('site_settings').select('value').eq('key', SIGNUP_POPUP_KEY).maybeSingle()
  const config = normalizeSignupPopupConfig(data?.value)
  if (!isPopupActive(config)) return NextResponse.json({ active: false })

  // Public payload: rendering fields only (no schedule internals).
  return NextResponse.json({
    active: true,
    config: {
      imageUrl: config.imageUrl,
      headline: config.headline,
      subheadline: config.subheadline,
      offerText: config.offerText,
      finePrint: config.finePrint,
      buttonLabel: config.buttonLabel,
      successMessage: config.successMessage,
      discountCode: config.discountCode,
      consentText: config.consentText,
      audiences: config.audiences,
      trigger: config.trigger,
      delaySeconds: config.delaySeconds,
      scrollPercent: config.scrollPercent,
      suppressDays: config.suppressDays,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = checkRateLimit(`signup-popup:${ip}`, 5, 10 * 60 * 1000) // 5 per 10 min per IP
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: 'Too many attempts — please try again later.' }, { status: 429 })
  }

  // Captures are only accepted while the popup is actually live.
  const { data: setting } = await supabaseAdmin
    .from('site_settings').select('value').eq('key', SIGNUP_POPUP_KEY).maybeSingle()
  const config = normalizeSignupPopupConfig(setting?.value)
  if (!isPopupActive(config)) {
    return NextResponse.json({ success: false, error: 'Signups are closed at the moment.' }, { status: 400 })
  }

  let body: { email?: unknown; audience?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid request.' }, { status: 400 })
  }

  if (!isValidPopupEmail(body.email)) {
    return NextResponse.json({ success: false, error: 'Please enter a valid email address.' }, { status: 400 })
  }
  if (!isPopupAudience(body.audience)) {
    return NextResponse.json({ success: false, error: 'Please choose Retail or Trade.' }, { status: 400 })
  }
  const email = body.email.trim().toLowerCase()

  const { data: existing } = await supabaseAdmin
    .from('contacts').select('id, contact_type, source').eq('email', email).maybeSingle()

  if (existing) {
    // Never downgrade: keep the existing type, add consent, fill a blank source.
    const patch: Record<string, unknown> = { consent_marketing: true }
    if (!existing.source) patch.source = 'signup_popup'
    const { error } = await supabaseAdmin.from('contacts').update(patch).eq('id', existing.id)
    if (error) return NextResponse.json({ success: false, error: 'Could not save your signup.' }, { status: 500 })
  } else {
    const { error } = await supabaseAdmin.from('contacts').insert({
      email,
      contact_type: body.audience,       // 'retail' | 'trade'
      source: 'signup_popup',
      consent_marketing: true,
    })
    if (error) return NextResponse.json({ success: false, error: 'Could not save your signup.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
