import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import InvoiceActions from './InvoiceActions'
import { DocumentsCommsPanel } from '@/components/DocumentsCommsPanel'
import { InvoiceAccountingControls } from '@/components/InvoiceAccountingControls'
import { UltraDeleteRecordButton } from '@/components/UltraDeleteRecordButton'
import { InvoiceApplyPayment, type CandidatePayment } from '@/components/InvoiceApplyPayment'
import { creditNoteStage } from '@/lib/commercial/creditNoteLogic'

export const dynamic = 'force-dynamic'
function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }
const money = (n: unknown, cur: string) => `${sym(cur)}${Number(n ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`

export default async function InvoiceDetailPage(ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const { data: inv } = await supabaseAdmin.from('sales_invoices').select('*').eq('id', params.id).single()
  if (!inv) notFound()
  const { data: lines } = await supabaseAdmin.from('sales_invoice_lines').select('*').eq('sales_invoice_id', params.id).order('sort_order')
  const { data: allocs } = await supabaseAdmin.from('payment_allocations').select('amount, payment:payments(payment_reference, status)').eq('sales_invoice_id', params.id)
  // Sprint 18 QA (P0): credit notes drafted from this invoice used to be
  // invisible after a reload — nothing on this page listed or linked them.
  const { data: creditNotes } = await supabaseAdmin.from('credit_notes')
    .select('id, credit_note_number, status, approval_status, gross_total, allocated_total, reason, created_at')
    .eq('sales_invoice_id', params.id).order('created_at', { ascending: false })
  const cur = (inv.currency as string) ?? 'GBP'
  const cl = (inv.client_snapshot ?? {}) as Record<string, unknown>

  // Sprint 16 — confirmed payments for this party that still carry
  // unallocated money, so staff can apply one from the invoice side.
  // Matched on client OR commercial order: orders in the
  // quote->proforma->order flow carry a client_snapshot, not a
  // client_id, so client-only matching finds nothing.
  const invClientId = (inv.client_id as string | null) ?? null
  const invOrderId = (inv.commercial_order_id as string | null) ?? null
  const balanceDue = Number(inv.balance_due ?? 0)
  const issued = !!inv.locked_at

  let candidatePayments: CandidatePayment[] = []
  let applyReason: string | null = null

  if (issued && balanceDue > 0.005) {
    const partyFilter = [
      invClientId ? `client_id.eq.${invClientId}` : null,
      invOrderId ? `commercial_order_id.eq.${invOrderId}` : null,
    ].filter(Boolean).join(',')

    if (!partyFilter) {
      applyReason = 'This invoice is not linked to a client or a commercial order, so no payments can be matched to it.'
    } else {
      const { data: payRows } = await supabaseAdmin.from('payments')
        .select('id, payment_reference, payment_date, payment_method, amount, payment_allocations(amount)')
        .or(partyFilter)
        .eq('status', 'confirmed').eq('currency', cur)
        .order('payment_date', { ascending: true })

      candidatePayments = ((payRows ?? []) as Record<string, unknown>[]).map(p => {
        const used = ((p.payment_allocations as { amount: number }[] | null) ?? [])
          .reduce((s, a) => s + Number(a.amount ?? 0), 0)
        return {
          id: p.id as string,
          reference: (p.payment_reference as string) ?? 'Payment',
          paymentDate: (p.payment_date as string | null) ?? null,
          method: (p.payment_method as string | null) ?? null,
          unallocated: Math.round((Number(p.amount ?? 0) - used) * 100) / 100,
        }
      }).filter(p => p.unallocated > 0.005)

      if (candidatePayments.length === 0) {
        applyReason = 'No confirmed payments with an unallocated balance and matching currency were found for this client or order.'
      }
    }
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">{(inv.invoice_number as string) ?? 'Draft invoice'}</h1>
          <p className="admin-subtitle">{inv.invoice_type as string} · <span className="status-pill">{(inv.status as string).replace(/_/g, ' ')}</span>{inv.locked_at ? ' · issued (immutable)' : ' · draft'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Sprint 7.1 — Ultra-only test-data deletion */}
          <UltraDeleteRecordButton
            entity="sales_invoice"
            recordId={params.id}
            label={(inv.invoice_number as string) ?? 'Draft invoice'}
            redirectTo="/admin/invoices"
          />
          <Link href="/admin/invoices" className="btn btn-secondary btn-sm">← All invoices</Link>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}><InvoiceActions invoiceId={params.id} locked={!!inv.locked_at} /></div>

      {inv.locked_at && (
        <div style={{ marginBottom: 20 }}>
          <InvoiceAccountingControls
            invoiceId={params.id}
            status={inv.status as string}
            locked={!!inv.locked_at}
            reconciliationStatus={(inv.reconciliation_status as string) ?? 'not_exported'}
            replacedByInvoiceId={(inv.replaced_by_invoice_id as string) ?? null}
            replacesInvoiceId={(inv.replaces_invoice_id as string) ?? null}
          />
        </div>
      )}

      {issued && balanceDue > 0.005 && (
        <div style={{ marginBottom: 20 }}>
          <InvoiceApplyPayment
            invoiceId={params.id}
            currency={cur}
            balanceDue={balanceDue}
            payments={candidatePayments}
            reason={applyReason}
          />
        </div>
      )}

      {inv.locked_at && (
        <div style={{ marginBottom: 20 }}>
          <DocumentsCommsPanel
            documents={[{ label: 'Invoice PDF', entityType: 'sales_invoice', entityId: params.id }]}
            prepare={[{
              label: 'send invoice',
              templateKey: 'invoice_issue',
              entities: { sales_invoice_id: params.id, commercial_order_id: (inv.commercial_order_id as string) ?? null },
              attachments: [{ entityType: 'sales_invoice', entityId: params.id }],
            }]}
          />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total', value: money(inv.gross_total, cur) },
          { label: 'Paid', value: money(inv.amount_paid, cur) },
          { label: 'Credited', value: money(inv.credit_total, cur) },
          { label: 'Balance due', value: money(inv.balance_due, cur) },
        ].map(s => (
          <div key={s.label} className="stat-card"><div className="stat-card-label">{s.label}</div><div className="stat-card-value" style={{ fontSize: 20 }}>{s.value}</div></div>
        ))}
      </div>

      <p style={{ color: 'var(--stone)', marginBottom: 6 }}>Billed to <strong>{(cl.company as string) || (cl.name as string) || '—'}</strong>{cl.email ? ` · ${cl.email}` : ''}</p>

      <table className="data-table" style={{ marginTop: 12 }}>
        <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>VAT</th><th>Net</th><th>Gross</th></tr></thead>
        <tbody>
          {(lines ?? []).map((l: Record<string, unknown>) => (
            <tr key={l.id as string}>
              <td>{l.name_snapshot as string}</td>
              <td>{Number(l.quantity)}</td>
              <td>{money(l.unit_price, cur)}</td>
              <td style={{ fontSize: 12 }}>{l.tax_category as string} {Number(l.tax_rate_snapshot ?? 0)}%</td>
              <td>{money(l.line_net_total, cur)}</td>
              <td>{money(l.line_gross_total, cur)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {(creditNotes ?? []).length > 0 && (
        <>
          <h3 style={{ marginTop: 28, color: 'var(--forest)' }}>Credit notes against this invoice</h3>
          <table className="data-table">
            <thead><tr><th>Credit note</th><th>Stage</th><th>Gross</th><th>Allocated</th><th>Reason</th></tr></thead>
            <tbody>
              {(creditNotes ?? []).map((c: Record<string, unknown>) => (
                <tr key={c.id as string}>
                  <td><Link href={`/admin/credit-notes/${c.id}`} style={{ color: 'var(--forest)', fontWeight: 500 }}>{(c.credit_note_number as string) ?? 'DRAFT'}</Link></td>
                  <td><span className="status-pill">{creditNoteStage(c.status as string, (c.approval_status as string) ?? 'none')}</span></td>
                  <td>{money(c.gross_total, cur)}</td>
                  <td>{money(c.allocated_total, cur)}</td>
                  <td style={{ fontSize: 13 }}>{(c.reason as string) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {(allocs ?? []).length > 0 && (
        <>
          <h3 style={{ marginTop: 28, color: 'var(--forest)' }}>Payments allocated</h3>
          <table className="data-table">
            <thead><tr><th>Payment</th><th>Status</th><th>Amount</th></tr></thead>
            <tbody>
              {(allocs ?? []).map((a: Record<string, unknown>, i: number) => (
                <tr key={i}>
                  <td>{((a.payment ?? {}) as Record<string, unknown>).payment_reference as string ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>{((a.payment ?? {}) as Record<string, unknown>).status as string ?? '—'}</td>
                  <td>{money(a.amount, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
