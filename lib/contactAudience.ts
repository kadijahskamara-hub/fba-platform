// ============================================================
// Contacts page audience split (Sprint 23).
//
// The Contacts screen is now two panels:
//   • CRM              — real relationships (trade clients, retail,
//                        suppliers/artisans, press, general). Excludes
//                        anyone holding an internal (admin/staff) account.
//   • Internal Accounts — staff/admin/Ultra Admin, read-only, managed
//                        in Staff & Permissions.
//
// Pure helpers live here so they can be unit-tested without Supabase.
// ============================================================

export const INTERNAL_ROLES = ['admin', 'staff'] as const

export type ContactAudience = 'crm' | 'internal'

export function parseAudience(raw: string | null | undefined): ContactAudience {
  return raw === 'internal' ? 'internal' : 'crm'
}

export function isInternalRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'staff'
}

// Build a PostgREST `in` list literal for `.not('email', 'in', …)`.
// Emails are quoted (they contain @ and dots) and embedded double
// quotes/backslashes escaped so a malicious stored email cannot break
// out of the list. Returns null when there is nothing to exclude.
export function postgrestEmailList(emails: string[]): string | null {
  const cleaned = [...new Set(
    emails
      .map(e => (e ?? '').trim().toLowerCase())
      .filter(Boolean)
  )]
  if (cleaned.length === 0) return null
  const quoted = cleaned.map(e => `"${e.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
  return `(${quoted.join(',')})`
}
