'use client'

// Sprint 7 — operations hub: KPI cards, pipeline lanes,
// needs-attention list, workload & exception queues.
// Money figures appear only when the API says canSeeMoney
// (quote_price_edit) — otherwise they are masked to "—".

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { box, money } from '@/components/admin/commercial/ui'

interface Flag { type: string; refLabel: string | null; daysLate: number; detail: string }
interface OverviewOrder {
  id: string; orderNumber: string; status: string; lane: string
  clientCompany: string | null; clientName: string | null; currency: string
  daysInStage: number; flags: Flag[]
  poCount: number; poAwaitingAck: number; poAwaitingApproval: number
  deliveriesOpen: number; installationsOutstanding: number
  marginAtRiskUnresolved: number; allocationsMissingCost: number
  sellingTotal: number | null; supplierCommitted: number | null
  clientInvoiced: number | null; clientPaidConfirmed: number | null
  netExposure: number | null
}
interface Lane { lane: string; label: string; orders: OverviewOrder[] }
interface Overview {
  kpis: {
    liveOrders: number; flaggedOrders: number; posAwaitingAck: number
    posAwaitingApproval: number; deliveriesOpen: number
    marginAtRiskUnresolved: number; netExposure: number | null
  }
  lanes: Lane[]
  needsAttention: OverviewOrder[]
  canSeeMoney: boolean
  today: string
}
interface QueueItem { queue: string; label: string; href: string; ref: string }
interface Workload {
  totalOpenItems: number
  queues: { ownerId: string | null; ownerName: string; items: QueueItem[] }[]
}
interface CmException {
  id: string; reference: string; statusLabel: string; product: string | null
  materialType: string | null; quantity: number
  proformaId: string | null; quoteNumber: string | null
  orderId: string | null; orderNumber: string | null
}

const VISIBLE_LANES = ['accepted', 'procurement', 'production', 'dispatch', 'delivered', 'installed', 'closed']

