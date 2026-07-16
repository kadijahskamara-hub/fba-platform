import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import RecordPaymentModal from '@/components/admin/commercial/RecordPaymentModal'

export const metadata = { title: 'Payments' }
export const dynamic = 'force-dynamic'

function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }
const money = (n: unknown, cur: string) => `${sym(cur)}${Number(n ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`

async function getPayments() {
  const { data } = await supabaseAdmin.from('payments')
    .select('id, payment_reference, currency, amount, payment_date, payment_method, status, created_at')
    .order('created_at', { ascending: false }).limit(500)
  return data ?? []
}

export default async function PaymentsPage() {
  const payments = await getPayments()
  const pending = payments.filter((p: Record<string, unknown>) => p.status === 'pending')
  const confirmed = payments.filter((p: Record<string, unknown>) => p.status === 'confirmed')
  const received = confirmed.reduce((s: number, p: Record<string, unknown>) => s + Number(p.amount ?? 0), 0)

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Payments</h1>
          <p className="admin-subtitle">Payment ledger — invoice balances derive from confirmed allocations</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <RecordPaymentModal />
          <Link href="/admin/invoices" className="btn btn-secondary btn-sm">Invoices →</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'All Payments', value: payments.length, colour: 'var(--forest)' },
          { label: 'Pending Confirmation', value: pending.length, colour: '#8a6d1a' },
          { label: 'Confirmed Received', value: money(received, (payments[0]?.currency as string) ?? 'GBP'), colour: '#1e7e34' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value" style={{ color: s.colour }}>{s.value}</div>
          </div>
        ))}
      </div>

      {payments.length === 0 ? (
        <div className="empty-state" style={{ padding: 48, textAlign: 'center', color: 'var(--stone)' }}>
          <p>No payments recorded yet.</p>
        </div>
      ) : (
        <div className="table-scroll">
<table className="data-table">
          <thead><tr><th>Reference</th><th>Date</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {payments.map((p: Record<string, unknown>) => (
              <tr key={p.id as string}>
                <td><Link href={`/admin/payments/${p.id}`} style={{ color: 'var(--forest)', fontWeight: 500 }}>{p.payment_reference as string}</Link></td>
                <td style={{ fontSize: 13 }}>{p.payment_date ? new Date(p.payment_date as string).toLocaleDateString('en-GB') : '—'}</td>
                <td style={{ fontSize: 12 }}>{(p.payment_method as string).replace(/_/g, ' ')}</td>
                <td style={{ fontWeight: 500 }}>{money(p.amount, (p.currency as string) ?? 'GBP')}</td>
                <td><span className="status-pill">{p.status as string}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
</div>
      )}
    </>
  )
}
