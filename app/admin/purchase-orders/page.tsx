import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'

export const metadata = { title: 'Purchase Orders' }
export const dynamic = 'force-dynamic'

async function getPos() {
  const { data } = await supabaseAdmin
    .from('purchase_orders')
    .select('id, purchase_order_number, revision_number, status, approval_status, margin_at_risk, supplier_currency, grand_total, required_by_date, issued_at, acknowledged_at, manufacturer:artisans(name), commercial_order:commercial_orders(id, order_number)')
    .order('created_at', { ascending: false })
  return data ?? []
}

function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }

export default async function PurchaseOrdersPage() {
  const pos = await getPos()
  const awaitingApproval = pos.filter((p: Record<string, unknown>) => p.approval_status === 'required' || p.status === 'pending_approval')
  const awaitingAck = pos.filter((p: Record<string, unknown>) => ['issued', 'viewed'].includes(p.status as string))
  const atRisk = pos.filter((p: Record<string, unknown>) => p.margin_at_risk)

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Purchase Orders</h1>
          <p className="admin-subtitle">Manufacturer purchase orders — supplier costs only, never client pricing</p>
        </div>
        <Link href="/admin/commercial-orders" className="btn btn-secondary btn-sm">Commercial Orders →</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'All POs', value: pos.length, colour: 'var(--forest)' },
          { label: 'Awaiting Approval', value: awaitingApproval.length, colour: '#8a6d1a' },
          { label: 'Awaiting Acknowledgement', value: awaitingAck.length, colour: '#004085' },
          { label: 'Margin At Risk', value: atRisk.length, colour: '#a03030' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value" style={{ color: s.colour }}>{s.value}</div>
          </div>
        ))}
      </div>

      {pos.length === 0 ? (
        <div className="empty-state" style={{ padding: 48, textAlign: 'center', color: 'var(--stone)' }}>
          <p>No purchase orders yet. Generate them from a commercial order’s procurement screen.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>PO</th><th>Manufacturer</th><th>Order</th><th>Status</th><th>Approval</th><th>Total</th><th>Required by</th><th>Acknowledged</th></tr>
          </thead>
          <tbody>
            {pos.map((p: Record<string, unknown>) => (
              <tr key={p.id as string}>
                <td>
                  <Link href={`/admin/purchase-orders/${p.id}`} style={{ color: 'var(--forest)', fontWeight: 500 }}>
                    {p.purchase_order_number as string}{Number(p.revision_number) > 1 ? `-R${String(p.revision_number).padStart(2, '0')}` : ''}
                  </Link>
                  {p.margin_at_risk ? <strong style={{ color: '#a03030' }}> ⚠</strong> : null}
                </td>
                <td>{((p.manufacturer ?? {}) as Record<string, unknown>).name as string ?? '—'}</td>
                <td style={{ fontSize: 12 }}>
                  <Link href={`/admin/commercial-orders/${((p.commercial_order ?? {}) as Record<string, unknown>).id}/procurement`} style={{ color: 'var(--stone)' }}>
                    {((p.commercial_order ?? {}) as Record<string, unknown>).order_number as string ?? '—'}
                  </Link>
                </td>
                <td><span className="status-pill">{(p.status as string).replace(/_/g, ' ')}</span></td>
                <td style={{ fontSize: 12 }}>{(p.approval_status as string) === 'none' ? '—' : (p.approval_status as string)}</td>
                <td>{p.grand_total == null ? '—' : `${sym((p.supplier_currency as string) ?? 'GBP')}${Number(p.grand_total).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`}</td>
                <td style={{ fontSize: 12, color: 'var(--stone)' }}>{p.required_by_date ? new Date(p.required_by_date as string).toLocaleDateString('en-GB') : '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--stone)' }}>{p.acknowledged_at ? new Date(p.acknowledged_at as string).toLocaleDateString('en-GB') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
