'use client'

// Commercial-order procurement screen (Sprint 2).
// Shows source lines with eligibility & readiness, manufacturer
// allocation, supplier cost entry, and per-manufacturer draft-PO
// generation. Supplier costs here are internal procurement data —
// they never flow into client documents.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { box, inp, td, th, money } from '@/components/admin/commercial/ui'
import { MilestoneTimeline } from '@/components/admin/operations/MilestoneTimeline'
import OrderBillingPanel from '@/components/admin/commercial/OrderBillingPanel'
import { UltraDeleteRecordButton } from '@/components/UltraDeleteRecordButton'

interface ProcLine {
  line: Record<string, unknown>
  eligible: boolean
  readiness: { ready: boolean; problems: string[] }
  allocations: Array<Record<string, unknown>>
}
interface ProcState {
  order: Record<string, unknown>
  lines: ProcLine[]
  allocations: Array<Record<string, unknown>>
  purchaseOrders: Array<Record<string, unknown>>
}

export default function ProcurementPage() {
  const { id } = useParams<{ id: string }>()
  const [state, setState] = useState<ProcState | null>(null)
  const [perms, setPerms] = useState<{ canPrepare: boolean; canApprove: boolean; isUltraAdmin: boolean } | null>(null)
  const [artisans, setArtisans] = useState<{ id: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/commercial-orders/${id}`).then(r => r.json())
    if (res.success) { setState(res.data); setPerms(res.permissions) }
    setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])
  useEffect(() => { fetch('/api/admin/artisans').then(r => r.json()).then(d => setArtisans(d.data ?? [])) }, [])

  const api = async (url: string, method: string, bodyObj?: Record<string, unknown>) => {
    setBusy(true)
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: bodyObj ? JSON.stringify(bodyObj) : undefined,
    }).then(r => r.json())
    setBusy(false)
    if (!res.success) alert(res.error ?? 'Action failed')
    await load()
    return res
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--stone)' }}>Loading…</div>
  if (!state || !perms) return <div style={{ padding: 60, textAlign: 'center' }}>Order not found. <Link href="/admin/commercial-orders">Back</Link></div>

  const order = state.order
  const source = (order.source ?? {}) as Record<string, unknown>
  const client = (order.client_snapshot ?? {}) as Record<string, unknown>
  const project = (order.project_snapshot ?? {}) as Record<string, unknown>
  const cur = (order.currency as string) ?? 'GBP'
  const ro = !perms.canPrepare

  // Manufacturers with open (not yet in-PO) ready allocations.
  const openByManufacturer = new Map<string, { name: string; count: number; total: number; missing: number }>()
  for (const a of state.allocations) {
    if (!['allocated', 'ready_for_po'].includes(a.allocation_status as string)) continue
    const m = (a.manufacturer ?? {}) as Record<string, unknown>
    const key = a.manufacturer_id as string
    if (!openByManufacturer.has(key)) openByManufacturer.set(key, { name: (m.name as string) ?? '—', count: 0, total: 0, missing: 0 })
    const g = openByManufacturer.get(key)!
    g.count += 1
    if (a.supplier_cost_total == null || !a.supplier_currency) g.missing += 1
    else g.total += Number(a.supplier_cost_total)
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href="/admin/commercial-orders" className="btn btn-ghost btn-sm">← Orders</Link>
            <h1 className="admin-title" style={{ margin: 0 }}>{order.order_number as string}</h1>
            <span className="status-pill">{(order.status as string).replace(/_/g, ' ')}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--stone)', marginTop: 6 }}>
            {(client.client_company as string) || (client.client_name as string) || '—'}
            {project.project_name ? <> · {project.project_name as string}</> : null}
            {' · '}Source {source.quote_number as string ?? source.proforma_number as string} R{String(order.source_revision_number).padStart(2, '0')}
            {' · '}<Link href={`/admin/quotes/${source.id}`} style={{ color: 'var(--forest)' }}>open source record</Link>
            {' · '}<Link href={`/admin/commercial-orders/${id}/deliveries`} style={{ color: 'var(--forest)' }}>deliveries</Link>
          </div>
        </div>
        {/* Sprint 7.1 — Ultra-only: delete this order + everything under it */}
        <UltraDeleteRecordButton
          entity="commercial_order"
          recordId={id}
          label={`${order.order_number} — deletes its POs, invoices, payments, deliveries and documents`}
          redirectTo="/admin/commercial-orders"
        />
      </div>

      {/* Sprint 7 — derived milestone timeline + delay flags + readiness */}
      <MilestoneTimeline orderId={id} />

      {/* Sprint 8 — invoices + payments for this order (QA items 1 & 2) */}
      <OrderBillingPanel orderId={id} />

      {/* Product lines & allocation */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 12 }}>Procurement lines</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead><tr>
              <th style={th}>Line</th><th style={th}>Qty</th><th style={th}>Manufacturer</th>
              <th style={th}>Supplier cost</th><th style={th}>Currency</th>
              <th style={th}>Allocation</th><th style={th}>PO</th><th style={{ ...th, width: 200 }}>Readiness</th>
            </tr></thead>
            <tbody>
              {state.lines.map(({ line, eligible, readiness, allocations }) => {
                const alloc = allocations[0] ?? null
                const allocPoLine = alloc ? ((alloc.po_lines ?? []) as Array<Record<string, unknown>>)[0] : null
                const manufacturer = (line.manufacturer ?? {}) as Record<string, unknown>
                return (
                  <tr key={line.id as string} style={!eligible ? { opacity: 0.55 } : undefined}>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{line.name as string}</div>
                      <div style={{ fontSize: 11, color: 'var(--stone)' }}>{(line.line_type as string).toUpperCase()}{line.section ? ` · ${line.section}` : ''}</div>
                    </td>
                    <td style={td}>{Number(line.quantity)}</td>
                    <td style={td}>
                      {!eligible ? <span style={{ fontSize: 12, color: 'var(--stone)' }}>n/a</span> : alloc ? (
                        <span>{((alloc.manufacturer ?? {}) as Record<string, unknown>).name as string}</span>
                      ) : (
                        <select style={{ ...inp, minWidth: 150 }} disabled={ro || busy} defaultValue={(line.manufacturer_id as string) ?? ''}
                          onChange={e => {
                            if (!e.target.value) return
                            api(`/api/admin/commercial-orders/${id}/allocations`, 'POST', {
                              sourceLineItemId: line.id, manufacturerId: e.target.value,
                            })
                          }}>
                          <option value="">— allocate to —</option>
                          {artisans.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td style={td}>
                      {alloc ? (
                        <input style={{ ...inp, width: 110 }} type="number" step="0.01" disabled={ro || busy || Boolean(allocPoLine)}
                          defaultValue={alloc.supplier_cost_unit == null ? '' : Number(alloc.supplier_cost_unit)}
                          placeholder="cost unavailable"
                          onBlur={e => {
                            const v = e.target.value === '' ? null : parseFloat(e.target.value)
                            if (v !== (alloc.supplier_cost_unit == null ? null : Number(alloc.supplier_cost_unit))) {
                              api(`/api/admin/commercial-orders/${id}/allocations/${alloc.id}`, 'PATCH', { supplierCostUnit: v })
                            }
                          }} />
                      ) : (
                        <span style={{ fontSize: 12, color: line.supplier_cost_source === 'unavailable' ? '#a03030' : 'inherit' }}>
                          {line.supplier_cost_source === 'unavailable' ? 'unavailable' : money(line.supplier_cost_unit == null ? null : Number(line.supplier_cost_unit), cur)}
                        </span>
                      )}
                    </td>
                    <td style={td}>
                      {alloc ? (
                        <input style={{ ...inp, width: 60 }} maxLength={3} disabled={ro || busy || Boolean(allocPoLine)}
                          defaultValue={(alloc.supplier_currency as string) ?? ''}
                          onBlur={e => {
                            if (e.target.value !== ((alloc.supplier_currency as string) ?? '')) {
                              api(`/api/admin/commercial-orders/${id}/allocations/${alloc.id}`, 'PATCH', { supplierCurrency: e.target.value || null })
                            }
                          }} />
                      ) : <span style={{ fontSize: 12, color: 'var(--stone)' }}>{(manufacturer.default_currency as string) ?? '—'}</span>}
                    </td>
                    <td style={td}>
                      {alloc ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span className="status-pill" style={{ fontSize: 10 }}>{(alloc.allocation_status as string).replace(/_/g, ' ')}</span>
                          {!allocPoLine && !ro && (
                            <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} disabled={busy}
                              onClick={() => { if (confirm('Remove this allocation?')) api(`/api/admin/commercial-orders/${id}/allocations/${alloc.id}`, 'DELETE') }}>✕</button>
                          )}
                        </div>
                      ) : eligible ? <span style={{ fontSize: 12, color: 'var(--stone)' }}>unallocated</span> : '—'}
                    </td>
                    <td style={td}>
                      {allocPoLine ? (
                        <Link href={`/admin/purchase-orders/${allocPoLine.purchase_order_id}`} style={{ color: 'var(--forest)', fontSize: 12 }}>open PO</Link>
                      ) : '—'}
                    </td>
                    <td style={{ ...td, fontSize: 11.5 }}>
                      {eligible
                        ? (alloc
                          ? (alloc.supplier_cost_unit != null && alloc.supplier_currency
                            ? <span style={{ color: '#155724' }}>ready</span>
                            : <span style={{ color: '#a03030' }}>missing {alloc.supplier_cost_unit == null ? 'cost' : ''}{alloc.supplier_cost_unit == null && !alloc.supplier_currency ? ' + ' : ''}{!alloc.supplier_currency ? 'currency' : ''}</span>)
                          : readiness.problems.length > 0
                            ? <span style={{ color: '#8a6d1a' }}>{readiness.problems[0]}</span>
                            : <span style={{ color: '#155724' }}>ready to allocate</span>)
                        : <span style={{ color: 'var(--stone)' }}>excluded from procurement</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate POs per manufacturer */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 10 }}>Generate purchase orders</div>
        {openByManufacturer.size === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--stone)' }}>No open allocations. Allocate lines above; each manufacturer produces one purchase order.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...openByManufacturer.entries()].map(([mid, g]) => (
              <div key={mid} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, padding: '8px 12px', border: '1px solid var(--light-line)' }}>
                <div style={{ flex: 1 }}>
                  <strong>{g.name}</strong> · {g.count} line{g.count !== 1 ? 's' : ''}
                  {g.missing > 0
                    ? <span style={{ color: '#a03030' }}> · {g.missing} missing cost/currency</span>
                    : <span> · supplier total {money(g.total, cur)}</span>}
                </div>
                <button className="btn btn-primary btn-sm" disabled={ro || busy || g.missing > 0}
                  title={g.missing > 0 ? 'Resolve missing supplier costs first' : undefined}
                  onClick={async () => {
                    const res = await api(`/api/admin/commercial-orders/${id}/purchase-orders`, 'POST', { manufacturerId: mid })
                    if (res.success) window.location.href = `/admin/purchase-orders/${res.data.id}`
                  }}>
                  Generate draft PO
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Existing POs */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 10 }}>Purchase orders on this order</div>
        {state.purchaseOrders.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--stone)' }}>None yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {state.purchaseOrders.map(p => (
              <div key={p.id as string} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, padding: '7px 12px', border: '1px solid var(--light-line)' }}>
                <Link href={`/admin/purchase-orders/${p.id}`} style={{ color: 'var(--forest)', fontWeight: 500, minWidth: 160 }}>
                  {p.purchase_order_number as string}{Number(p.revision_number) > 1 ? `-R${String(p.revision_number).padStart(2, '0')}` : ''}
                </Link>
                <span className="status-pill" style={{ fontSize: 10 }}>{(p.status as string).replace(/_/g, ' ')}</span>
                {p.margin_at_risk ? <strong style={{ color: '#a03030', fontSize: 12 }}>MARGIN AT RISK</strong> : null}
                <span style={{ flex: 1 }} />
                <span style={{ color: 'var(--stone)', fontSize: 12 }}>{money(p.grand_total == null ? null : Number(p.grand_total), (p.supplier_currency as string) ?? 'GBP')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
