'use client'

// Finish library (Sprint 11): material types + reusable finishes that
// product finish groups draw from. Supplier fields here are internal.

import { useCallback, useEffect, useState } from 'react'

type MaterialType = { id: string; name: string; slug: string; sort_order: number; is_active: boolean }
type Finish = {
  id: string; name: string; code: string | null; hex_colour: string | null
  texture_storage_path: string | null; origin: string | null; supplier: string | null
  supplier_reference: string | null; description: string | null; technical_notes: string | null
  sample_available: boolean; is_active: boolean; sort_order: number
  material_type_id: string
  material_type?: { id: string; name: string; slug: string } | null
}

const inp: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--light-line)', background: '#fff', width: '100%' }

export default function FinishLibraryPage() {
  const [types, setTypes] = useState<MaterialType[]>([])
  const [finishes, setFinishes] = useState<Finish[]>([])
  const [filterType, setFilterType] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Finish | 'new' | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const [t, f] = await Promise.all([
      fetch('/api/admin/material-types').then(r => r.json()),
      fetch(`/api/admin/finishes${filterType ? `?materialType=${filterType}` : ''}`).then(r => r.json()),
    ])
    if (t.success) setTypes(t.data)
    if (f.success) setFinishes(f.data)
  }, [filterType])
  useEffect(() => { load() }, [load])

  const visible = finishes.filter(f => showInactive || f.is_active)

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Finish Library</h1>
          <p className="admin-subtitle">Reusable materials & finishes — assign them to products as curated finish options</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>New finish</button>
      </div>

      {msg && <p style={{ color: '#1e7e34', fontSize: 13 }}>{msg}</p>}
      {err && <p style={{ color: '#a33', fontSize: 13 }}>{err}</p>}

      <MaterialTypesPanel types={types} onChanged={load} setErr={setErr} />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '24px 0 12px', flexWrap: 'wrap' }}>
        <select style={{ ...inp, width: 'auto' }} value={filterType} onChange={e => setFilterType(e.target.value)} aria-label="Filter by material type">
          <option value="">All material types</option>
          {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show archived
        </label>
        <span style={{ fontSize: 12.5, color: 'var(--stone)' }}>{visible.length} finishes</span>
      </div>

      <div className="table-scroll">
        <table className="data-table" style={{ fontSize: 13 }}>
          <thead>
            <tr><th>Swatch</th><th>Name</th><th>Code</th><th>Material</th><th>Origin</th><th>Supplier (internal)</th><th>Sample</th><th></th></tr>
          </thead>
          <tbody>
            {visible.map(f => (
              <tr key={f.id} style={{ opacity: f.is_active ? 1 : 0.45 }}>
                <td><Swatch finish={f} /></td>
                <td style={{ fontWeight: 500 }}>{f.name}</td>
                <td>{f.code ?? '—'}</td>
                <td>{f.material_type?.name ?? '—'}</td>
                <td>{f.origin ?? '—'}</td>
                <td>{f.supplier ?? '—'}{f.supplier_reference ? ` · ${f.supplier_reference}` : ''}</td>
                <td>{f.sample_available ? 'Yes' : '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(f)}>Edit</button>
                  {f.is_active && (
                    <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} onClick={async () => {
                      const res = await fetch(`/api/admin/finishes/${f.id}`, { method: 'DELETE' }).then(r => r.json())
                      if (!res.success) setErr(res.error); else { setMsg('Finish archived.'); load() }
                    }}>Archive</button>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--stone)', padding: 32 }}>No finishes yet — create the first one.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <FinishModal
          finish={editing === 'new' ? null : editing}
          types={types}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg('Saved.'); load() }}
        />
      )}
    </>
  )
}

function textureUrl(path: string | null): string | null {
  if (!path) return null
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  return base ? `${base}/storage/v1/object/public/product-media/${path}` : null
}

function Swatch({ finish }: { finish: Finish }) {
  const url = textureUrl(finish.texture_storage_path)
  return url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={url} alt={`${finish.name} texture`} style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--light-line)' }} />
    : <span aria-label={finish.hex_colour ? `Colour ${finish.hex_colour}` : 'No swatch'} style={{
        display: 'inline-block', width: 34, height: 34, borderRadius: '50%',
        background: finish.hex_colour ?? '#EDEAE3', border: '1px solid var(--light-line)',
      }} />
}

