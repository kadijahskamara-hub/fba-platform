// ============================================================
// Contact sources — where a contact came from.
// Single vocabulary shared by the contacts UI, the admin API
// (allowlist validation) and the CSV export. Pure module.
//
// Automatic sources (set by the platform):
//   registration, trade_application, service_enquiry,
//   quote_request, contact_form, newsletter, website_enquiry
// Marketing/manual sources (picked by staff):
//   google_ads, instagram, facebook, linkedin, pinterest, tiktok,
//   referral, event, press, manual
// ============================================================

export const CONTACT_SOURCES = [
  // Platform flows
  { value: 'website_enquiry',   label: 'Website Enquiry' },
  { value: 'quote_request',     label: 'Quote Request' },
  { value: 'service_enquiry',   label: 'Service Enquiry' },
  { value: 'contact_form',      label: 'Contact Form' },
  { value: 'trade_application', label: 'Trade Application' },
  { value: 'registration',      label: 'Account Registration' },
  { value: 'newsletter',        label: 'Newsletter' },
  // Marketing channels
  { value: 'google_ads',        label: 'Google Ads' },
  { value: 'instagram',         label: 'Instagram' },
  { value: 'facebook',          label: 'Facebook' },
  { value: 'linkedin',          label: 'LinkedIn' },
  { value: 'pinterest',         label: 'Pinterest' },
  { value: 'tiktok',            label: 'TikTok' },
  // Relationship channels
  { value: 'referral',          label: 'Referral' },
  { value: 'event',             label: 'Event / Trade Show' },
  { value: 'press',             label: 'Press' },
  { value: 'manual',            label: 'Added Manually' },
] as const

export type ContactSource = (typeof CONTACT_SOURCES)[number]['value']

export const CONTACT_SOURCE_LABELS: Record<string, string> =
  Object.fromEntries(CONTACT_SOURCES.map(s => [s.value, s.label]))

export function isContactSource(value: unknown): value is ContactSource {
  return typeof value === 'string' && value in CONTACT_SOURCE_LABELS
}

/** Human label for any stored source value (legacy values fall through as-is). */
export function contactSourceLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return CONTACT_SOURCE_LABELS[value] ?? value
}
