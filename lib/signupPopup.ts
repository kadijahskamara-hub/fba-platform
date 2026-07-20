// ============================================================
// Signup popup (lead-capture modal) — Sprint 25.
//
// Pure, client-safe config model shared by the public popup,
// the /admin/marketing/popup editor and the capture API.
// Stored as one site_settings JSON blob under SIGNUP_POPUP_KEY.
// ============================================================

export const SIGNUP_POPUP_KEY = 'signup_popup'

export type PopupTrigger = 'delay' | 'scroll' | 'exit'

export type SignupPopupAudience = {
  key: 'retail' | 'trade'
  label: string
}

export type SignupPopupConfig = {
  enabled: boolean
  startsAt: string | null          // ISO date — null = always
  endsAt: string | null
  imageUrl: string
  headline: string
  subheadline: string
  offerText: string
  finePrint: string
  buttonLabel: string
  successMessage: string
  discountCode: string             // shown after signup when non-empty
  consentText: string
  audiences: SignupPopupAudience[] // exactly retail + trade, labels editable
  trigger: PopupTrigger
  delaySeconds: number             // trigger 'delay'
  scrollPercent: number            // trigger 'scroll'
  suppressDays: number             // don't re-show for N days after dismissal
}

export const DEFAULT_SIGNUP_POPUP: SignupPopupConfig = {
  enabled: false,
  startsAt: null,
  endsAt: null,
  imageUrl: '',
  headline: 'Join The Atelier',
  subheadline: 'Subscribe to the newsletter.',
  offerText: '',
  finePrint: '',
  buttonLabel: "I'm signing up",
  successMessage: 'Welcome to Full Bloom Artelier — you are on the list.',
  discountCode: '',
  consentText: 'By signing up you agree to receive occasional emails from Full Bloom Artelier. Unsubscribe at any time.',
  audiences: [
    { key: 'retail', label: 'Retail' },
    { key: 'trade', label: 'Trade' },
  ],
  trigger: 'delay',
  delaySeconds: 6,
  scrollPercent: 40,
  suppressDays: 14,
}

const TRIGGERS: PopupTrigger[] = ['delay', 'scroll', 'exit']

function str(v: unknown, fallback: string, max = 500): string {
  return typeof v === 'string' ? v.slice(0, max) : fallback
}
function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

// Merge a stored JSON blob over the defaults, tolerating missing or
// junk fields (old configs keep working as the shape evolves).
export function normalizeSignupPopupConfig(raw: unknown): SignupPopupConfig {
  const d = DEFAULT_SIGNUP_POPUP
  if (!raw || typeof raw !== 'object') return { ...d, audiences: d.audiences.map(a => ({ ...a })) }
  const r = raw as Record<string, unknown>
  const auds = Array.isArray(r.audiences) ? r.audiences as Array<Record<string, unknown>> : []
  const audienceLabel = (key: 'retail' | 'trade') => {
    const found = auds.find(a => a && a.key === key)
    const fallback = d.audiences.find(a => a.key === key)!.label
    return str(found?.label, fallback, 40) || fallback
  }
  return {
    enabled: r.enabled === true,
    startsAt: typeof r.startsAt === 'string' && r.startsAt ? r.startsAt : null,
    endsAt: typeof r.endsAt === 'string' && r.endsAt ? r.endsAt : null,
    imageUrl: str(r.imageUrl, d.imageUrl, 1000),
    headline: str(r.headline, d.headline, 120),
    subheadline: str(r.subheadline, d.subheadline, 200),
    offerText: str(r.offerText, d.offerText, 200),
    finePrint: str(r.finePrint, d.finePrint, 500),
    buttonLabel: str(r.buttonLabel, d.buttonLabel, 60) || d.buttonLabel,
    successMessage: str(r.successMessage, d.successMessage, 300) || d.successMessage,
    discountCode: str(r.discountCode, d.discountCode, 60),
    consentText: str(r.consentText, d.consentText, 500) || d.consentText,
    audiences: [
      { key: 'retail', label: audienceLabel('retail') },
      { key: 'trade', label: audienceLabel('trade') },
    ],
    trigger: TRIGGERS.includes(r.trigger as PopupTrigger) ? (r.trigger as PopupTrigger) : d.trigger,
    delaySeconds: num(r.delaySeconds, d.delaySeconds, 0, 120),
    scrollPercent: num(r.scrollPercent, d.scrollPercent, 5, 95),
    suppressDays: num(r.suppressDays, d.suppressDays, 0, 365),
  }
}

// Is the popup live right now (enabled + inside its schedule)?
export function isPopupActive(config: SignupPopupConfig, now: Date = new Date()): boolean {
  if (!config.enabled) return false
  const t = now.getTime()
  if (config.startsAt) {
    const s = Date.parse(config.startsAt)
    if (Number.isFinite(s) && t < s) return false
  }
  if (config.endsAt) {
    const e = Date.parse(config.endsAt)
    if (Number.isFinite(e) && t > e) return false
  }
  return true
}

// Suppression: don't re-show within suppressDays of the last dismissal.
export function isSuppressed(config: SignupPopupConfig, lastDismissedIso: string | null, now: Date = new Date()): boolean {
  if (!lastDismissedIso) return false
  const last = Date.parse(lastDismissedIso)
  if (!Number.isFinite(last)) return false
  return now.getTime() - last < config.suppressDays * 24 * 60 * 60 * 1000
}

export function isPopupAudience(v: unknown): v is 'retail' | 'trade' {
  return v === 'retail' || v === 'trade'
}

// Same shape of validation the auth routes use: format, not just presence.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export function isValidPopupEmail(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v.trim())
}
