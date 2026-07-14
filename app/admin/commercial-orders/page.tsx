import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'

export const metadata = { title: 'Commercial Orders' }
export const dynamic = 'force-dynamic'

// Sprint 2: commercial orders are now real sales-order records created
// by explicit conversion from issued quotes/pro formas (the previous
// page listed filtered quote requests).
async function getOrders() {
  const { data } = await supabaseAdmin
    .from('commercial_orders')
    .select(`
      id, order_number, status, currency, source_quote_number, source_revision_number,
      accepted_at, created_at, client_snapshot, project_snapshot,
      pos:purchase_orders(id, purchase_order_number, status, margin_at_risk)
    `)
    .order('created_at', { ascending: false })
  return data ?? []
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', pending_acceptance: 'Pending acceptance', accepted: 'Accepted',
  procurement_ready: 'Procurement ready', partially_ordered: 'Partially ordered',
  fully_ordered: 'Fully ordered', in_progress: 'In progress',
  partially_delivered: 'Partially delivered', completed: 'Completed', cancelled: 'Cancelled',
}

export default async function CommercialOrdersPage() {
  const orders = await getOrders()

  const active = orders.filter((o: Record<string, unknown>) => !['completed', 'cancelled'].includes(o.status as string))
  const atRisk = orders.filter((o: Record<string, unknown>) =>
    ((o.pos as Array<{ margin_at_risk: boolean }>) ?? []).some(p => p.margin_at_risk))

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Commercial Orders</h1>
          <p className="admin-subtitle">
            Sales orders converted from issued quotes — procurement &amp; manufacturer purchase orders
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/purchase-orders" className="btn btn-secondary btn-sm">Purchase Orders →</Link>
          <Link href="/admin/quotes" className="btn btn-ghost btn-sm">Quote Pipeline →</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Active Orders', value: active.length, colour: '#155724' },
          { label: 'Margin At Risk', value: atRisk.length, colour: '#a03030' },
          { label: 'All Orders', value: orders.length, colour: 'var(--caramel)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value" style={{ color: s.colour }}>{s.value}</div>
          </div>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="empty-state" style={{ padding: 48, textAlign: 'center', color: 'var(--stone)' }}>
          <p style={{ marginBottom: 8 }}>No commercial orders yet.</p>
          <p style={{ fontSize: 13 }}>
            Issue a quote or pro forma in the <Link href="/admin/quotes" style={{ color: 'var(--forest)' }}>Quote Pipeline</Link>,
            then use “Convert to commercial order” to begin procurement.
          </p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Order</th><th>Client</th><th>Project</th><th>Source</th>
              <th>Status</th><th>Purchase Orders</th><th>Accepted</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o: Record<string, unknown>) => {
              const client = (o.client_snapshot ?? {}) as Record<string, unknown>
              const project = (o.project_snapshot ?? {}) as Record<string, unknown>
              const pos = (o.pos ?? []) as Array<Record<string, unknown>>
              return (
                <tr key={o.id as string}>
                  <td>
                    <Link href={`/admin/commercial-orders/${o.id}/procurement`} style={{ color: 'var(--forest)', fontWeight: 500 }}>
                      {o.order_number as string}
                    </Link>
                    <div style={{ fontSize: 11 }}>
                      <Link href={`/admin/commercial-orders/${o.id}/deliveries`} style={{ color: 'var(--stone)' }}>deliveries →</Link>
                    </div>
                  </td>
                  <td>{(client.client_company as string) || (client.client_name as string) || '—'}</td>
                  <td style={{ fontSize: 13, color: 'var(--stone)' }}>{(project.project_name as string) || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--stone)' }}>{o.source_quote_number as string} · R{String(o.source_revision_number).padStart(2, '0')}</td>
                  <td><span className="status-pill">{STATUS_LABEL[o.status as string] ?? (o.status as string)}</span></td>
                  <td style={{ fontSize: 12 }}>
                    {pos.length === 0 ? <span style={{ color: 'var(--stone)' }}>none</span> : pos.map(p => (
                      <span key={p.id as string} style={{ marginRight: 8 }}>
                        {p.purchase_order_number as string}
                        {p.margin_at_risk ? <strong style={{ color: '#a03030' }}> ⚠</strong> : null}
                      </span>
                    ))}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--stone)' }}>{o.accepted_at ? new Date(o.accepted_at as string).toLocaleDateString('en-GB') : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}
