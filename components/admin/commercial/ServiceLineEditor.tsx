'use client'

import { useEffect, useState } from 'react'
import { inp, sym } from './ui'

interface CatalogueService {
  id: string; code: string; name: string; description: string | null
  pricing_type: string; default_rate: number | null; default_unit: string | null
}

// Add a service line: catalogue service or authorised off-catalogue service.
export function ServiceLineEditor({ cur, canPrice, onAdd }: {
  cur: string
  canPrice: boolean
  onAdd: (payload: Record<string, unknown>) => Promise<void>
}) {
  const [services, setServices] = useState<CatalogueService[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ serviceId: '', name: '', description: '', rate: '', quantity: '1', unit: '' })

  useEffect(() => {
    if (open && services.length === 0) {
      fetch('/api/admin/commercial/services').then(r => r.json()).then(d => setServices(d.data ?? []))
    }
  }, [open, services.length])

  const selected = services.find(s => s.id === form.serviceId) ?? null

  const add = async () => {
    if (!form.serviceId && !form.name.trim()) { alert('Choose a catalogue service or name an off-catalogue service.'); return }
    setBusy(true)
    const payload: Record<string, unknown> = {
      lineType: 'service',
      quantity: parseFloat(form.quantity) || 1,
    }
    if (form.serviceId) payload.serviceCatalogueId = form.serviceId
    if (form.name.trim()) payload.name = form.name.trim()
    if (form.description.trim()) payload.description = form.description.trim()
    if (form.unit.trim()) payload.unitOfMeasure = form.unit.trim()
    if (canPrice && form.rate) { payload.sellingPriceUnit = parseFloat(form.rate); payload.pricingMethod = 'manual' }
    await onAdd(payload)
    setBusy(false)
    setForm({ serviceId: '', name: '', description: '', rate: '', quantity: '1', unit: '' })
    setOpen(false)
  }

  return (
    <div>
      <div className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Services</div>
      {!open ? (
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>+ Add service line</button>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', background: 'var(--cream)', padding: 12, border: '1px solid var(--light-line)' }}>
          <div>
            <div className="form-label">Catalogue service</div>
            <select style={{ ...inp, width: 230 }} value={form.serviceId}
              onChange={e => {
                const svc = services.find(s => s.id === e.target.value)
                setForm(f => ({
                  ...f, serviceId: e.target.value,
                  unit: svc?.default_unit ?? f.unit,
                  rate: svc?.default_rate != null ? String(svc.default_rate) : f.rate,
                }))
              }}>
              <option value="">— off-catalogue service —</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name} ({s.pricing_type})</option>)}
            </select>
          </div>
          <div><div className="form-label">{form.serviceId ? 'Name override' : 'Service name *'}</div>
            <input style={{ ...inp, width: 200 }} value={form.name} placeholder={selected?.name ?? 'e.g. Site survey'} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><div className="form-label">Description</div>
            <input style={{ ...inp, width: 240 }} value={form.description} placeholder={selected?.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          {canPrice && <div><div className="form-label">Rate ({sym(cur)})</div>
            <input style={{ ...inp, width: 90 }} type="number" step="0.01" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} /></div>}
          <div><div className="form-label">Qty / hours / days</div>
            <input style={{ ...inp, width: 90 }} type="number" step="0.5" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
          <div><div className="form-label">Unit</div>
            <input style={{ ...inp, width: 80 }} value={form.unit} placeholder="hour / day" onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} /></div>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={add}>Add</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      )}
    </div>
  )
}
