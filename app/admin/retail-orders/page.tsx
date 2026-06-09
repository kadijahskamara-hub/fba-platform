import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'

export const metadata = { title: 'Retail Orders' }

const STATUS_COLOURS: Record<string, string> = {
  pending:    'status-pending',
  paid:       'status-approved',
  processing: 'status-form-sent',
  shipped:    'status-review',
  completed:  'status-approved',
  cancelled:  'status-declined',
  refunded:   'status-revoked',
}

async function getOrders() {
  const { data } = await supabaseAdmin
    .from('retail_orders')
    .select(`
      id, order_number, status, total_amount, currency,
      shipping_name, created_at,
      user:users(first_name, last_name, email)
    `)
    .order('created_at', { ascending: false })
  return data ?? []
}

export default async function AdminRetailOrdersPage() {
  const orders = await getOrders()

  const byStatus = (s: string) => orders.filter((o: Record<string, unknown>) => o.status === s).length
  const revenue  = orders
    .filter((o: Record<string, unknown>) => !['cancelled', 'refunded'].includes(o.status as string))
    .reduce((sum: number, o: Record<string, unknown>) => sum + Number(o.total_amount ?? 0), 0)

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Retail Orders</h1>
          <p className="admin-subtitle">{orders.length} orders total</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total Orders',   value: orders.length,    colour: 'var(--forest)' },
          { label: 'Processing',     value: byStatus('processing') + byStatus('paid'), colour: '#004085' },
          { label: 'Completed',      value: byStatus('completed'), colour: '#155724' },
          { label: 'Total Revenue',  value: `£${revenue.toLocaleString('en-GB', { minimumFractionDigits: 0 })}`, colour: 'var(--caramel)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value" style={{ color: s.colour, fontSize: typeof s.value === 'string' ? 28 : 44 }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
          <h3>No retail orders yet</h3>
          <p>Orders placed on the platform will appear here.</p>
        </div>
      ) : (
        <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Ship to</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: Record<string, unknown>) => {
                const user = o.user as Record<string, string> | null
                return (
                  <tr key={o.id as string}>
                    <td>
                      <Link href={`/admin/retail-orders/${o.id as string}`}
                            style={{ fontWeight: 500, fontFamily: 'var(--font-serif)', fontSize: 15,
                                     color: 'var(--forest)', textDecoration: 'none' }}>
                        #{o.order_number as string}
                      </Link>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      <div>{user?.first_name} {user?.last_name}</div>
                      <div style={{ color: 'var(--stone)', fontSize: 12 }}>{user?.email}</div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--stone)' }}>
                      {o.shipping_name as string ?? '—'}
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      £{Number(o.total_amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <span className={`status-pill ${STATUS_COLOURS[o.status as string] ?? 'status-pending'}`}>
                        {(o.status as string).replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--stone)' }}>
                      {new Date(o.created_at as string).toLocaleDateString('en-GB')}
                    </td>
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
