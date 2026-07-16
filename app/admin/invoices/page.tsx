import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'

export const metadata = { title: 'Invoices' }
export const dynamic = 'force-dynamic'

function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }
const money = (n: unknown, cur: string) => `${sym(cur)}${Number(n ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`

async function getInvoices() {
  const { data } = await supabaseAdmin.from('sales_invoices')
    .select('id, invoice_number, invoice_type, status, currency, gross_total, amount_paid, credit_total, balance_due, due_date, issue_date, client_snapshot, created_at')
    .order('created_at', { ascending: false }).limit(500)
  return data ?? []
}

export default async function InvoicesPage() {
  const invoices = await getInvoices()
  const today = new Date().toISOString().slice(0, 10)
  const overdue = invoices.filter((i: Record<string, unknown>) => i.status !== 'paid' && i.status !== 'void' && Number(i.balance_due) > 0 && i.due_date && (i.due_date as string) < today)
  const outstanding = invoices.reduce((s: number, i: Record<string, unknown>) => s + (i.status === 'void' ? 0 : Number(i.balance_due ?? 0)), 0)
  const draft = invoices.filter((i: Record<string, unknown>) => i.status === 'draft')

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Invoices</h1>
          <p className="admin-subtitle">Client sales invoices — dedicated records, immutable once issued</p>
        </div>
        <Link href="/admin/commercial-orders" className="btn btn-secondary btn-sm">Commercial Orders →</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'All Invoices', value: invoices.length, colour: 'var(--forest)' },
          { label: 'Draft', value: draft.length, colour: '#6b6b64' },
          { label: 'Overdue', value: overdue.length, colour: '#a03030' },
          { label: 'Outstanding', value: money(outstanding, (invoices[0]?.currency as string) ?? 'GBP'), colour: '#004085' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value" style={{ color: s.colour }}>{s.value}</div>
          </div>
        ))}
      </div>

      {invoices.length === 0 ? (
        <div className="empty-state" style={{ padding: 48, textAlign: 'center', color: 'var(--stone)' }}>
          <p>No invoices yet. Create them from an accepted commercial order.</p>
        </div>
      ) : (
        <div className="table-scroll">
<table className="data-table">
          <thead><tr><th>Invoice</th><th>Type</th><th>Client</th><th>Status</th><th>Total</th><th>Paid</th><th>Balance</th><th>Due</th></tr></thead>
          <tbody>
            {invoices.map((i: Record<string, unknown>) => {
              const cur = (i.currency as string) ?? 'GBP'
              const isOverdue = i.status !== 'paid' && i.status !== 'void' && Number(i.balance_due) > 0 && i.due_date && (i.due_date as string) < today
              return (
                <tr key={i.id as string}>
                  <td><Link href={`/admin/invoices/${i.id}`} style={{ color: 'var(--forest)', fontWeight: 500 }}>{(i.invoice_number as string) ?? 'DRAFT'}</Link></td>
                  <td style={{ fontSize: 12 }}>{i.invoice_type as string}</td>
                  <td style={{ fontSize: 13 }}>{((i.client_snapshot ?? {}) as Record<string, unknown>).company as string || ((i.client_snapshot ?? {}) as Record<string, unknown>).name as string || '—'}</td>
                  <td><span className="status-pill" style={isOverdue ? { color: '#a03030' } : undefined}>{isOverdue ? 'overdue' : (i.status as string).replace(/_/g, ' ')}</span></td>
                  <td>{money(i.gross_total, cur)}</td>
                  <td style={{ fontSize: 13 }}>{money(i.amount_paid, cur)}</td>
                  <td style={{ fontWeight: 500 }}>{money(i.balance_due, cur)}</td>
                  <td style={{ fontSize: 12, color: isOverdue ? '#a03030' : 'var(--stone)' }}>{i.due_date ? new Date(i.due_date as string).toLocaleDateString('en-GB') : '—'}</td>
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
