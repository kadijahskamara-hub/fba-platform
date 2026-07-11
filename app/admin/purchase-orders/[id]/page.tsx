'use client'

// Purchase-order editor (Sprint 2). Supplier-side only: costs, tax,
// charges and totals are supplier figures. Client selling prices and
// FBA margins never appear here (the margin-at-risk panel shows the
// internal analysis to authorised staff, clearly marked internal).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { box, inp, td, th, money, Field, Area } from '@/components/admin/commercial/ui'

const TAX_OPTIONS = [
  { value: 'unknown', label: 'Unknown (blocks issue)' },
  { value: 'standard', label: 'Standard' },
  { value: 'reduced', label: 'Reduced' },
  { value: 'zero', label: 'Zero-rated' },
  { value: 'exempt', label: 'Exempt' },
  { value: 'outside_scope', label: 'Outside scope' },
  { value: 'reverse_charge', label: 'Reverse charge' },
]

export default function PurchaseOrderPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [po, setPo] = useState<Record<string, unknown> | null>(null)
  const [perms, setPerms] = useState<{ canPrepare: boolean; canApprove: boolean; isUltraAdmin: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [ackUrl, setAckUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/purchase-orders/${id}`).then(r => r.json())
    if (res.success) { setPo(res.data); setPerms(res.permissions) }
    setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

  const api = async (url: string, method: string, bodyObj?: Record<string, unknown>) => {
    setBusy(true)
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: bodyObj ? JSON.stringify(bodyObj) : undefined,
    }).then(r => r.json())
    setBusy(false)
    if (!res.success) alert(res.error ?? 'Action failed')
    await load()
    return res
  }
  const patch = (b: Record<string, unknown>) => api(`/api/admin/purchase-orders/${id}`, 'PATCH', b)
  const patchLine = (lineId: string, b: Record<string, unknown>) => api(`/api/admin/purchase-orders/${id}/lines/${lineId}`, 'PATCH', b)

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--stone)' }}>Loading…</div>
  if (!po || !perms) return <div style={{ padding: 60, textAlign: 'center' }}>Purchase order not found. <Link href="/admin/purchase-orders">Back</Link></div>

  const locked = Boolean(po.locked_at)
  const ro = locked || !perms.canPrepare
  const cur = (po.supplier_currency as string) ?? 'GBP'
  const lines = (po.lines ?? []) as Array<Record<string, unknown>>
  const totals = (po.totals ?? {}) as Record<string, unknown>
  const manufacturer = (po.manufacturer ?? {}) as Record<string, unknown>
  const order = (po.commercial_order ?? {}) as Record<string, unknown>
  const snapshots = ((po.snapshots ?? []) as Array<Record<string, unknown>>).sort((a, b) => Number(b.revision) - Number(a.revision))
  const margin = (po.margin_analysis ?? null) as Record<string, unknown> | null
  const approvalStatus = po.approval_status as string
  const status = po.status as string
  const rev = Number(po.revision_number ?? 1)
  const docNo = `${po.purchase_order_number}${rev > 1 ? `-R${String(rev).padStart(2, '0')}` : ''}`

  const numInput = (value: number | null, onSave: (v: number | null) => void, opts: { disabled?: boolean; width?: number } = {}) => (
    <input style={{ ...inp, width: opts.width ?? 100, opacity: opts.disabled ? 0.55 : 1 }} type="number" step="0.01"
      defaultValue={value ?? ''} disabled={opts.disabled}
      onBlur={e => {
        const v = e.target.value === '' ? null : parseFloat(e.target.value)
        if (v !== value) onSave(Number.isNaN(v as number) ? null : v)
      }} />
  )

  return (
    <>
      <div className="admin-header">
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href="/admin/purchase-orders" className="btn btn-ghost btn-sm">← POs</Link>
            <h1 className="admin-title" style={{ margin: 0 }}>{docNo}</h1>
            <span className="status-pill" style={locked ? { background: 'var(--forest)', color: '#fff' } : undefined}>
              {status.replace(/_/g, ' ')}{locked ? ' · locked' : ''}
            </span>
            {po.margin_at_risk ? <span className="status-pill" style={{ background: '#fdf0f0', color: '#a03030' }}>MARGIN AT RISK</span> : null}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--stone)', marginTop: 6 }}>
            {(manufacturer.name as string) ?? '—'}{manufacturer.is_active === false ? ' (inactive)' : ''}
            {' · '}<Link href={`/admin/commercial-orders/${order.id}/procurement`} style={{ color: 'var(--forest)' }}>{order.order_number as string}</Link>
            {' · '}{cur}
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => window.open(`/api/admin/purchase-orders/${id}/document`, '_blank')}>
          {locked ? 'Open issued PO ↧' : 'Preview draft PO ↗'}
        </button>
      </div>

      {locked && (
        <div style={{ background: 'var(--tint, #E8F0EB)', border: '1px solid var(--forest)', color: 'var(--forest)', padding: '10px 16px', marginBottom: 20, fontSize: 13 }}>
          Issued &amp; locked — the supplier document renders from its frozen snapshot. Amendments require a new revision (the old acknowledgement link is invalidated and the supplier must be reissued).
        </div>
      )}

      {/* Approval banner */}
      {(approvalStatus !== 'none' || status === 'pending_approval') && (
        <div style={{
          ...box, padding: 16,
          background: approvalStatus === 'approved' ? '#eef5ef' : approvalStatus === 'blocked' ? '#fdf0f0' : '#faf3dd',
          borderColor: approvalStatus === 'approved' ? 'var(--forest)' : approvalStatus === 'blocked' ? '#a03030' : '#8a6d1a',
        }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13, letterSpacing: '0.05em', color: approvalStatus === 'approved' ? 'var(--forest)' : approvalStatus === 'blocked' ? '#a03030' : '#8a6d1a' }}>
              {approvalStatus === 'approved' ? 'APPROVED' : approvalStatus === 'blocked' ? 'BLOCKED' : 'APPROVAL REQUIRED'}
            </strong>
            <span style={{ flex: 1 }} />
            {!locked && approvalStatus === 'required' && status !== 'pending_approval' && perms.canPrepare && (
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => api(`/api/admin/purchase-orders/${id}/approve`, 'POST', { action: 'request' })}>Request approval</button>
            )}
            {!locked && perms.canApprove && ['required', 'blocked'].includes(approvalStatus) && (
              <>
                <button className="btn btn-primary btn-sm" disabled={busy}
                  onClick={() => { const note = prompt('Approval note (optional):'); api(`/api/admin/purchase-orders/${id}/approve`, 'POST', { action: 'approve', note }) }}>
                  Approve
                </button>
                <button className="btn btn-ghost btn-sm" disabled={busy}
                  onClick={() => { const note = prompt('Return for correction — note:'); api(`/api/admin/purchase-orders/${id}/approve`, 'POST', { action: 'reject', note }) }}>
                  Return for correction
                </button>
              </>
            )}
          </div>
          {(totals.approvalReasons as string[] | undefined)?.length ? (
            <ul style={{ margin: '10px 0 0 18px', fontSize: 12.5 }}>
              {(totals.approvalReasons as string[]).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          ) : null}
        </div>
      )}

      {/* Margin-at-risk (INTERNAL) */}
      {po.margin_at_risk && margin ? (
        <div style={{ ...box, borderColor: '#a03030' }}>
          <div className="label" style={{ marginBottom: 8, color: '#a03030' }}>Margin at risk — internal analysis (never shown to suppliers or clients)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontSize: 13 }}>
            <div>Client net selling<br /><strong>{money(Number(margin.clientNetSelling ?? 0), cur)}</strong></div>
            <div>Original expected cost<br /><strong>{money(Number(margin.originalExpectedCost ?? 0), cur)}</strong></div>
            <div>Current PO cost<br /><strong>{money(Number(margin.currentPoCost ?? 0), cur)}</strong></div>
            <div>Cost variance<br /><strong style={{ color: '#a03030' }}>{money(Number(margin.costVariance ?? 0), cur)}</strong></div>
            <div>Expected gross profit<br /><strong>{money(Number(margin.expectedGrossProfit ?? 0), cur)}</strong></div>
            <div>Expected margin<br /><strong>{margin.expectedMarginPercent == null ? '—' : `${Number(margin.expectedMarginPercent).toFixed(1)}%`}</strong></div>
            <div>Original margin<br /><strong>{margin.originalMarginPercent == null ? '—' : `${Number(margin.originalMarginPercent).toFixed(1)}%`}</strong></div>
            <div>Margin change<br /><strong>{margin.marginChangePercent == null ? '—' : `${Number(margin.marginChangePercent).toFixed(1)}%`}</strong></div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="form-label" style={{ fontSize: 11 }}>Resolution</div>
              <select style={{ ...inp, width: 260 }} disabled={!perms.canPrepare || busy} value={(po.margin_resolution as string) ?? ''}
                onChange={e => {
                  const v = e.target.value || null
                  if (!v) { patch({ marginResolution: null }); return }
                  const note = prompt('Resolution note (required):', (po.margin_resolution_note as string) ?? '')
                  if (!note) return
                  patch({ marginResolution: v, marginResolutionNote: note })
                }}>
                <option value="">— unresolved (blocks issue) —</option>
                <option value="accepted_internal_reduction">Accept internal margin reduction</option>
                <option value="client_variation_required">Client variation required</option>
                <option value="supplier_negotiation_required">Supplier negotiation required</option>
                <option value="alternative_supplier_required">Alternative supplier required</option>
                <option value="cancelled">Cancel procurement</option>
              </select>
            </div>
            {po.margin_resolution_note ? <p style={{ fontSize: 12, color: 'var(--stone)', maxWidth: 420 }}>Note: {po.margin_resolution_note as string}</p> : null}
          </div>
        </div>
      ) : null}

      {/* Header details */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 12 }}>Order details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
          <Field label="Required delivery date" value={(po.required_by_date as string) ?? null} onSave={v => patch({ requiredByDate: v || null })} placeholder="YYYY-MM-DD" disabled={ro} />
          <Field label="Acknowledgement due" value={(po.acknowledgement_due_date as string) ?? null} onSave={v => patch({ acknowledgementDueDate: v || null })} placeholder="YYYY-MM-DD" disabled={ro} />
          <Field label="Incoterms" value={(po.incoterms_snapshot as string) ?? null} onSave={v => patch({ incoterms: v || null })} placeholder="e.g. DAP London" disabled={ro} />
          <Field label="Supplier order email" value={(po.supplier_recipient_email as string) ?? null} onSave={v => patch({ supplierRecipientEmail: v || null })} disabled={ro} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
          <Area label="Delivery address (on PO)" value={(po.delivery_address_snapshot as string) ?? null} onSave={v => patch({ deliveryAddress: v || null })} disabled={ro} />
          <Area label="Payment terms (on PO)" value={(po.payment_terms_snapshot as string) ?? null} onSave={v => patch({ paymentTerms: v || null })} disabled={ro} />
          <Area label="Supplier instructions (on PO)" value={(po.supplier_notes as string) ?? null} onSave={v => patch({ supplierNotes: v || null })} disabled={ro} />
          <Area label="Internal notes (never on PO)" value={(po.internal_notes as string) ?? null} onSave={v => patch({ internalNotes: v || null })} disabled={!perms.canPrepare} />
        </div>
      </div>

      {/* Lines */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 12 }}>Lines (supplier costs)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead><tr>
              <th style={th}>Item</th><th style={{ ...th, width: 70 }}>Qty</th>
              <th style={{ ...th, width: 110 }}>Unit cost ({cur})</th>
              <th style={{ ...th, width: 90 }}>Discount</th>
              <th style={{ ...th, width: 170 }}>Supplier tax</th>
              <th style={{ ...th, width: 70 }}>Rate %</th>
              <th style={{ ...th, width: 100 }}>Net total</th>
              <th style={{ ...th, width: 60 }}></th>
            </tr></thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.id as string}>
                  <td style={td}>
                    <div style={{ fontWeight: 500 }}>{l.product_name_snapshot as string}</div>
                    <div style={{ fontSize: 11, color: 'var(--stone)' }}>
                      {[l.supplier_sku ? `SKU ${l.supplier_sku}` : null, l.dimensions_snapshot, l.finish_snapshot].filter(Boolean).join(' · ') || '—'}
                      {l.cost_overridden ? <strong style={{ color: '#8a6d1a' }}> · cost overridden</strong> : null}
                    </div>
                  </td>
                  <td style={td}>{numInput(Number(l.quantity), v => patchLine(l.id as string, { quantity: v ?? 1 }), { disabled: ro, width: 60 })}</td>
                  <td style={td}>{numInput(Number(l.supplier_cost_unit), v => {
                    if (v == null) return
                    const alloc = l.supplier_allocation_id
                    let reason: string | null = null
                    if (alloc) {
                      reason = prompt('Reason for changing the supplier cost away from the allocation? (required)')
                      if (reason === null) { load(); return }
                    }
                    patchLine(l.id as string, reason ? { supplierCostUnit: v, costOverrideReason: reason } : { supplierCostUnit: v })
                  }, { disabled: ro })}</td>
                  <td style={td}>{numInput(l.discount_amount == null ? null : Number(l.discount_amount), v => patchLine(l.id as string, { discountAmount: v ?? 0 }), { disabled: ro, width: 76 })}</td>
                  <td style={td}>
                    <select style={{ ...inp, opacity: ro ? 0.55 : 1 }} disabled={ro} value={(l.tax_category as string) ?? 'unknown'}
                      onChange={e => {
                        const cat = e.target.value
                        const patchBody: Record<string, unknown> = { taxCategory: cat }
                        if (cat === 'standard' && l.tax_rate_snapshot == null) patchBody.taxRate = 20
                        if (!['standard', 'reduced'].includes(cat)) patchBody.taxRate = null
                        patchLine(l.id as string, patchBody)
                      }}>
                      {TAX_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td style={td}>
                    {['standard', 'reduced'].includes(l.tax_category as string)
                      ? numInput(l.tax_rate_snapshot == null ? null : Number(l.tax_rate_snapshot), v => patchLine(l.id as string, { taxRate: v }), { disabled: ro, width: 56 })
                      : <span style={{ fontSize: 12, color: 'var(--stone)' }}>0</span>}
                  </td>
                  <td style={{ ...td, fontWeight: 500, whiteSpace: 'nowrap' }}>{money(l.line_net_total == null ? null : Number(l.line_net_total), cur)}</td>
                  <td style={td}>
                    {!ro && <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} disabled={busy}
                      onClick={() => { if (confirm('Remove this line? The allocation is released.')) api(`/api/admin/purchase-orders/${id}/lines/${l.id}`, 'DELETE') }}>✕</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Charges + totals */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--light-line)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><div className="form-label" style={{ fontSize: 11 }}>Shipping / freight ({cur})</div>{numInput(po.shipping_total == null ? null : Number(po.shipping_total), v => patch({ shippingTotal: v ?? 0 }), { disabled: ro, width: 120 })}</div>
            <div><div className="form-label" style={{ fontSize: 11 }}>Packaging / crating ({cur})</div>{numInput(po.packaging_total == null ? null : Number(po.packaging_total), v => patch({ packagingTotal: v ?? 0 }), { disabled: ro, width: 120 })}</div>
            <div><div className="form-label" style={{ fontSize: 11 }}>Other charges ({cur})</div>{numInput(po.other_charges_total == null ? null : Number(po.other_charges_total), v => patch({ otherChargesTotal: v ?? 0 }), { disabled: ro, width: 120 })}</div>
            <div><div className="form-label" style={{ fontSize: 11 }}>Supplier discount ({cur})</div>{numInput(po.discount_total == null ? null : Number(po.discount_total), v => patch({ discountTotal: v ?? 0 }), { disabled: ro, width: 120 })}</div>
          </div>
          <div style={{ fontSize: 13.5 }}>
            {[
              ['Net subtotal', money(Number(totals.netSubtotal ?? po.subtotal ?? 0), cur), false],
              ['Tax', money(Number(totals.taxTotal ?? po.tax_total ?? 0), cur), false],
              ['PO total', money(Number(totals.grandTotal ?? po.grand_total ?? 0), cur), true],
            ].map(([k, v, g]) => (
              <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: g ? '1.5px solid var(--forest)' : '1px solid var(--light-line)', fontWeight: g ? 600 : 400, color: g ? 'var(--forest)' : 'inherit' }}>
                <span>{k as string}</span><span>{v as string}</span>
              </div>
            ))}
            {totals.hasUnknownTax ? <p style={{ fontSize: 12, color: '#a03030', marginTop: 8 }}>Unknown supplier tax on one or more lines — issue is blocked until confirmed.</p> : null}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 10 }}>Actions</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!locked && perms.canPrepare && (
            <button className="btn btn-primary btn-sm" disabled={busy}
              onClick={async () => {
                if (!confirm(`Issue ${docNo} to ${(manufacturer.name as string) ?? 'the supplier'}? The PO is frozen and an acknowledgement link is generated.`)) return
                const res = await api(`/api/admin/purchase-orders/${id}/issue`, 'POST')
                if (res.success) setAckUrl(`${window.location.origin}${res.data.acknowledgementUrl}`)
              }}>
              Issue purchase order…
            </button>
          )}
          {locked && perms.canPrepare && (
            <button className="btn btn-secondary btn-sm" disabled={busy}
              onClick={() => {
                const reason = prompt(`Create revision R${String(rev + 1).padStart(2, '0')} — reason for amendment? (required)`)
                if (!reason) return
                api(`/api/admin/purchase-orders/${id}/revise`, 'POST', { reason })
              }}>
              Create new revision…
            </button>
          )}
          {(!locked || perms.isUltraAdmin) && (
            <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} disabled={busy}
              onClick={async () => {
                if (locked) {
                  const reason = prompt('Ultra Admin cancellation — reason? (required)')
                  if (!reason) return
                  const res = await fetch(`/api/admin/purchase-orders/${id}?reason=${encodeURIComponent(reason)}`, { method: 'DELETE' }).then(r => r.json())
                  if (!res.success) { alert(res.error); return }
                  await load()
                } else {
                  if (!confirm('Delete this draft PO? Allocations are released.')) return
                  const res = await fetch(`/api/admin/purchase-orders/${id}`, { method: 'DELETE' }).then(r => r.json())
                  if (!res.success) { alert(res.error); return }
                  router.push(`/admin/commercial-orders/${order.id}/procurement`)
                }
              }}>
              {locked ? 'Cancel issued PO (Ultra Admin)…' : 'Delete draft'}
            </button>
          )}
        </div>

        {ackUrl && (
          <div style={{ marginTop: 14, background: '#eef5ef', border: '1px solid var(--forest)', padding: '12px 16px', fontSize: 13 }}>
            <strong style={{ color: 'var(--forest)' }}>Acknowledgement link (shown once — copy it now):</strong>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ fontSize: 12, wordBreak: 'break-all', flex: 1 }}>{ackUrl}</code>
              <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(ackUrl)}>Copy</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--stone)', marginTop: 6 }}>
              Send this link to the supplier ({(po.supplier_recipient_email as string) ?? 'no order email on file'}) with the PO PDF.
              Status is recorded honestly as <em>approved, not sent</em> until email dispatch exists.
            </p>
          </div>
        )}

        {po.acknowledged_at ? (
          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--forest)' }}>
            Acknowledged by <strong>{po.acknowledged_by_name as string}</strong> ({po.acknowledged_by_email as string}) on {new Date(po.acknowledged_at as string).toLocaleString('en-GB')}
            {po.expected_completion_date ? ` · expected completion ${new Date(po.expected_completion_date as string).toLocaleDateString('en-GB')}` : ''}
            {po.acknowledgement_notes ? ` · “${po.acknowledgement_notes}”` : ''}
          </p>
        ) : status === 'supplier_amendment_requested' ? (
          <p style={{ marginTop: 12, fontSize: 13, color: '#8a6d1a' }}>
            Supplier requested an amendment{po.acknowledgement_notes ? `: “${po.acknowledgement_notes}”` : ''} — create a new revision to respond.
          </p>
        ) : null}

        {snapshots.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--light-line)' }}>
            <div className="label" style={{ marginBottom: 8, fontSize: 11 }}>Issued revisions (immutable)</div>
            {snapshots.map(s => (
              <div key={s.id as string} style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--light-line)' }}>
                <strong style={{ minWidth: 180 }}>{s.document_number as string}</strong>
                <span style={{ color: 'var(--stone)' }}>{new Date(s.issued_at as string).toLocaleString('en-GB')}</span>
                <span style={{ flex: 1 }} />
                <button className="btn btn-secondary btn-sm" onClick={() => window.open(`/api/admin/purchase-orders/${id}/document?revision=${s.revision}`, '_blank')}>Open PDF ↧</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
