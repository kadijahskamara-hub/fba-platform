'use client'

// Commercial-order Deliveries tab (Sprint 4).
// Site addresses & contacts, shipments (consolidated or direct-from-
// maker, partial quantities with auto-flagged backorders), and the
// order's installation records. Delivery documents are no-price.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { box, inp, td, th } from '@/components/admin/commercial/ui'

interface Coverage {
  sourceLineItemId: string; name: string | null; ordered: number; assigned: number
  shipped: number; shortfall: number; remainingToAssign: number; backorderQty: number; backorder: boolean
}
interface DeliveriesState {
  order: Record<string, unknown>
  locations: Array<Record<string, unknown>>
  deliveries: Array<Record<string, unknown>>
  installations: Array<Record<string, unknown>>
  sourceLines: Array<Record<string, unknown>>
  exceptions: Array<Record<string, unknown>>
  coverage: Coverage[]
}
interface Perms {
  canCreate: boolean; canDispatch: boolean; canConfirm: boolean
  canRecordPod: boolean; canManageInstallation: boolean; isUltraAdmin: boolean
}

const pill: React.CSSProperties = { fontSize: 10 }

export default function OrderDeliveriesPage() {
  const { id } = useParams<{ id: string }>()
  const [state, setState] = useState<DeliveriesState | null>(null)
  const [perms, setPerms] = useState<Perms | null>(null)
  const [artisans, setArtisans] = useState<{ id: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showLocationForm, setShowLocationForm] = useState(false)
  const [showDeliveryForm, setShowDeliveryForm] = useState(false)
  const [showInstallForm, setShowInstallForm] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/commercial-orders/${id}/deliveries`).then(r => r.json())
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
  const client = (order.client_snapshot ?? {}) as Record<string, unknown>
  const source = (order.source ?? {}) as Record<string, unknown>
  const backorders = state.coverage.filter(c => c.backorder)

  return (
    <>
      <div className="admin-header">
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href="/admin/commercial-orders" className="btn btn-ghost btn-sm">← Orders</Link>
            <h1 className="admin-title" style={{ margin: 0 }}>{order.order_number as string} · Deliveries</h1>
            <span className="status-pill">{(order.status as string).replace(/_/g, ' ')}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--stone)', marginTop: 6 }}>
            {(client.client_company as string) || (client.client_name as string) || '—'}
            {' · '}Source {(source.quote_number as string) ?? (source.proforma_number as string) ?? '—'}
            {' · '}<Link href={`/admin/commercial-orders/${id}/procurement`} style={{ color: 'var(--forest)' }}>procurement</Link>
          </div>
        </div>
      </div>

      {/* Backorder banner (auto-flagged) */}
      {backorders.length > 0 && (
        <div style={{ ...box, borderLeft: '3px solid #a03030' }}>
          <div className="label" style={{ marginBottom: 8, color: '#a03030' }}>Backorders to schedule (auto-flagged)</div>
          {backorders.map(c => (
            <div key={c.sourceLineItemId} style={{ fontSize: 13, marginBottom: 4 }}>
              <strong>{c.name ?? 'Line'}</strong> — {c.backorderQty} outstanding
              ({c.shipped} of {c.ordered} shipped{c.shortfall > 0 ? `, ${c.shortfall} short on delivery` : ''})
            </div>
          ))}
        </div>
      )}

      {/* Line coverage */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 12 }}>Shipment coverage</div>
        {state.coverage.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--stone)' }}>This order has no product lines to ship.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Line</th><th style={th}>Ordered</th><th style={th}>Assigned</th>
              <th style={th}>Shipped</th><th style={th}>Unassigned</th><th style={th}>Status</th>
            </tr></thead>
            <tbody>
              {state.coverage.map(c => (
                <tr key={c.sourceLineItemId}>
                  <td style={td}>{c.name ?? '—'}</td>
                  <td style={td}>{c.ordered}</td>
                  <td style={td}>{c.assigned}</td>
                  <td style={td}>{c.shipped}{c.shortfall > 0 ? <span style={{ color: '#a03030' }}> (−{c.shortfall} short)</span> : ''}</td>
                  <td style={td}>{c.remainingToAssign}</td>
                  <td style={td}>
                    {c.backorder ? <strong style={{ color: '#a03030', fontSize: 12 }}>BACKORDER {c.backorderQty}</strong>
                      : c.remainingToAssign > 0 ? <span style={{ color: '#8a6d1a', fontSize: 12 }}>to assign</span>
                      : c.shipped >= c.ordered ? <span style={{ color: '#155724', fontSize: 12 }}>fully shipped</span>
                      : <span style={{ color: 'var(--stone)', fontSize: 12 }}>assigned</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Site addresses */}
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <div className="label" style={{ margin: 0 }}>Delivery addresses &amp; site contacts</div>
          <span style={{ flex: 1 }} />
          {perms.canCreate && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowLocationForm(v => !v)}>
              {showLocationForm ? 'Cancel' : '+ Add address'}
            </button>
          )}
        </div>
        {showLocationForm && <LocationForm busy={busy} onSubmit={async payload => {
          const res = await api(`/api/admin/commercial-orders/${id}/delivery-locations`, 'POST', payload)
          if (res.success) setShowLocationForm(false)
        }} />}
        {state.locations.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--stone)' }}>No delivery address yet — add the site address and who receives the goods.</p>
        ) : state.locations.map(loc => (
          <div key={loc.id as string} style={{ border: '1px solid var(--light-line)', padding: '10px 14px', marginBottom: 8, fontSize: 13 }}>
            <strong style={{ color: 'var(--forest)' }}>{loc.label as string}</strong>
            {' · '}{[loc.address_line1, loc.city, loc.postcode].filter(Boolean).join(', ') || 'address incomplete'}
            {loc.access_notes ? <div style={{ color: 'var(--stone)', fontSize: 12, marginTop: 3 }}>Access: {loc.access_notes as string}</div> : null}
            <div style={{ marginTop: 4, color: 'var(--stone)', fontSize: 12 }}>
              {((loc.contacts ?? []) as Array<Record<string, unknown>>).map(c =>
                `${c.name}${c.is_primary ? ' (primary)' : ''}${c.phone ? ` · ${c.phone}` : ''}`).join('  |  ') || 'No site contacts'}
            </div>
          </div>
        ))}
      </div>

      {/* Deliveries */}
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <div className="label" style={{ margin: 0 }}>Deliveries</div>
          <span style={{ flex: 1 }} />
          {perms.canCreate && (
            <button className="btn btn-primary btn-sm" disabled={busy || state.locations.length === 0}
              title={state.locations.length === 0 ? 'Add a delivery address first' : undefined}
              onClick={() => setShowDeliveryForm(v => !v)}>
              {showDeliveryForm ? 'Cancel' : '+ New delivery'}
            </button>
          )}
        </div>
        {showDeliveryForm && (
          <DeliveryForm busy={busy} artisans={artisans}
            locations={state.locations.map(l => ({ id: l.id as string, label: l.label as string }))}
            onSubmit={async payload => {
              const res = await api(`/api/admin/commercial-orders/${id}/deliveries`, 'POST', payload)
              if (res.success) window.location.href = `/admin/deliveries/${res.data.id}`
            }} />
        )}
        {state.deliveries.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--stone)' }}>No deliveries yet. An order can ship in one go or in several shipments.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {state.deliveries.map(d => {
              const lines = (d.lines ?? []) as Array<Record<string, unknown>>
              const manufacturer = (d.manufacturer ?? null) as { name?: string } | null
              return (
                <div key={d.id as string} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, padding: '8px 12px', border: '1px solid var(--light-line)', flexWrap: 'wrap' }}>
                  <Link href={`/admin/deliveries/${d.id}`} style={{ color: 'var(--forest)', fontWeight: 500, minWidth: 150 }}>
                    {d.delivery_number as string}
                  </Link>
                  <span className="status-pill" style={pill}>{(d.dispatch_status as string).replace(/_/g, ' ')}</span>
                  <span style={{ color: 'var(--stone)', fontSize: 12 }}>
                    {d.origin_type === 'direct_maker' ? `direct — ${manufacturer?.name ?? 'maker'}` : 'consolidated'}
                    {' · '}{lines.length} line{lines.length !== 1 ? 's' : ''}
                    {d.expected_date ? ` · expected ${d.expected_date}` : ''}
                    {d.carrier ? ` · ${d.carrier}` : ''}
                  </span>
                  <span style={{ flex: 1 }} />
                  {d.locked_at ? (
                    <a href={`/api/admin/deliveries/${d.id}/document?audience=client`} target="_blank" rel="noreferrer" style={{ color: 'var(--forest)', fontSize: 12 }}>delivery note</a>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Installations */}
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <div className="label" style={{ margin: 0 }}>Installations</div>
          <span style={{ flex: 1 }} />
          {perms.canManageInstallation && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowInstallForm(v => !v)}>
              {showInstallForm ? 'Cancel' : '+ New installation'}
            </button>
          )}
        </div>
        {showInstallForm && (
          <InstallationForm busy={busy}
            deliveries={state.deliveries.map(d => ({ id: d.id as string, number: d.delivery_number as string }))}
            onSubmit={async payload => {
              const res = await api('/api/admin/installations', 'POST', { ...payload, orderId: id })
              if (res.success) setShowInstallForm(false)
            }} />
        )}
        {state.installations.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--stone)' }}>No installation records. Installation is tracked separately from delivery, with its own status and sign-off.</p>
        ) : state.installations.map(ins => (
          <InstallationRow key={ins.id as string} ins={ins} busy={busy} canManage={perms.canManageInstallation} api={api} />
        ))}
      </div>
    </>
  )
}

function LocationForm({ busy, onSubmit }: { busy: boolean; onSubmit: (p: Record<string, unknown>) => void }) {
  const [f, setF] = useState<Record<string, string>>({})
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(v => ({ ...v, [k]: e.target.value }))
  return (
    <div style={{ border: '1px dashed var(--light-line)', padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <input style={inp} placeholder="Label (e.g. Main site)" value={f.label ?? ''} onChange={set('label')} />
        <input style={inp} placeholder="Address line 1" value={f.addressLine1 ?? ''} onChange={set('addressLine1')} />
        <input style={inp} placeholder="Address line 2" value={f.addressLine2 ?? ''} onChange={set('addressLine2')} />
        <input style={inp} placeholder="City" value={f.city ?? ''} onChange={set('city')} />
        <input style={inp} placeholder="Postcode" value={f.postcode ?? ''} onChange={set('postcode')} />
        <input style={inp} placeholder="Country" value={f.country ?? ''} onChange={set('country')} />
      </div>
      <textarea style={{ ...inp, marginTop: 10, minHeight: 54 }} placeholder="Access notes — lift, parking, floor, delivery hours, restrictions"
        value={f.accessNotes ?? ''} onChange={set('accessNotes')} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
        <input style={inp} placeholder="Contact name" value={f.cName ?? ''} onChange={set('cName')} />
        <input style={inp} placeholder="Role" value={f.cRole ?? ''} onChange={set('cRole')} />
        <input style={inp} placeholder="Phone" value={f.cPhone ?? ''} onChange={set('cPhone')} />
        <input style={inp} placeholder="Email" value={f.cEmail ?? ''} onChange={set('cEmail')} />
      </div>
      <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} disabled={busy}
        onClick={() => onSubmit({
          label: f.label || 'Main site', addressLine1: f.addressLine1, addressLine2: f.addressLine2,
          city: f.city, postcode: f.postcode, country: f.country, accessNotes: f.accessNotes,
          contacts: f.cName ? [{ name: f.cName, role: f.cRole, phone: f.cPhone, email: f.cEmail, isPrimary: true }] : [],
        })}>
        Save address
      </button>
    </div>
  )
}

function DeliveryForm({ busy, artisans, locations, onSubmit }: {
  busy: boolean
  artisans: { id: string; name: string }[]
  locations: { id: string; label: string }[]
  onSubmit: (p: Record<string, unknown>) => void
}) {
  const [originType, setOriginType] = useState<'consolidated' | 'direct_maker'>('consolidated')
  const [manufacturerId, setManufacturerId] = useState('')
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '')
  const [carrier, setCarrier] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  return (
    <div style={{ border: '1px dashed var(--light-line)', padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
        <div>
          <div className="form-label">Origin</div>
          <select style={inp} value={originType} onChange={e => setOriginType(e.target.value as 'consolidated' | 'direct_maker')}>
            <option value="consolidated">Consolidated via FBA</option>
            <option value="direct_maker">Direct from maker</option>
          </select>
        </div>
        {originType === 'direct_maker' && (
          <div>
            <div className="form-label">Maker</div>
            <select style={inp} value={manufacturerId} onChange={e => setManufacturerId(e.target.value)}>
              <option value="">— select maker —</option>
              {artisans.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <div className="form-label">Deliver to</div>
          <select style={inp} value={locationId} onChange={e => setLocationId(e.target.value)}>
            {locations.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <div className="form-label">Carrier (optional)</div>
          <input style={inp} value={carrier} onChange={e => setCarrier(e.target.value)} />
        </div>
        <div>
          <div className="form-label">Expected date</div>
          <input style={inp} type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }}
        disabled={busy || !locationId || (originType === 'direct_maker' && !manufacturerId)}
        onClick={() => onSubmit({
          originType, originManufacturerId: manufacturerId || null, deliveryLocationId: locationId,
          carrier: carrier || null, expectedDate: expectedDate || null,
        })}>
        Create delivery
      </button>
    </div>
  )
}

function InstallationForm({ busy, deliveries, onSubmit }: {
  busy: boolean
  deliveries: { id: string; number: string }[]
  onSubmit: (p: Record<string, unknown>) => void
}) {
  const [f, setF] = useState<Record<string, string>>({})
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(v => ({ ...v, [k]: e.target.value }))
  return (
    <div style={{ border: '1px dashed var(--light-line)', padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
        <div><div className="form-label">Scheduled date</div><input style={inp} type="date" value={f.scheduledDate ?? ''} onChange={set('scheduledDate')} /></div>
        <div><div className="form-label">Installer</div><input style={inp} value={f.installerName ?? ''} onChange={set('installerName')} /></div>
        <div><div className="form-label">Installer contact</div><input style={inp} value={f.installerContact ?? ''} onChange={set('installerContact')} /></div>
        <div>
          <div className="form-label">Linked delivery</div>
          <select style={inp} value={f.linkedDeliveryId ?? ''} onChange={set('linkedDeliveryId')}>
            <option value="">— none —</option>
            {deliveries.map(d => <option key={d.id} value={d.id}>{d.number}</option>)}
          </select>
        </div>
      </div>
      <textarea style={{ ...inp, marginTop: 10, minHeight: 44 }} placeholder="Access notes" value={f.accessNotes ?? ''} onChange={set('accessNotes')} />
      <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} disabled={busy}
        onClick={() => onSubmit({
          scheduledDate: f.scheduledDate || null, installerName: f.installerName || null,
          installerContact: f.installerContact || null, accessNotes: f.accessNotes || null,
          linkedDeliveryId: f.linkedDeliveryId || null,
        })}>
        Create installation
      </button>
    </div>
  )
}

const INSTALL_NEXT: Record<string, string[]> = {
  not_required: ['to_schedule'],
  to_schedule: ['not_required', 'scheduled'],
  scheduled: ['to_schedule', 'in_progress'],
  in_progress: ['completed', 'snagging'],
  snagging: ['completed', 'in_progress'],
  completed: ['snagging'],
}

function InstallationRow({ ins, busy, canManage, api }: {
  ins: Record<string, unknown>; busy: boolean; canManage: boolean
  api: (url: string, method: string, body?: Record<string, unknown>) => Promise<{ success: boolean }>
}) {
  const status = ins.status as string
  const linked = (ins.linked_delivery ?? null) as { delivery_number?: string } | null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, padding: '8px 12px', border: '1px solid var(--light-line)', marginBottom: 6, flexWrap: 'wrap' }}>
      <strong style={{ color: 'var(--forest)', minWidth: 150 }}>{ins.installation_number as string}</strong>
      <span className="status-pill" style={pill}>{status.replace(/_/g, ' ')}</span>
      <span style={{ color: 'var(--stone)', fontSize: 12 }}>
        {ins.scheduled_date ? `scheduled ${ins.scheduled_date}` : 'not scheduled'}
        {ins.installer_name ? ` · ${ins.installer_name}` : ''}
        {linked?.delivery_number ? ` · ${linked.delivery_number}` : ''}
        {ins.signed_off_by ? ` · signed off by ${ins.signed_off_by}` : ''}
      </span>
      <span style={{ flex: 1 }} />
      {canManage && (INSTALL_NEXT[status] ?? []).map(nxt => (
        <button key={nxt} className="btn btn-ghost btn-sm" disabled={busy}
          onClick={async () => {
            const body: Record<string, unknown> = { status: nxt }
            if (nxt === 'completed') {
              const name = prompt('Sign-off name (who signed off the installation)?')
              if (!name) return
              body.signedOffBy = name
              const notes = prompt('Completion notes (optional)?')
              if (notes) body.completionNotes = notes
            }
            await api(`/api/admin/installations/${ins.id}`, 'PATCH', body)
          }}>
          → {nxt.replace(/_/g, ' ')}
        </button>
      ))}
    </div>
  )
}