function MaterialTypesPanel({ types, onChanged, setErr }: { types: MaterialType[]; onChanged: () => void; setErr: (s: string) => void }) {
  const [name, setName] = useState('')
  return (
    <div className="admin-card" style={{ padding: 16 }}>
      <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 10 }}>Material types (drives the public Finish Type filter)</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {types.map(t => (
          <button key={t.id} className="btn btn-ghost btn-sm" title={t.is_active ? 'Click to deactivate' : 'Click to activate'}
            style={{ border: '1px solid var(--light-line)', opacity: t.is_active ? 1 : 0.45 }}
            onClick={async () => {
              const res = await fetch(`/api/admin/material-types/${t.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !t.is_active }),
              }).then(r => r.json())
              if (!res.success) setErr(res.error); else onChanged()
            }}>
            {t.name}{t.is_active ? '' : ' (off)'}
          </button>
        ))}
        <input style={{ ...inp, width: 180 }} placeholder="New material type…" value={name} onChange={e => setName(e.target.value)} />
        <button className="btn btn-secondary btn-sm" disabled={!name.trim()} onClick={async () => {
          const res = await fetch('/api/admin/material-types', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), sortOrder: (types.length + 1) * 10 }),
          }).then(r => r.json())
          if (!res.success) setErr(res.error); else { setName(''); onChanged() }
        }}>Add</button>
      </div>
    </div>
  )
}

function FinishModal({ finish, types, onClose, onSaved }: {
  finish: Finish | null; types: MaterialType[]; onClose: () => void; onSaved: () => void
}) {
  const [f, setF] = useState({
    name: finish?.name ?? '',
    code: finish?.code ?? '',
    materialTypeId: finish?.material_type_id ?? (types[0]?.id ?? ''),
    hexColour: finish?.hex_colour ?? '',
    origin: finish?.origin ?? '',
    supplier: finish?.supplier ?? '',
    supplierReference: finish?.supplier_reference ?? '',
    description: finish?.description ?? '',
    technicalNotes: finish?.technical_notes ?? '',
    sampleAvailable: finish?.sample_available ?? false,
  })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(v => ({ ...v, [k]: e.target.value }))

  const save = async () => {
    setErr('')
    if (!f.name.trim() || !f.materialTypeId) { setErr('Name and material type are required.'); return }
    setBusy(true)
    try {
      const url = finish ? `/api/admin/finishes/${finish.id}` : '/api/admin/finishes'
      const res = await fetch(url, {
        method: finish ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, hexColour: f.hexColour || undefined }),
      }).then(r => r.json())
      if (!res.success) { setErr(res.error); setBusy(false); return }
      const id = res.data.id as string
      if (file) {
        const fd = new FormData(); fd.append('file', file)
        const up = await fetch(`/api/admin/finishes/${id}/texture`, { method: 'POST', body: fd }).then(r => r.json())
        if (!up.success) { setErr(`Saved, but the texture upload failed: ${up.error}`); setBusy(false); return }
      }
      onSaved()
    } catch { setErr('Request failed.') }
    setBusy(false)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={finish ? 'Edit finish' : 'New finish'} style={{
      position: 'fixed', inset: 0, background: 'rgba(24,32,26,0.45)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{ background: 'var(--cream, #F7F3EE)', maxWidth: 560, width: '100%', padding: 24, borderRadius: 4, maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>{finish ? `Edit ${finish.name}` : 'New finish'}</h2>
        {err && <p style={{ color: '#a33', fontSize: 13 }}>{err}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ fontSize: 12.5 }}>Name<input style={inp} value={f.name} onChange={set('name')} /></label>
          <label style={{ fontSize: 12.5 }}>Code<input style={inp} value={f.code} onChange={set('code')} placeholder="e.g. CAL-ORO" /></label>
          <label style={{ fontSize: 12.5 }}>Material type
            <select style={inp} value={f.materialTypeId} onChange={set('materialTypeId')}>
              {types.filter(t => t.is_active || t.id === f.materialTypeId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12.5 }}>Hex colour (swatch fallback)<input style={inp} value={f.hexColour} onChange={set('hexColour')} placeholder="#C4A882" /></label>
          <label style={{ fontSize: 12.5 }}>Origin<input style={inp} value={f.origin} onChange={set('origin')} placeholder="Carrara, Italy" /></label>
          <label style={{ fontSize: 12.5 }}>Texture image<input type="file" accept="image/jpeg,image/png,image/webp" style={{ fontSize: 12 }} onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
          <label style={{ fontSize: 12.5 }}>Supplier (internal)<input style={inp} value={f.supplier} onChange={set('supplier')} /></label>
          <label style={{ fontSize: 12.5 }}>Supplier ref (internal)<input style={inp} value={f.supplierReference} onChange={set('supplierReference')} /></label>
        </div>
        <label style={{ fontSize: 12.5, display: 'block', marginTop: 12 }}>Description (public)
          <textarea style={{ ...inp, minHeight: 60 }} value={f.description} onChange={set('description')} />
        </label>
        <label style={{ fontSize: 12.5, display: 'block', marginTop: 12 }}>Technical notes
          <textarea style={{ ...inp, minHeight: 60 }} value={f.technicalNotes} onChange={set('technicalNotes')} />
        </label>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', marginTop: 12 }}>
          <input type="checkbox" checked={f.sampleAvailable} onChange={e => setF(v => ({ ...v, sampleAvailable: e.target.checked }))} />
          Physical sample available
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save finish'}</button>
        </div>
      </div>
    </div>
  )
}
