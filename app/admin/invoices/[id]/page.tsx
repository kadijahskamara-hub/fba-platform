import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import InvoiceActions from './InvoiceActions'

export const dynamic = 'force-dynamic'
function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }
const money = (n: unknown, cur: string) => `${sym(cur)}${Number(n ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`

export default async function InvoiceDetailPage(ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const { data: inv } = await supabaseAdmin.from('sales_invoices').select('*').eq('id', params.id).single()
  if (!inv) notFound()
  const { data: lines } = await supabaseAdmin.from('sales_invoice_lines').select('*').eq('sales_invoice_id', params.id).order('sort_order')
  const { data: allocs } = await supabaseAdmin.from('payment_allocations').select('amount, payment:payments(payment_reference, status)').eq('sales_invoice_id', params.id)
  const cur = (inv.currency as string) ?? 'GBP'
  const cl = (inv.client_snapshot ?? {}) as Record<string, unknown>

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">{(inv.invoice_number as string) ?? 'Draft invoice'}</h1>
          <p className="admin-subtitle">{inv.invoice_type as string} · <span className="status-pill">{(inv.status as string).replace(/_/g, ' ')}</span>{inv.locked_at ? ' · issued (immutable)' : ' · draft'}</p>
        </div>
        <Link href="/admin/invoices" className="btn btn-secondary btn-sm">← All invoices</Link>
      </div>

      <div style={{ marginBottom: 20 }}><InvoiceActions invoiceId={params.id} locked={!!inv.locked_at} /></div>

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
