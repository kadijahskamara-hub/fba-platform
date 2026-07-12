import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import PaymentActions from './PaymentActions'

export const dynamic = 'force-dynamic'
function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }
const money = (n: unknown, cur: string) => `${sym(cur)}${Number(n ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`

export default async function PaymentDetailPage({ params }: { params: { id: string } }) {
  const { data: pay } = await supabaseAdmin.from('payments').select('*').eq('id', params.id).single()
  if (!pay) notFound()
  const cur = (pay.currency as string) ?? 'GBP'

  const { data: allocs } = await supabaseAdmin
    .from('payment_allocations').select('id, amount, invoice:sales_invoices(invoice_number)').eq('payment_id', params.id)
  const allocated = (allocs ?? []).reduce((s, a) => s + Number(a.amount ?? 0), 0)
  const unallocated = Number(pay.amount) - allocated

  const { data: receipt } = await supabaseAdmin.from('payment_receipts').select('receipt_number').eq('payment_id', params.id).maybeSingle()

  // Candidate issued invoices to allocate to (same client, outstanding balance, matching currency).
  const { data: openInvoices } = await supabaseAdmin.from('sales_invoices')
    .select('id, invoice_number, balance_due')
    .eq('client_id', pay.client_id ?? '00000000-0000-0000-0000-000000000000')
    .eq('currency', cur).not('locked_at', 'is', null).gt('balance_due', 0)
    .order('due_date', { ascending: true })
  const invoiceOpts = (openInvoices ?? []).map(i => ({ id: i.id as string, label: (i.invoice_number as string) ?? 'INV', balance: Number(i.balance_due ?? 0) }))

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">{pay.payment_reference as string}</h1>
          <p className="admin-subtitle">{money(pay.amount, cur)} · {(pay.payment_method as string).replace(/_/g, ' ')} · <span className="status-pill">{pay.status as string}</span></p>
        </div>
        <Link href="/admin/payments" className="btn btn-secondary btn-sm">← All payments</Link>
      </div>

      <div style={{ marginBottom: 22 }}>
        <PaymentActions paymentId={params.id} status={pay.status as string} unallocated={unallocated} invoices={invoiceOpts} hasReceipt={!!receipt} />
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
