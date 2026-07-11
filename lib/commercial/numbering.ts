import 'server-only'
import { supabaseAdmin } from '../supabase'

// ============================================================
// Transaction-safe document numbering.
//
// All numbers come from Postgres sequences via SECURITY DEFINER
// functions, so they are concurrency-safe and never re-used:
//   Quote     FBA-Q-YYYY-0001   (next_quote_number)
//   Pro forma FBA-YYYY-0001     (legacy column default, preserved)
//   Invoice   FBA-INV-YYYY-0001 (next_invoice_number)
// Historic numbers are never regenerated or renumbered.
// ============================================================

export async function nextQuoteNumber(): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('next_quote_number')
  if (error || !data) throw new Error(`Could not allocate quote number: ${error?.message ?? 'no value'}`)
  return data as string
}

export async function nextInvoiceNumber(): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('next_invoice_number')
  if (error || !data) throw new Error(`Could not allocate invoice number: ${error?.message ?? 'no value'}`)
  return data as string
}

/** Format a revision suffix: revision 1 → base number, 2+ → -R02 etc. */
export function withRevision(base: string, revision: number): string {
  if (revision <= 1) return base
  return `${base}-R${String(revision).padStart(2, '0')}`
}
