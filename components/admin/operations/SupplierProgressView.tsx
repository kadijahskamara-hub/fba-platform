'use client'

// Sprint 7 — per-maker supplier-order progress + lead-time stats.
// Lead-time averages appear only with ≥3 complete data points
// (expected vs actual) — never fabricated. CSS bars, no chart lib.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { box, td, th, money } from '@/components/admin/commercial/ui'

interface LeadTime { count: number; avgVarianceDays: number; maxVarianceDays: number; onTimeRate: number }
interface MakerBlock {
  manufacturerId: string | null
  manufacturerName: string | null
  openPos: Record<string, unknown>[]
  leadTime: LeadTime | null
}

export function SupplierProgressView() {
  const [makers, setMakers] = useState<MakerBlock[] | null>(null)
  const [canSeeMoney, setCanSeeMoney] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/operations/supplier-progress').then(r => r.json())
      .then(res => {
        if (res.success) { setMakers(res.data.makers); setCanSeeMoney(res.data.canSeeMoney) }
        else setError(res.error ?? 'Failed to load')
      })
      .catch(() => setError('Network error'))
  }, [])

  if (error) return <div style={{ padding: 60, textAlign: 'center', color: '#a03030' }}>{error}</div>
  if (!makers) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--stone)' }}>Loading supplier progress…</div>

  const fmt = (d: unknown) => d ? new Date(String(d)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'
  const activeMakers = makers.filter(m => m.openPos.length > 0 || m.leadTime)

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Supplier progress</h1>
          <p className="admin-subtitle">Open purchase orders and lead-time performance per maker.</p>
        </div>
        <Link href="/admin/operations" className="btn btn-ghost btn-sm">← Operations</Link>
      </div>

      {activeMakers.length === 0 && (
        <div style={box}><p style={{ fontSize: 13, color: 'var(--stone)' }}>No open purchase orders and no lead-time history yet.</p></div>
      )}

      {activeMakers.map(m => (
        <div key={m.manufacturerId ?? 'unassigned'} style={box}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 300, color: 'var(--forest)', margin: 0 }}>
              {m.manufacturerName ?? 'Unassigned'}
            </h2>
            <span style={{ fontSize: 12, color: 'var(--stone)' }}>{m.openPos.length} open PO{m.openPos.length !== 1 ? 's' : ''}</span>
            {m.leadTime ? (
              <span style={{ fontSize: 12, color: m.leadTime.avgVarianceDays > 0 ? '#8a6d1a' : '#155724' }}>
                lead time {m.leadTime.avgVarianceDays > 0 ? `+${m.leadTime.avgVarianceDays}` : m.leadTime.avgVarianceDays}d avg vs promise
                {' · '}{Math.round(m.leadTime.onTimeRate * 100)}% on time ({m.leadTime.count} completed)
              </span>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--stone)', opacity: 0.7 }}>
                lead-time stats need ≥3 completed POs
              </span>
            )}
          </div>

          {/* On-time CSS bar */}
          {m.leadTime && (
            <div style={{ height: 6, background: 'var(--light-line)', marginBottom: 14, maxWidth: 320 }}>
              <div style={{ height: 6, width: `${Math.round(m.leadTime.onTimeRate * 100)}%`, background: m.leadTime.onTimeRate >= 0.8 ? '#155724' : '#8a6d1a' }} />
            </div>
          )}

          {m.openPos.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead><tr>
                  <th style={th}>PO</th><th style={th}>Order</th><th style={th}>Status</th>
                  <th style={th}>Ack due</th><th style={th}>Acknowledged</th>
                  <th style={th}>Expected completion</th><th style={th}>Value</th><th style={th}>Revisions</th>
                </tr></thead>
                <tbody>
                  {m.openPos.map(po => {
                    const ackOutstanding = ['issued', 'viewed'].includes(po.status as string) && !po.acknowledged_at
                    return (
                      <tr key={po.id as string}>
                        <td style={td}>
                          <Link href={`/admin/purchase-orders/${po.id}`} style={{ color: 'var(--forest)', fontWeight: 500 }}>
                            {po.purchase_order_number as string}
                          </Link>
                          {po.margin_at_risk && !po.margin_resolution ? <div style={{ color: '#a03030', fontSize: 10.5, fontWeight: 600 }}>MARGIN AT RISK</div> : null}
                        </td>
                        <td style={td}>{po.order_number as string}</td>
                        <td style={td}><span className="status-pill" style={{ fontSize: 10 }}>{(po.status as string).replace(/_/g, ' ')}</span></td>
                        <td style={{ ...td, color: ackOutstanding ? '#a03030' : undefined, fontWeight: ackOutstanding ? 600 : undefined }}>
                          {fmt(po.acknowledgement_due_date)}{ackOutstanding ? ' ⚑' : ''}
                        </td>
                        <td style={td}>{fmt(po.acknowledged_at)}</td>
                        <td style={td}>{fmt(po.expected_completion_date)}</td>
                        <td style={td}>{canSeeMoney ? money(po.grand_total == null ? null : Number(po.grand_total), (po.supplier_currency as string) ?? 'GBP') : '—'}</td>
                        <td style={td}>{Number(po.revision_churn ?? 0) > 0 ? `${po.revision_churn} revision(s)` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </>
  )
}