export function OperationsHub() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [workload, setWorkload] = useState<Workload | null>(null)
  const [cmExceptions, setCmExceptions] = useState<CmException[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/operations/overview').then(r => r.json())
      .then(res => res.success ? setOverview(res.data) : setError(res.error ?? 'Failed to load'))
      .catch(() => setError('Network error'))
    fetch('/api/admin/operations/exceptions').then(r => r.json())
      .then(j => { if (j.success) setCmExceptions(j.data.customMatch ?? []) }).catch(() => {})
    fetch('/api/admin/operations/workload').then(r => r.json())
      .then(res => { if (res.success) setWorkload(res.data) })
      .catch(() => {})
  }, [])

  if (error) return <div style={{ padding: 60, textAlign: 'center', color: '#a03030' }}>{error}</div>
  if (!overview) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--stone)' }}>Loading operations…</div>

  const { kpis, canSeeMoney } = overview
  const kpiCards: { label: string; value: string | number; tone?: string }[] = [
    { label: 'Live orders', value: kpis.liveOrders },
    { label: 'Needs attention', value: kpis.flaggedOrders, tone: kpis.flaggedOrders > 0 ? '#a03030' : undefined },
    { label: 'POs awaiting ack', value: kpis.posAwaitingAck },
    { label: 'POs awaiting approval', value: kpis.posAwaitingApproval },
    { label: 'Open deliveries', value: kpis.deliveriesOpen },
    { label: 'Margin at risk (unresolved)', value: kpis.marginAtRiskUnresolved, tone: kpis.marginAtRiskUnresolved > 0 ? '#a03030' : undefined },
    ...(canSeeMoney ? [{ label: 'Net cash exposure', value: money(kpis.netExposure, 'GBP'), tone: (kpis.netExposure ?? 0) > 0 ? '#8a6d1a' : undefined }] : []),
  ]

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Operations</h1>
          <p className="admin-subtitle">Where every order is, what&rsquo;s late, what&rsquo;s at risk — and whether the money works.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/operations/suppliers" className="btn btn-secondary btn-sm">Supplier progress</Link>
          {canSeeMoney && <Link href="/admin/operations/money" className="btn btn-secondary btn-sm">Exposure &amp; profitability</Link>}
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))`, gap: 12, marginBottom: 20 }}>
        {kpiCards.map(k => (
          <div key={k.label} style={{ ...box, marginBottom: 0, padding: '16px 18px' }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: k.tone ?? 'var(--forest)' }}>{k.value}</div>
            <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--stone)', marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Needs attention */}
      {overview.needsAttention.length > 0 && (
        <div style={{ ...box, borderLeft: '3px solid #a03030' }}>
          <div className="label" style={{ marginBottom: 10 }}>Needs attention</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {overview.needsAttention.map(o => (
              <div key={o.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 12.5, padding: '8px 10px', border: '1px solid var(--light-line)' }}>
                <Link href={`/admin/commercial-orders/${o.id}/procurement`} style={{ color: 'var(--forest)', fontWeight: 600, minWidth: 150 }}>
                  {o.orderNumber}
                </Link>
                <span style={{ color: 'var(--stone)', minWidth: 140 }}>{o.clientCompany ?? o.clientName ?? '—'}</span>
                <div style={{ flex: 1, color: '#a03030' }}>
                  {o.flags.map((f, i) => <div key={i}>⚑ {f.detail}{f.refLabel ? ` (${f.refLabel})` : ''} — {f.daysLate}d</div>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline board */}
      <div style={{ ...box, overflowX: 'auto' }}>
        <div className="label" style={{ marginBottom: 12 }}>Pipeline</div>
        <div style={{ display: 'flex', gap: 12, minWidth: 900, alignItems: 'flex-start' }}>
          {overview.lanes.filter(l => VISIBLE_LANES.includes(l.lane)).map(lane => (
            <div key={lane.lane} style={{ flex: '1 1 0', minWidth: 130 }}>
              <div style={{
                fontSize: 10.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--stone)', paddingBottom: 6, borderBottom: '2px solid var(--forest)', marginBottom: 8,
              }}>
                {lane.label} <span style={{ color: 'var(--forest)' }}>({lane.orders.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {lane.orders.map(o => (
                  <Link key={o.id} href={`/admin/commercial-orders/${o.id}/procurement`} style={{ textDecoration: 'none' }}>
                    <div style={{
                      border: `1px solid ${o.flags.length > 0 ? '#a03030' : 'var(--light-line)'}`,
                      background: 'var(--warm-white)', padding: '8px 10px', fontSize: 11.5,
                    }}>
                      <div style={{ fontWeight: 600, color: 'var(--forest)' }}>{o.orderNumber}</div>
                      <div style={{ color: 'var(--stone)', margin: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.clientCompany ?? o.clientName ?? '—'}
                      </div>
                      <div style={{ color: 'var(--stone)' }}>
                        {canSeeMoney && o.sellingTotal != null ? <>{money(o.sellingTotal, o.currency)} · </> : null}
                        {o.daysInStage}d in stage
                        {o.flags.length > 0 && <span style={{ color: '#a03030' }}> · ⚑{o.flags.length}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
                {lane.orders.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--stone)', opacity: 0.6, padding: '6px 0' }}>—</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sprint 14 — unresolved Custom Match requests (md doc §12.5) */}
      {cmExceptions.length > 0 && (
        <div style={box}>
          <div className="label" style={{ marginBottom: 12 }}>
            Custom Match — unresolved ({cmExceptions.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cmExceptions.map(cm => (
              <div key={cm.id} style={{ fontSize: 12.5, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Link href={`/admin/custom-match/${cm.id}`} style={{ color: 'var(--forest)', fontWeight: 600 }}>{cm.reference}</Link>
                <span className="status-pill">{cm.statusLabel}</span>
                <span style={{ color: 'var(--stone)' }}>
                  {[cm.product, cm.materialType, `qty ${cm.quantity}`].filter(Boolean).join(' · ')}
                </span>
                {cm.proformaId && (
                  <Link href={`/admin/quotes/${cm.proformaId}`} style={{ color: 'var(--forest)' }}>{cm.quoteNumber ?? 'quote'}</Link>
                )}
                {cm.orderId && (
                  <Link href={`/admin/commercial-orders/${cm.orderId}/procurement`} style={{ color: 'var(--forest)' }}>{cm.orderNumber ?? 'order'}</Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workload & exceptions */}
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="label">Workload &amp; open items{workload ? ` (${workload.totalOpenItems})` : ''}</div>
          <a href="/api/admin/operations/exceptions?format=csv" className="btn btn-secondary btn-sm">Exception report CSV</a>
        </div>
        {!workload ? (
          <p style={{ fontSize: 12.5, color: 'var(--stone)' }}>Loading queues…</p>
        ) : workload.totalOpenItems === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--stone)' }}>Nothing outstanding — every queue is clear.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {workload.queues.map(q => (
              <div key={q.ownerId ?? 'unassigned'} style={{ border: '1px solid var(--light-line)', padding: '12px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--forest)', marginBottom: 8 }}>
                  {q.ownerName} <span style={{ color: 'var(--stone)', fontWeight: 400 }}>· {q.items.length} item{q.items.length !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {q.items.slice(0, 12).map((item, i) => (
                    <Link key={i} href={item.href} style={{ fontSize: 11.5, color: 'var(--stone)', textDecoration: 'none' }}>
                      <span style={{ color: 'var(--forest)' }}>{item.ref}</span> — {item.label}
                    </Link>
                  ))}
                  {q.items.length > 12 && (
                    <span style={{ fontSize: 11, color: 'var(--stone)' }}>… and {q.items.length - 12} more</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
