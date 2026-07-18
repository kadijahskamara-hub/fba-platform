import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { creditNoteStage } from '@/lib/commercial/creditNoteLogic'

// ============================================================
// Credit notes list (Sprint 18, QA P0). Drafted credit notes were
// invisible after creation: no route, no nav entry, no way to
// approve or issue them. This is the list half of the new screens.
// ============================================================

export const metadata = { title: 'Credit Notes' }
export const dynamic = 'force-dynamic'

function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }
const money = (n: unknown, cur: string) => `${sym(cur)}${Number(n ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`

export default async function CreditNotesPage() {
  const { data } = await supabaseAdmin.from('credit_notes')
    .select('id, credit_note_number, status, approval_status, currency, gross_total, allocated_total, reason, created_at, invoice:sales_invoices(id, invoice_number)')
    .order('created_at', { ascending: false }).limit(500)
  const notes = (data ?? []) as Record<string, unknown>[]

  const drafts = notes.filter(n => !['issued', 'allocated', 'void'].includes(n.status as string))
  const issued = notes.filter(n => ['issued', 'allocated'].includes(n.status as string))
  const openValue = issued.reduce((s, n) => s + Math.max(0, Number(n.gross_total ?? 0) - Number(n.allocated_total ?? 0)), 0)

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Credit Notes</h1>
          <p className="admin-subtitle">Draft → approve → issue → allocate or refund. Issued notes are immutable.</p>
        </div>
        <Link href="/admin/invoices" className="btn btn-secondary btn-sm">Invoices →</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'All credit notes', value: notes.length, colour: 'var(--forest)' },
          { label: 'Awaiting approval / issue', value: drafts.length, colour: '#8a6d1a' },
          { label: 'Issued', value: issued.length, colour: 'var(--forest)' },
          { label: 'Unapplied value', value: money(openValue, (notes[0]?.currency as string) ?? 'GBP'), colour: '#004085' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value" style={{ color: s.colour }}>{s.value}</div>
          </div>
        ))}
      </div>

      {notes.length === 0 ? (
        <div className="empty-state" style={{ padding: 48, textAlign: 'center', color: 'var(--stone)' }}>
          <p>No credit notes yet. Create one from an issued invoice&apos;s accounting controls.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Credit note</th><th>Invoice</th><th>Stage</th><th style={{ textAlign: 'right' }}>Gross</th><th style={{ textAlign: 'right' }}>Allocated</th><th>Reason</th><th>Created</th></tr></thead>
            <tbody>
              {notes.map(n => {
                const cur = (n.currency as string) ?? 'GBP'
                const inv = (n.invoice ?? {}) as Record<string, unknown>
                return (
                  <tr key={n.id as string}>
                    <td><Link href={`/admin/credit-notes/${n.id}`} style={{ color: 'var(--forest)', fontWeight: 500 }}>{(n.credit_note_number as string) ?? 'DRAFT'}</Link></td>
                    <td>{inv.id
                      ? <Link href={`/admin/invoices/${inv.id}`} style={{ color: 'var(--forest)' }}>{(inv.invoice_number as string) ?? 'Draft invoice'}</Link>
                      : '—'}</td>
                    <td><span className="status-pill">{creditNoteStage(n.status as string, n.approval_status as string)}</span></td>
                    <td style={{ textAlign: 'right' }}>{money(n.gross_total, cur)}</td>
                    <td style={{ textAlign: 'right' }}>{money(n.allocated_total, cur)}</td>
                    <td style={{ fontSize: 13, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(n.reason as string) ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--stone)' }}>{n.created_at ? new Date(n.created_at as string).toLocaleDateString('en-GB') : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
