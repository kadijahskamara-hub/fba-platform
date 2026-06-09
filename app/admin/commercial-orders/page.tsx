import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'

export const metadata = { title: 'Commercial Orders' }

async function getCommercialOrders() {
  // Commercial orders = quote requests that have been converted to orders or accepted
  const { data } = await supabaseAdmin
    .from('quote_requests')
    .select(`
      id, project_name, project_location, budget, status,
      required_by, notes, created_at,
      user:users(first_name, last_name, email, company_name)
    `)
    .in('status', ['accepted', 'converted_to_order', 'quoted'])
    .order('created_at', { ascending: false })
  return data ?? []
}

const STATUS_COLOURS: Record<string, string> = {
  quoted:             'status-form-sent',
  accepted:           'status-approved',
  converted_to_order: 'status-approved',
  rejected:           'status-declined',
}

export default async function AdminCommercialOrdersPage() {
  const orders = await getCommercialOrders()

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Commercial Orders</h1>
          <p className="admin-subtitle">
            Trade project orders — accepted and converted quotes
          </p>
        </div>
        <Link href="/admin/quotes" className="btn btn-secondary btn-sm">
          View Quote Pipeline →
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Active Projects',   value: orders.filter((o: Record<string, unknown>) => o.status === 'accepted').length, colour: '#155724' },
          { label: 'Orders Placed',     value: orders.filter((o: Record<string, unknown>) => o.status === 'converted_to_order').length, colour: 'var(--caramel)' },
          { label: 'Quoted (pending)',  value: orders.filter((o: Record<string, unknown>) => o.status === 'quoted').length, colour: '#004085' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value" style={{ color: s.colour }}>{s.value}</div>
          </div>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="7" width="20" height="14"/>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
          </svg>
          <h3>No commercial orders yet</h3>
          <p>Accepted and converted trade quotes will appear here.</p>
          <Link href="/admin/quotes" className="btn btn-secondary btn-sm" style={{ marginTop: 24 }}>
            Review Quote Pipeline
          </Link>
        </div>
      ) : (
        <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Location</th>
                <th>Budget</th>
                <th>Required By</th>
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
                      <div style={{ fontWeight: 500, fontFamily: 'var(--font-serif)', fontSize: 15 }}>
                        {o.project_name as string ?? 'Unnamed Project'}
                      </div>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      <div>{user?.first_name} {user?.last_name}</div>
                      <div style={{ color: 'var(--stone)', fontSize: 12 }}>{user?.email}</div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--stone)' }}>
                      {o.project_location as string ?? '—'}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {o.budget
                        ? `£${Number(o.budget).toLocaleString('en-GB', { minimumFractionDigits: 0 })}`
                        : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--stone)' }}>
                      {o.required_by
                        ? new Date(o.required_by as string).toLocaleDateString('en-GB')
                        : '—'}
                    </td>
                    <td>
                      <span className={`status-pill ${STATUS_COLOURS[o.status as string] ?? 'status-pending'}`}>
                        {(o.status as string).replace(/_/g, ' ')}
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
