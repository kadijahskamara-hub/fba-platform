'use client'

// Delivery detail (Sprint 4): line assignment (partial supported),
// packages, atomic dispatch (issues the immutable no-price delivery
// note), the three tailored document copies, secure confirmation
// link, proof of delivery (admin channel) and exception follow-up.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { box, inp, td, th, Field } from '@/components/admin/commercial/ui'
import { CreditFromExceptionButton } from '@/components/CreditFromExceptionButton'
import { UltraDeleteRecordButton } from '@/components/UltraDeleteRecordButton'

interface Perms {
  canCreate: boolean; canDispatch: boolean; canConfirm: boolean
  canRecordPod: boolean; canManageInstallation: boolean
}
interface Coverage {
  sourceLineItemId: string; name: string | null; ordered: number
  assigned: number; shipped: number; remainingToAssign: number
}

const MANUAL_NEXT: Record<string, string[]> = {
  pending: ['preparing'],
  preparing: ['pending'],
  dispatched: ['in_transit', 'failed'],
  in_transit: ['failed'],
  delivered: ['returned'],
  partially_delivered: ['returned'],
  failed: ['preparing'],
  returned: [],
}

export default function DeliveryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [del, setDel] = useState<Record<string, unknown> | null>(null)
  const [perms, setPerms] = useState<Perms | null>(null)
  const [coverage, setCoverage] = useState<Coverage[]>([])
  const [sourceLines, setSourceLines] = useState<Array<Record<string, unknown>>>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [confirmLink, setConfirmLink] = useState<{ absoluteUrl: string; token: string; expiresAt: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/deliveries/${id}`).then(r => r.json())
    if (res.success) {
      setDel(res.data); setPerms(res.permissions)
      const orderId = (res.data.order as { id?: string } | null)?.id
      if (orderId) {
        const st = await fetch(`/api/admin/commercial-orders/${orderId}/deliveries`).then(r => r.json())
        if (st.success) { setCoverage(st.data.coverage ?? []); setSourceLines(st.data.sourceLines ?? []) }
      }
    }
    setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

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
  if (!del || !perms) return <div style={{ padding: 60, textAlign: 'center' }}>Delivery not found. <Link href="/admin/commercial-orders">Back</Link></div>

  const status = del.dispatch_status as string
  const locked = Boolean(del.locked_at)
  const editable = !locked && ['pending', 'preparing'].includes(status)
  const order = (del.order ?? {}) as Record<string, unknown>
  const location = (del.location ?? null) as Record<string, unknown> | null
  const manufacturer = (del.manufacturer ?? null) as { id?: string; name?: string } | null
  const lines = (del.lines ?? []) as Array<Record<string, unknown>>
  const packages = (del.packages ?? []) as Array<Record<string, unknown>>
  const pods = (del.pods ?? []) as Array<Record<string, unknown>>
  const exceptions = (del.exceptions ?? []) as Array<Record<string, unknown>>
  const canPod = ['dispatched', 'in_transit', 'partially_delivered'].includes(status)

  // Maker options for the manufacturer copy (from assigned lines).
  const makerOptions = new Map<string, string>()
  for (const l of lines) {
    const m = ((l.source_line ?? {}) as Record<string, unknown>).manufacturer as { id?: string; name?: string } | null
    if (m?.id) makerOptions.set(m.id, m.name ?? 'Maker')
  }

  const assignedElsewhere = (sourceLineItemId: string, excludeLineId?: string) => {
    const cov = coverage.find(c => c.sourceLineItemId === sourceLineItemId)
    if (!cov) return 0
    const here = lines
      .filter(l => l.source_line_item_id === sourceLineItemId && l.id !== excludeLineId)
      .reduce((s, l) => s + Number(l.quantity), 0)
    // coverage.assigned includes this delivery; remaining excludes what's here
    return cov.assigned - here
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href={`/admin/commercial-orders/${order.id}/deliveries`} className="btn btn-ghost btn-sm">← Deliveries</Link>
            <h1 className="admin-title" style={{ margin: 0 }}>{del.delivery_number as string}</h1>
            <span className="status-pill">{status.replace(/_/g, ' ')}</span>
            {locked && <span style={{ fontSize: 11, color: 'var(--stone)' }}>note issued</span>}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--stone)', marginTop: 6 }}>
            Order {order.order_number as string} · Proforma {del.proforma_reference as string ?? '—'}
            {' · '}{del.origin_type === 'direct_maker' ? `Direct from ${manufacturer?.name ?? 'maker'}` : 'Consolidated via FBA'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Sprint 7.1 — Ultra-only test-data deletion */}
          <UltraDeleteRecordButton
            entity="delivery"
            recordId={id}
            label={del.delivery_number as string}
            redirectTo={`/admin/commercial-orders/${order.id}/deliveries`}
          />
          {MANUAL_NEXT[status]?.map(nxt => (
            (perms.canDispatch || ['preparing', 'pending'].includes(nxt)) &&
            <button key={nxt} className="btn btn-ghost btn-sm" disabled={busy}
              onClick={() => api(`/api/admin/deliveries/${id}`, 'PATCH', { status: nxt })}>
              → {nxt.replace(/_/g, ' ')}
            </button>
          ))}
          {editable && perms.canDispatch && (
            <button className="btn btn-primary btn-sm" disabled={busy || lines.length === 0 || !location}
              title={lines.length === 0 ? 'Assign at least one line' : !location ? 'Set a delivery location' : undefined}
              onClick={async () => {
                if (!confirm('Dispatch this delivery? The delivery note is issued and frozen at this point.')) return
                await api(`/api/admin/deliveries/${id}/dispatch`, 'POST')
              }}>
              Dispatch
            </button>
          )}
        </div>
      </div>

      {/* Details */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 12 }}>Shipment details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <Field label="Carrier" value={(del.carrier as string) ?? null} disabled={!editable || busy}
            onSave={v => api(`/api/admin/deliveries/${id}`, 'PATCH', { carrier: v || null })} />
          <div>
            <div className="form-label">Expected date</div>
            <input style={inp} type="date" disabled={!editable || busy}
              defaultValue={(del.expected_date as string) ?? ''}
              onBlur={e => { if (e.target.value !== ((del.expected_date as string) ?? '')) api(`/api/admin/deliveries/${id}`, 'PATCH', { expectedDate: e.target.value || null }) }} />
          </div>
          <div>
            <div className="form-label">Deliver to</div>
            <div style={{ fontSize: 13, paddingTop: 5 }}>
              {location
                ? <>{location.label as string} — {[location.address_line1, location.city, location.postcode].filter(Boolean).join(', ')}</>
                : <span style={{ color: '#a03030' }}>No location set — required before dispatch</span>}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="form-label">Delivery instructions</div>
          <textarea style={{ ...inp, minHeight: 54 }} disabled={!editable || busy}
            defaultValue={(del.instructions as string) ?? ''}
            onBlur={e => { if (e.target.value !== ((del.instructions as string) ?? '')) api(`/api/admin/deliveries/${id}`, 'PATCH', { instructions: e.target.value || null }) }} />
        </div>
      </div>

      {/* Lines */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 12 }}>Lines on this delivery</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Item</th><th style={th}>Maker</th><th style={th}>Qty this delivery</th>
            <th style={th}>Ordered</th><th style={th}>Notes</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {lines.map(l => {
              const src = (l.source_line ?? {}) as Record<string, unknown>
              const m = (src.manufacturer ?? null) as { name?: string } | null
              return (
                <tr key={l.id as string}>
                  <td style={td}>{src.name as string}</td>
                  <td style={td}>{m?.name ?? '—'}</td>
                  <td style={td}>
                    <input style={{ ...inp, width: 80 }} type="number" step="1" min="0.001" disabled={!editable || busy}
                      defaultValue={Number(l.quantity)}
                      onBlur={e => {
                        const v = parseFloat(e.target.value)
                        if (Number.isFinite(v) && v !== Number(l.quantity)) {
                          api(`/api/admin/deliveries/${id}/lines/${l.id}`, 'PATCH', { quantity: v })
                        }
                      }} />
                  </td>
                  <td style={td}>{Number(src.quantity)}</td>
                  <td style={td}>
                    <input style={inp} disabled={!editable || busy} defaultValue={(l.notes as string) ?? ''}
                      onBlur={e => { if (e.target.value !== ((l.notes as string) ?? '')) api(`/api/admin/deliveries/${id}/lines/${l.id}`, 'PATCH', { quantity: Number(l.quantity), notes: e.target.value || null }) }} />
                  </td>
                  <td style={td}>
                    {editable && (
                      <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} disabled={busy}
                        onClick={() => { if (confirm('Remove this line from the delivery?')) api(`/api/admin/deliveries/${id}/lines/${l.id}`, 'DELETE') }}>✕</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {lines.length === 0 && <tr><td style={td} colSpan={6}><span style={{ color: 'var(--stone)' }}>No lines yet.</span></td></tr>}
          </tbody>
        </table>

        {editable && (
          <div style={{ marginTop: 14 }}>
            <div className="form-label">Add a line (partial quantities allowed — the remainder is auto-flagged as backorder once this ships)</div>
            <AddLine busy={busy} sourceLines={sourceLines} lines={lines} coverage={coverage}
              assignedElsewhere={assignedElsewhere}
              onAdd={(sourceLineItemId, quantity) => api(`/api/admin/deliveries/${id}/lines`, 'POST', { sourceLineItemId, quantity })} />
          </div>
        )}
      </div>

      {/* Packages */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 12 }}>Packages &amp; consignment references</div>
        {packages.map(p => (
          <div key={p.id as string} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
            <strong>{(p.reference as string) || 'no ref'}</strong>
            <span style={{ color: 'var(--stone)' }}>{[p.description, p.weight, p.dimensions].filter(Boolean).join(' · ') || '—'}</span>
            <span style={{ flex: 1 }} />
            {!['delivered', 'partially_delivered', 'returned'].includes(status) && (
              <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} disabled={busy}
                onClick={() => api(`/api/admin/deliveries/${id}/packages/${p.id}`, 'DELETE')}>✕</button>
            )}
          </div>
        ))}
        {!['delivered', 'partially_delivered', 'returned'].includes(status) && (
          <AddPackage busy={busy} onAdd={p => api(`/api/admin/deliveries/${id}/packages`, 'POST', p)} />
        )}
      </div>

      {/* Documents — three tailored copies */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 10 }}>Delivery note {locked ? '(issued — frozen snapshot)' : '(draft preview, watermark)'}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <a className="btn btn-ghost btn-sm" href={`/api/admin/deliveries/${id}/document?audience=client`} target="_blank" rel="noreferrer">Client copy</a>
          {perms.canConfirm ? (
            <button className="btn btn-ghost btn-sm" disabled={busy || !locked}
              title={!locked ? 'Dispatch first — the site copy carries the live confirmation QR' : undefined}
              onClick={async () => {
                const res = await api(`/api/admin/deliveries/${id}/confirmation-link`, 'POST')
                if (res.success) {
                  setConfirmLink(res.data)
                  window.open(`/api/admin/deliveries/${id}/document?audience=site&t=${encodeURIComponent(res.data.token)}`, '_blank')
                }
              }}>
              Site copy (with QR + link)
            </button>
          ) : (
            <a className="btn btn-ghost btn-sm" href={`/api/admin/deliveries/${id}/document?audience=site`} target="_blank" rel="noreferrer">Site copy</a>
          )}
          {del.origin_type === 'direct_maker' ? (
            <a className="btn btn-ghost btn-sm" href={`/api/admin/deliveries/${id}/document?audience=manufacturer`} target="_blank" rel="noreferrer">Maker copy</a>
          ) : (
            [...makerOptions.entries()].map(([mid, mname]) => (
              <a key={mid} className="btn btn-ghost btn-sm"
                href={`/api/admin/deliveries/${id}/document?audience=manufacturer&manufacturerId=${mid}`} target="_blank" rel="noreferrer">
                Maker copy — {mname}
              </a>
            ))
          )}
        </div>
        {confirmLink && (
          <div style={{ marginTop: 12, fontSize: 13, border: '1px solid var(--light-line)', padding: '10px 12px' }}>
            <div className="form-label">Confirmation link (share with the site contact or client — shown once, previous links revoked)</div>
            <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{confirmLink.absoluteUrl}</code>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }}
              onClick={() => navigator.clipboard?.writeText(confirmLink.absoluteUrl)}>Copy</button>
            <span style={{ color: 'var(--stone)', marginLeft: 8 }}>expires {new Date(confirmLink.expiresAt).toLocaleDateString('en-GB')}</span>
          </div>
        )}
      </div>

      {/* Proof of delivery */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 10 }}>Proof of delivery</div>
        {pods.length === 0 && <p style={{ fontSize: 13, color: 'var(--stone)' }}>Not yet confirmed. The site contact or client can confirm via the secure link, or record it internally below.</p>}
        {pods.map(pod => (
          <div key={pod.id as string} style={{ border: '1px solid var(--light-line)', padding: '10px 14px', marginBottom: 8, fontSize: 13 }}>
            <strong style={{ color: 'var(--forest)' }}>{pod.received_by_name as string}</strong>
            {' · '}{new Date(pod.received_at as string).toLocaleString('en-GB')}
            {' · '}<span className="status-pill" style={{ fontSize: 10 }}>{pod.method === 'site_link' ? 'via secure link' : 'recorded internally'}</span>
            {pod.condition_notes ? <div style={{ marginTop: 4 }}>{pod.condition_notes as string}</div> : null}
            <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              {pod.signature_signed_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <a href={pod.signature_signed_url as string} target="_blank" rel="noreferrer"><img src={pod.signature_signed_url as string} alt="Signature" style={{ height: 60, border: '1px solid var(--light-line)', background: '#fff' }} /></a>
              ) : null}
              {((pod.photos ?? []) as Array<Record<string, unknown>>).map(ph => ph.signed_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <a key={ph.id as string} href={ph.signed_url as string} target="_blank" rel="noreferrer"><img src={ph.signed_url as string} alt={(ph.caption as string) ?? 'POD photo'} style={{ height: 60, border: '1px solid var(--light-line)' }} /></a>
              ) : null)}
            </div>
          </div>
        ))}

        {exceptions.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="form-label">Shortages / damages</div>
            {exceptions.map(ex => {
              const line = lines.find(l => l.id === ex.delivery_line_id)
              const src = (line?.source_line ?? {}) as Record<string, unknown>
              return (
                <div key={ex.id as string} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--light-line)', flexWrap: 'wrap' }}>
                  <strong style={{ color: '#a03030' }}>{(ex.type as string).replace(/_/g, ' ')}</strong>
                  <span>{(src.name as string) ?? 'line'} × {Number(ex.quantity_affected)}</span>
                  {ex.notes ? <span style={{ color: 'var(--stone)' }}>{ex.notes as string}</span> : null}
                  <span className="status-pill" style={{ fontSize: 10 }}>{(ex.resolution_status as string).replace(/_/g, ' ')}</span>
                  <span style={{ flex: 1 }} />
                  {perms.canConfirm && ['open', 'reordering'].includes(ex.resolution_status as string) && (
                    <>
                      {ex.resolution_status !== 'reordering' && (
                        <button className="btn btn-ghost btn-sm" disabled={busy}
                          onClick={() => api(`/api/admin/delivery-exceptions/${ex.id}`, 'PATCH', { resolutionStatus: 'reordering' })}>re-ordering</button>
                      )}
                      <button className="btn btn-ghost btn-sm" disabled={busy}
                        onClick={() => api(`/api/admin/delivery-exceptions/${ex.id}`, 'PATCH', { resolutionStatus: 'credited' })}>credited</button>
                      <button className="btn btn-ghost btn-sm" disabled={busy}
                        onClick={() => api(`/api/admin/delivery-exceptions/${ex.id}`, 'PATCH', { resolutionStatus: 'resolved' })}>resolved</button>
                    </>
                  )}
                  {(ex.resolution_status as string) === 'credited' && (
                    <CreditFromExceptionButton
                      exceptionId={ex.id as string}
                      orderId={(order.id as string) ?? (del.commercial_order_id as string) ?? null}
                      onDone={load}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {perms.canRecordPod && canPod && (
          <AdminPodForm deliveryId={id} lines={lines} busy={busy} setBusy={setBusy} onDone={load} />
        )}
      </div>
    </>
  )
}

function AddLine({ busy, sourceLines, lines, coverage, assignedElsewhere, onAdd }: {
  busy: boolean
  sourceLines: Array<Record<string, unknown>>
  lines: Array<Record<string, unknown>>
  coverage: Coverage[]
  assignedElsewhere: (sourceLineItemId: string) => number
  onAdd: (sourceLineItemId: string, quantity: number) => void
}) {
  const [sel, setSel] = useState('')
  const [qty, setQty] = useState('')
  const options = sourceLines.filter(sl => !lines.some(l => l.source_line_item_id === sl.id))
  const cov = coverage.find(c => c.sourceLineItemId === sel)
  const remaining = sel && cov ? Math.max(0, cov.ordered - assignedElsewhere(sel)) : null
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <select style={{ ...inp, maxWidth: 340 }} value={sel} disabled={busy}
        onChange={e => { setSel(e.target.value); setQty('') }}>
        <option value="">— select order line —</option>
        {options.map(sl => <option key={sl.id as string} value={sl.id as string}>{sl.name as string} (×{Number(sl.quantity)})</option>)}
      </select>
      <input style={{ ...inp, width: 100 }} type="number" min="0.001" step="1" placeholder="qty"
        value={qty} disabled={busy || !sel} onChange={e => setQty(e.target.value)} />
      {remaining != null && <span style={{ fontSize: 12, color: 'var(--stone)' }}>{remaining} unassigned</span>}
      <button className="btn btn-ghost btn-sm" disabled={busy || !sel || !qty}
        onClick={() => { onAdd(sel, parseFloat(qty)); setSel(''); setQty('') }}>
        Add line
      </button>
    </div>
  )
}

function AddPackage({ busy, onAdd }: { busy: boolean; onAdd: (p: Record<string, unknown>) => void }) {
  const [f, setF] = useState<Record<string, string>>({})
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF(v => ({ ...v, [k]: e.target.value }))
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
      <input style={{ ...inp, width: 180 }} placeholder="Tracking / consignment ref" value={f.reference ?? ''} onChange={set('reference')} />
      <input style={{ ...inp, width: 200 }} placeholder="Description" value={f.description ?? ''} onChange={set('description')} />
      <input style={{ ...inp, width: 100 }} placeholder="Weight" value={f.weight ?? ''} onChange={set('weight')} />
      <input style={{ ...inp, width: 140 }} placeholder="Dimensions" value={f.dimensions ?? ''} onChange={set('dimensions')} />
      <button className="btn btn-ghost btn-sm" disabled={busy || (!f.reference && !f.description)}
        onClick={() => { onAdd({ reference: f.reference || null, description: f.description || null, weight: f.weight || null, dimensions: f.dimensions || null }); setF({}) }}>
        Add package
      </button>
    </div>
  )
}

function AdminPodForm({ deliveryId, lines, busy, setBusy, onDone }: {
  deliveryId: string
  lines: Array<Record<string, unknown>>
  busy: boolean
  setBusy: (b: boolean) => void
  onDone: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [exc, setExc] = useState<Record<string, { type: string; qty: string; notes: string }>>({})
  const [files, setFiles] = useState<FileList | null>(null)
  const [sig, setSig] = useState<File | null>(null)

  if (!open) {
    return <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>Record proof of delivery internally</button>
  }
  return (
    <div style={{ border: '1px dashed var(--light-line)', padding: 14, marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><div className="form-label">Received by (name) *</div><input style={inp} value={name} onChange={e => setName(e.target.value)} maxLength={200} /></div>
        <div><div className="form-label">Condition notes</div><input style={inp} value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} /></div>
      </div>
      <div className="form-label" style={{ marginTop: 10 }}>Shortages / damages (leave as “received in full” if none)</div>
      {lines.map(l => {
        const src = (l.source_line ?? {}) as Record<string, unknown>
        const e = exc[l.id as string] ?? { type: '', qty: '1', notes: '' }
        const upd = (patch: Partial<typeof e>) => setExc(v => ({ ...v, [l.id as string]: { ...e, ...patch } }))
        return (
          <div key={l.id as string} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, minWidth: 220 }}>{src.name as string} (×{Number(l.quantity)})</span>
            <select style={{ ...inp, width: 160 }} value={e.type} onChange={ev => upd({ type: ev.target.value })}>
              <option value="">Received in full</option>
              <option value="shortage">Shortage</option>
              <option value="damage">Damage</option>
              <option value="wrong_item">Wrong item</option>
            </select>
            {e.type && <>
              <input style={{ ...inp, width: 70 }} type="number" min="1" value={e.qty} onChange={ev => upd({ qty: ev.target.value })} />
              <input style={{ ...inp, width: 220 }} placeholder="details" value={e.notes} onChange={ev => upd({ notes: ev.target.value })} />
            </>}
          </div>
        )
      })}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <div>
          <div className="form-label">Signature image (optional)</div>
          <input style={inp} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setSig(e.target.files?.[0] ?? null)} />
        </div>
        <div>
          <div className="form-label">Photos (optional, up to 4)</div>
          <input style={inp} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => setFiles(e.target.files)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true)
            const fd = new FormData()
            fd.append('name', name.trim())
            fd.append('conditionNotes', notes)
            const exceptions = Object.entries(exc)
              .filter(([, e]) => e.type)
              .map(([lineId, e]) => ({ deliveryLineId: lineId, type: e.type, quantityAffected: Number(e.qty || 1), notes: e.notes || null }))
            fd.append('exceptions', JSON.stringify(exceptions))
            if (sig) fd.append('signature', sig)
            if (files) for (let i = 0; i < Math.min(files.length, 4); i++) fd.append('photos', files[i])
            const res = await fetch(`/api/admin/deliveries/${deliveryId}/confirm`, { method: 'POST', body: fd }).then(r => r.json())
            setBusy(false)
            if (!res.success) { alert(res.error ?? 'Failed'); return }
            setOpen(false)
            await onDone()
          }}>
          Record proof of delivery
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}
