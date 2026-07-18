import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { noCandidateReason } from '@/lib/commercial/invoiceCalculations'
import PaymentActions from './PaymentActions'
import { PaymentRefundControls } from '@/components/PaymentRefundControls'
import { UltraDeleteRecordButton } from '@/components/UltraDeleteRecordButton'

export const dynamic = 'force-dynamic'
function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }
const money = (n: unknown, cur: string) => `${sym(cur)}${Number(n ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`

export default async function PaymentDetailPage(ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const { data: pay } = await supabaseAdmin.from('payments').select('*').eq('id', params.id).single()
  if (!pay) notFound()
  const cur = (pay.currency as string) ?? 'GBP'

  const { data: allocs } = await supabaseAdmin
    .from('payment_allocations').select('id, amount, invoice:sales_invoices(invoice_number)').eq('payment_id', params.id)
  const allocated = (allocs ?? []).reduce((s, a) => s + Number(a.amount ?? 0), 0)
  const unallocated = Number(pay.amount) - allocated

  const { data: receipt } = await supabaseAdmin.from('payment_receipts').select('receipt_number').eq('payment_id', params.id).maybeSingle()

  // Refunds recorded against this payment + remaining refundable amount.
  const { data: refundRows } = await supabaseAdmin
    .from('refunds').select('id, refund_number, amount, status, refund_date').eq('payment_id', params.id).order('created_at', { ascending: false })
  const refundsUsed = (refundRows ?? []).filter(r => r.status !== 'cancelled').reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const refundable = pay.status === 'confirmed' ? Math.max(0, Number(pay.amount) - refundsUsed) : 0

  // Candidate issued invoices to allocate to: issued, outstanding, matching
  // currency, belonging to the same party. Sprint 16 — matching on client_id
  // alone returned nothing, because orders in the quote->proforma->order flow
  // carry a client_snapshot rather than a client_id, so payments and invoices
  // both sit with client_id = null. Match on client OR commercial order.
  const payClientId = (pay.client_id as string | null) ?? null
  const payOrderId = (pay.commercial_order_id as string | null) ?? null
  const hasParty = !!(payClientId || payOrderId)

  const orFilter = [
    payClientId ? `client_id.eq.${payClientId}` : null,
    payOrderId ? `commercial_order_id.eq.${payOrderId}` : null,
  ].filter(Boolean).join(',')

  const { data: openInvoices } = hasParty
    ? await supabaseAdmin.from('sales_invoices')
        .select('id, invoice_number, gross_total, amount_paid, credit_total, balance_due, due_date')
        .or(orFilter)
        .eq('currency', cur).not('locked_at', 'is', null).gt('balance_due', 0)
        .order('due_date', { ascending: true })
    : { data: [] as Record<string, unknown>[] }

  const invoiceOpts = (openInvoices ?? []).map(i => ({
    id: i.id as string,
    label: (i.invoice_number as string) ?? 'Draft invoice',
    balance: Number(i.balance_due ?? 0),
    dueDate: (i.due_date as string | null) ?? null,
  }))

  const noCandidatesReason = noCandidateReason({
    paymentStatus: pay.status as string,
    unallocated,
    hasParty,
    candidateCount: invoiceOpts.length,
  })

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">{pay.payment_reference as string}</h1>
          <p className="admin-subtitle">{money(pay.amount, cur)} · {(pay.payment_method as string).replace(/_/g, ' ')} · <span className="status-pill">{pay.status as string}</span></p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Sprint 7.1 — Ultra-only test-data deletion */}
          <UltraDeleteRecordButton
            entity="payment"
            recordId={params.id}
            label={pay.payment_reference as string}
            redirectTo="/admin/payments"
          />
          <Link href="/admin/payments" className="btn btn-secondary btn-sm">← All payments</Link>
        </div>
      </div>

      <div style={{ marginBottom: 22 }}>
        <PaymentActions paymentId={params.id} status={pay.status as string} unallocated={unallocated}
          invoices={invoiceOpts} hasReceipt={!!receipt} currency={cur}
          allocations={(allocs ?? []).map((a: Record<string, unknown>) => ({
            id: a.id as string,
            amount: Number(a.amount ?? 0),
            invoiceNumber: (((a.invoice ?? {}) as Record<string, unknown>).invoice_number as string) ?? '—',
          }))}
          noCandidatesReason={noCandidatesReason} />
      </div>

      <div style={{ marginBottom: 22 }}>
        <PaymentRefundControls
          paymentId={params.id}
          status={pay.status as string}
          currency={cur}
          refundable={refundable}
          reconciliationStatus={(pay.reconciliation_status as string) ?? 'not_exported'}
          refunds={(refundRows ?? []) as Array<{ id: string; refund_number: string; amount: number; status: string; refund_date: string }>}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Amount', value: money(pay.amount, cur) },
          { label: 'Allocated', value: money(allocated, cur) },
          { label: 'Unallocated', value: money(unallocated, cur) },
        ].map(s => <div key={s.label} className="stat-card"><div className="stat-card-label">{s.label}</div><div className="stat-card-value" style={{ fontSize: 20 }}>{s.value}</div></div>)}
      </div>

      <h3 style={{ color: 'var(--forest)' }}>Allocations</h3>
      <table className="data-table">
        <thead><tr><th>Invoice</th><th>Amount</th></tr></thead>
        <tbody>
          {(allocs ?? []).length === 0
            ? <tr><td colSpan={2} style={{ color: 'var(--stone)' }}>Unallocated.</td></tr>
            : (allocs ?? []).map((a: Record<string, unknown>) => (
              <tr key={a.id as string}>
                <td>{((a.invoice ?? {}) as Record<string, unknown>).invoice_number as string ?? '—'}</td>
                <td>{money(a.amount, cur)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </>
  )
}
