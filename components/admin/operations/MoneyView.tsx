'use client'

// Sprint 7 — exposure & profitability (PRICE-LEVEL data).
// The page gate + both APIs require quote_price_edit; this view
// is never rendered for staff without that permission.
// Cost-unavailable lines are flagged, never guessed.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { box, td, th, money } from '@/components/admin/commercial/ui'

interface ExposureOrder {
  id: string; orderNumber: string; status: string; currency: string
  clientCompany: string | null
  clientInvoiced: number; clientPaidConfirmed: number
  supplierCommitted: number; supplierUncommitted: number
  netExposure: number; exposurePct: number | null; breachesThreshold: boolean
}
interface Portfolio {
  clientInvoiced: number; clientPaidConfirmed: number
  supplierCommitted: number; supplierUncommitted: number
  netExposure: number; breaches: number; alertPercent: number
}
interface ProfitOrder {
  id: string; orderNumber: string; status: string; currency: string
  clientCompany: string | null; settled: boolean; sellingKnown: boolean
  revenue: number | null; knownCosts: number; costUnavailableCount: number
  projectedMargin: number | null; marginPct: number | null
}

export function MoneyView() {
  const [exposure, setExposure] = useState<{ orders: ExposureOrder[]; portfolio: Portfolio } | null>(null)
  const [profit, setProfit] = useState<ProfitOrder[] | null>(null)
  const [sortDesc, setSortDesc] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/operations/exposure').then(r => r.json())
      .then(res => res.success ? setExposure(res.data) : setError(res.error ?? 'Failed to load'))
      .catch(() => setError('Network error'))
    fetch('/api/admin/operations/profitability').then(r => r.json())
      .then(res => { if (res.success) setProfit(res.data.orders) })
      .catch(() => {})
  }, [])

  if (error) return <div style={{ padding: 60, textAlign: 'center', color: '#a03030' }}>{error}</div>
  if (!exposure) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--stone)' }}>Loading money view…</div>

  const p = exposure.portfolio
  const sortedProfit = profit
    ? [...profit].sort((a, b) => {
        const av = a.marginPct ?? -Infinity
        const bv = b.marginPct ?? -Infinity
        return sortDesc ? bv - av : av - bv
      })
    : null

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Exposure &amp; profitability</h1>
          <p className="admin-subtitle">Client money vs supplier commitments, and projected margin per order. Internal figures — price-level permission required.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/operations" className="btn btn-ghost btn-sm">← Operations</Link>
          <a href="/api/admin/operations/exposure?format=csv" className="btn btn-secondary btn-sm">Exposure CSV</a>
          <a href="/api/admin/operations/profitability?format=csv" className="btn btn-secondary btn-sm">Profitability CSV</a>
        </div>
      </div>

      {/* Portfolio cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Client invoiced', value: money(p.clientInvoiced, 'GBP') },
          { label: 'Client paid (confirmed)', value: money(p.clientPaidConfirmed, 'GBP') },
          { label: 'Supplier committed', value: money(p.supplierCommitted, 'GBP') },
          { label: 'Still to commit', value: money(p.supplierUncommitted, 'GBP') },
          { label: 'Net cash exposure', value: money(p.netExposure, 'GBP'), tone: p.netExposure > 0 ? '#8a6d1a' : undefined },
          { label: `Breaching ${p.alertPercent}% threshold`, value: p.breaches, tone: p.breaches > 0 ? '#a03030' : undefined },
        ].map(k => (
          <div key={k.label} style={{ ...box, marginBottom: 0, padding: '16px 18px' }}>
            <div style={{ fontSize: 19, fontWeight: 600, color: (k as { tone?: string }).tone ?? 'var(--forest)' }}>{k.value}</div>
            <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--stone)', marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Exposure table */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 10 }}>Exposure by order (supplier commitments not covered by confirmed client money)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead><tr>
              <th style={th}>Order</th><th style={th}>Client</th><th style={th}>Status</th>
              <th style={th}>Invoiced</th><th style={th}>Paid (confirmed)</th>
              <th style={th}>Committed</th><th style={th}>Still to commit</th>
              <th style={th}>Net exposure</th><th style={th}>Exposure %</th>
            </tr></thead>
            <tbody>
              {exposure.orders.map(o => (
                <tr key={o.id} style={o.breachesThreshold ? { background: 'rgba(176,58,46,0.05)' } : undefined}>
                  <td style={td}>
                    <Link href={`/admin/commercial-orders/${o.id}/procurement`} style={{ color: 'var(--forest)', fontWeight: 500 }}>
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td style={td}>{o.clientCompany ?? '—'}</td>
                  <td style={td}><span className="status-pill" style={{ fontSize: 10 }}>{o.status.replace(/_/g, ' ')}</span></td>
                  <td style={td}>{money(o.clientInvoiced, o.currency)}</td>
                  <td style={td}>{money(o.clientPaidConfirmed, o.currency)}</td>
                  <td style={td}>{money(o.supplierCommitted, o.currency)}</td>
                  <td style={td}>{money(o.supplierUncommitted, o.currency)}</td>
                  <td style={{ ...td, fontWeight: o.netExposure > 0 ? 600 : 400, color: o.netExposure > 0 ? '#8a6d1a' : undefined }}>
                    {money(o.netExposure, o.currency)}
                  </td>
                  <td style={{ ...td, color: o.breachesThreshold ? '#a03030' : undefined, fontWeight: o.breachesThreshold ? 600 : 400 }}>
                    {o.exposurePct != null ? `${o.exposurePct}%` : '—'}{o.breachesThreshold ? ' ⚑' : ''}
                  </td>
                </tr>
              ))}
              {exposure.orders.length === 0 && (
                <tr><td style={td} colSpan={9}><span style={{ color: 'var(--stone)' }}>No live orders.</span></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Profitability table */}
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="label">Project profitability (client net selling + fee − supplier costs)</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setSortDesc(s => !s)}>
            Sort by margin % {sortDesc ? '▼' : '▲'}
          </button>
        </div>
        {!sortedProfit ? (
          <p style={{ fontSize: 12.5, color: 'var(--stone)' }}>Loading profitability…</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead><tr>
                <th style={th}>Order</th><th style={th}>Client</th><th style={th}>Status</th>
                <th style={th}>Revenue (net + fee)</th><th style={th}>Known costs</th>
                <th style={th}>Margin</th><th style={th}>Margin %</th><th style={th}>Notes</th>
              </tr></thead>
              <tbody>
                {sortedProfit.map(o => (
                  <tr key={o.id}>
                    <td style={td}>
                      <Link href={`/admin/commercial-orders/${o.id}/procurement`} style={{ color: 'var(--forest)', fontWeight: 500 }}>
                        {o.orderNumber}
                      </Link>
                      {o.settled && <div style={{ fontSize: 10, color: '#155724', fontWeight: 600 }}>SETTLED</div>}
                    </td>
                    <td style={td}>{o.clientCompany ?? '—'}</td>
                    <td style={td}><span className="status-pill" style={{ fontSize: 10 }}>{o.status.replace(/_/g, ' ')}</span></td>
                    <td style={td}>{o.revenue != null ? money(o.revenue, o.currency) : <span style={{ color: 'var(--stone)' }}>unknown</span>}</td>
                    <td style={td}>{money(o.knownCosts, o.currency)}</td>
                    <td style={{ ...td, color: (o.projectedMargin ?? 0) < 0 ? '#a03030' : undefined }}>
                      {o.projectedMargin != null ? money(o.projectedMargin, o.currency) : <span style={{ color: '#8a6d1a' }}>incomplete costs</span>}
                    </td>
                    <td style={td}>
                      {o.marginPct != null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600, color: o.marginPct < 0 ? '#a03030' : 'var(--forest)', minWidth: 44 }}>{o.marginPct}%</span>
                          <div style={{ height: 5, width: 70, background: 'var(--light-line)' }}>
                            <div style={{
                              height: 5,
                              width: `${Math.min(100, Math.max(0, o.marginPct))}%`,
                              background: o.marginPct >= 25 ? '#155724' : o.marginPct >= 10 ? '#8a6d1a' : '#a03030',
                            }} />
                          </div>
                        </div>
                      ) : '—'}
                    </td>
                    <td style={{ ...td, fontSize: 11.5, color: 'var(--stone)' }}>
                      {o.costUnavailableCount > 0 ? `${o.costUnavailableCount} line(s) cost-unavailable — never guessed` : ''}
                      {!o.sellingKnown ? 'Selling total not on order snapshot' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
