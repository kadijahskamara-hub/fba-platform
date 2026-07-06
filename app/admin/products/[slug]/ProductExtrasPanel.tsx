'use client'

import { useState, useEffect, useCallback } from 'react'

// ============================================================
// Product extras manager (admin brief §6): Documents (upload or
// URL) / Hard finishes / Upholstery / Sizes / Fulfilment fields.
// Rendered below AdminProductForm on the product edit page.
// ============================================================

interface DocRow {
  id: string
  document_type: string
  label: string | null
  url: string
  file_name: string | null
}

interface FinishRow {
  id: string
  finish_category: string
  finish_name: string
  finish_code: string | null
  colour: string | null
  swatch_url: string | null
  com_accepted: boolean | null
  rub_count: number | null
  fire_treatment: string | null
  availability: string
}

interface VariantRow {
  id: string
  variant_name: string
  lead_time_override: string | null
  availability: string
}

interface Fulfilment {
  technicalDescription: string
  customisationNote: string
  madeToOrder: boolean
  dispatchTimeLabel: string
  leadTime: string
  shippingNotes: string
  publicBrandVisible: boolean
}

const DOC_TYPE_OPTIONS = [
  { value: 'product_specification', label: 'Product Specification' },
  { value: 'upholstery_program',    label: 'Upholstery Program' },
  { value: 'material_finishes',     label: 'Material & Finishes' },
  { value: 'tear_sheet',            label: 'Tear Sheet' },
  { value: 'technical_passport',    label: 'Technical Passport™' },
  { value: 'care_maintenance',      label: 'Care & Maintenance' },
  { value: 'installation_guide',    label: 'Installation Guide' },
  { value: 'warranty',              label: 'Warranty' },
]

const TABS = ['Documents', 'Hard finishes', 'Upholstery', 'Sizes', 'Fulfilment'] as const

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid var(--light-line)', borderRadius: 4,
  fontSize: 13, background: 'var(--warm-white)', color: 'var(--forest)',
}

export default function ProductExtrasPanel({ productId, slug, initialFulfilment }: {
  productId: string
  slug: string
  initialFulfilment: Fulfilment
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Documents')
  const [docs, setDocs] = useState<DocRow[]>([])
  const [finishes, setFinishes] = useState<FinishRow[]>([])
  const [variants, setVariants] = useState<VariantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/products/${productId}/extras`)
      const json = await res.json()
      if (json.success) {
        setDocs(json.documents)
        setFinishes(json.finishes)
        setVariants(json.variants)
      }
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => { load() }, [load])

  function flash(text: string) {
    setMsg(text)
    setTimeout(() => setMsg(''), 3500)
  }

  async function mutate(kind: string, action: string, id?: string, data?: Record<string, unknown>) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/products/${productId}/extras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, action, id, data }),
      })
      const json = await res.json()
      if (!json.success) alert(json.error ?? 'Action failed')
      else await load()
    } catch {
      alert('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 32, background: 'var(--warm-white)', border: '1px solid var(--light-line)' }}>
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--light-line)', padding: '0 16px' }}>
        {TABS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: '12px 16px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === t ? '2px solid var(--caramel, #a05a2c)' : '2px solid transparent',
              fontWeight: tab === t ? 600 : 400, color: 'var(--forest)',
            }}
          >
            {t}
            {t === 'Documents' && docs.length > 0 && ` (${docs.length})`}
            {t === 'Hard finishes' && finishes.filter(f => f.finish_category === 'hard_finish').length > 0 && ` (${finishes.filter(f => f.finish_category === 'hard_finish').length})`}
            {t === 'Upholstery' && finishes.filter(f => f.finish_category === 'upholstery').length > 0 && ` (${finishes.filter(f => f.finish_category === 'upholstery').length})`}
            {t === 'Sizes' && variants.length > 0 && ` (${variants.length})`}
          </button>
        ))}
      </div>

      <div style={{ padding: 20 }}>
        {msg && (
          <div style={{ marginBottom: 14, padding: '8px 12px', background: '#DCFCE7', color: '#166534', fontSize: 13, borderRadius: 4 }}>
            {msg}
          </div>
        )}
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--stone)' }}>Loading…</p>
        ) : tab === 'Documents' ? (
          <DocumentsTab productId={productId} docs={docs} busy={busy} mutate={mutate} reload={load} flash={flash} />
        ) : tab === 'Hard finishes' ? (
          <FinishesTab category="hard_finish" finishes={finishes.filter(f => f.finish_category === 'hard_finish')} busy={busy} mutate={mutate} />
        ) : tab === 'Upholstery' ? (
          <FinishesTab category="upholstery" finishes={finishes.filter(f => f.finish_category === 'upholstery')} busy={busy} mutate={mutate} />
        ) : tab === 'Sizes' ? (
          <SizesTab variants={variants} busy={busy} mutate={mutate} />
        ) : (
          <FulfilmentTab slug={slug} initial={initialFulfilment} flash={flash} />
        )}
      </div>
    </div>
  )
}

// ── Documents ────────────────────────────────────────────────

function DocumentsTab({ productId, docs, busy, mutate, reload, flash }: {
  productId: string
  docs: DocRow[]
  busy: boolean
  mutate: (kind: string, action: string, id?: string, data?: Record<string, unknown>) => Promise<void>
  reload: () => Promise<void>
  flash: (t: string) => void
}) {
  const [docType, setDocType] = useState('product_specification')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  async function addByUrl() {
    if (!url.trim().startsWith('https://')) { alert('Paste a full https:// URL.'); return }
    await mutate('document', 'create', undefined, { document_type: docType, url: url.trim() })
    setUrl('')
  }

  async function upload() {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('documentType', docType)
      const res = await fetch(`/api/admin/products/${productId}/documents/upload`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!json.success) alert(json.error ?? 'Upload failed')
      else {
        setFile(null)
        await reload()
        flash('Document uploaded.')
      }
    } catch {
      alert('Network error — please try again.')
    } finally {
      setUploading(false)
    }
  }

  const typeLabel = (t: string) => DOC_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t

  return (
    <div>
      {docs.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 16 }}>
          No documents yet. The public page only shows download buttons for documents that exist here.
        </p>
      ) : (
        <table className="data-table" style={{ fontSize: 13, marginBottom: 18 }}>
          <thead><tr><th>Type</th><th>File / URL</th><th></th></tr></thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{typeLabel(d.document_type)}</td>
                <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--caramel)' }}>
                    {d.file_name ?? d.url}
                  </a>
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" disabled={busy}
                    onClick={() => { if (confirm('Remove this document from the product?')) mutate('document', 'delete', d.id) }}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select value={docType} onChange={e => setDocType(e.target.value)} style={inputStyle} aria-label="Document type">
          {DOC_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          type="url" placeholder="https://… (paste external URL)" value={url}
          onChange={e => setUrl(e.target.value)} style={{ ...inputStyle, minWidth: 260, flex: '1 1 260px' }}
          aria-label="Document URL"
        />
        <button className="btn btn-secondary btn-sm" disabled={busy || !url.trim()} onClick={addByUrl}>Add URL</button>
        <span style={{ fontSize: 12, color: 'var(--stone)' }}>or</span>
        <input
          type="file" accept=".pdf,.doc,.docx,.xls,.xlsx"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          style={{ fontSize: 12 }} aria-label="Upload document file"
        />
        <button className="btn btn-primary btn-sm" disabled={uploading || !file} onClick={upload}>
          {uploading ? 'Uploading…' : 'Upload file'}
        </button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--stone)', marginTop: 8 }}>PDF, Word, or Excel · max 15 MB · stored in Supabase Storage.</p>
    </div>
  )
}

// ── Finishes (hard + upholstery share this) ──────────────────

function FinishesTab({ category, finishes, busy, mutate }: {
  category: 'hard_finish' | 'upholstery'
  finishes: FinishRow[]
  busy: boolean
  mutate: (kind: string, action: string, id?: string, data?: Record<string, unknown>) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [colour, setColour] = useState('')
  const [swatch, setSwatch] = useState('')
  const [com, setCom] = useState(false)
  const [rub, setRub] = useState('')

  async function add() {
    if (!name.trim()) { alert('Finish name is required.'); return }
    const data: Record<string, unknown> = {
      finish_category: category,
      finish_name: name.trim().slice(0, 120),
      finish_code: code.trim().slice(0, 60) || null,
      colour: colour.trim().slice(0, 60) || null,
      swatch_url: swatch.trim().startsWith('https://') ? swatch.trim() : null,
    }
    if (category === 'upholstery') {
      data.com_accepted = com
      data.rub_count = rub ? Math.max(0, parseInt(rub, 10) || 0) : null
    }
    await mutate('finish', 'create', undefined, data)
    setName(''); setCode(''); setColour(''); setSwatch(''); setCom(false); setRub('')
  }

  return (
    <div>
      {finishes.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 16 }}>
          No {category === 'hard_finish' ? 'hard finish' : 'upholstery'} options yet — the section is hidden on the public page until options exist.
        </p>
      ) : (
        <table className="data-table" style={{ fontSize: 13, marginBottom: 18 }}>
          <thead><tr><th>Name</th><th>Code</th>{category === 'upholstery' && <th>COM / Rubs</th>}<th>Available</th><th></th></tr></thead>
          <tbody>
            {finishes.map(f => (
              <tr key={f.id}>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {f.swatch_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={f.swatch_url} alt="" width={18} height={18} style={{ objectFit: 'cover', borderRadius: 2 }} />
                      : f.colour
                        ? <span style={{ width: 14, height: 14, borderRadius: 2, background: f.colour, border: '1px solid rgba(0,0,0,0.15)' }} />
                        : null}
                    {f.finish_name}
                  </span>
                </td>
                <td style={{ color: 'var(--stone)' }}>{f.finish_code ?? '—'}</td>
                {category === 'upholstery' && (
                  <td style={{ fontSize: 12, color: 'var(--stone)' }}>
                    {[f.com_accepted ? 'COM' : null, f.rub_count ? `${f.rub_count.toLocaleString()} rubs` : null].filter(Boolean).join(' · ') || '—'}
                  </td>
                )}
                <td>
                  <button className="btn btn-ghost btn-sm" disabled={busy}
                    onClick={() => mutate('finish', 'update', f.id, { availability: f.availability === 'available' ? 'unavailable' : 'available' })}>
                    {f.availability === 'available' ? 'Yes — mark unavailable' : 'No — mark available'}
                  </button>
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" disabled={busy}
                    onClick={() => { if (confirm(`Remove finish "${f.finish_name}"?`)) mutate('finish', 'delete', f.id) }}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input placeholder="Finish name *" value={name} onChange={e => setName(e.target.value)} style={{ ...inputStyle, width: 170 }} />
        <input placeholder="Code" value={code} onChange={e => setCode(e.target.value)} style={{ ...inputStyle, width: 90 }} />
        <input placeholder="Colour (CSS or name)" value={colour} onChange={e => setColour(e.target.value)} style={{ ...inputStyle, width: 150 }} />
        <input placeholder="Swatch image URL" value={swatch} onChange={e => setSwatch(e.target.value)} style={{ ...inputStyle, width: 190 }} />
        {category === 'upholstery' && (
          <>
            <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <input type="checkbox" checked={com} onChange={e => setCom(e.target.checked)} /> COM
            </label>
            <input placeholder="Rub count" type="number" value={rub} onChange={e => setRub(e.target.value)} style={{ ...inputStyle, width: 100 }} />
          </>
        )}
        <button className="btn btn-primary btn-sm" disabled={busy || !name.trim()} onClick={add}>Add option</button>
      </div>
    </div>
  )
}

// ── Sizes / variants ─────────────────────────────────────────

function SizesTab({ variants, busy, mutate }: {
  variants: VariantRow[]
  busy: boolean
  mutate: (kind: string, action: string, id?: string, data?: Record<string, unknown>) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [lead, setLead] = useState('')

  async function add() {
    if (!name.trim()) { alert('Size name is required (e.g. "245cm x 108cm").'); return }
    await mutate('variant', 'create', undefined, {
      variant_name: name.trim().slice(0, 120),
      lead_time_override: lead.trim().slice(0, 80) || null,
    })
    setName(''); setLead('')
  }

  return (
    <div>
      {variants.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 16 }}>
          No size options yet — the Size selector is hidden on the public page until sizes exist.
        </p>
      ) : (
        <table className="data-table" style={{ fontSize: 13, marginBottom: 18 }}>
          <thead><tr><th>Size</th><th>Lead time override</th><th>Available</th><th></th></tr></thead>
          <tbody>
            {variants.map(v => (
              <tr key={v.id}>
                <td>{v.variant_name}</td>
                <td style={{ color: 'var(--stone)' }}>{v.lead_time_override ?? '—'}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" disabled={busy}
                    onClick={() => mutate('variant', 'update', v.id, { availability: v.availability === 'available' ? 'unavailable' : 'available' })}>
                    {v.availability === 'available' ? 'Yes — mark unavailable' : 'No — mark available'}
                  </button>
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" disabled={busy}
                    onClick={() => { if (confirm(`Remove size "${v.variant_name}"?`)) mutate('variant', 'delete', v.id) }}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input placeholder='Size label * (e.g. "245cm x 108cm")' value={name} onChange={e => setName(e.target.value)} style={{ ...inputStyle, width: 230 }} />
        <input placeholder="Lead time override (optional)" value={lead} onChange={e => setLead(e.target.value)} style={{ ...inputStyle, width: 200 }} />
        <button className="btn btn-primary btn-sm" disabled={busy || !name.trim()} onClick={add}>Add size</button>
      </div>
    </div>
  )
}

// ── Fulfilment / content fields (PATCH /api/products/[slug]) ─

function FulfilmentTab({ slug, initial, flash }: { slug: string; initial: Fulfilment; flash: (t: string) => void }) {
  const [f, setF] = useState<Fulfilment>(initial)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/products/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          technicalDescription: f.technicalDescription || null,
          customisationNote: f.customisationNote || null,
          madeToOrder: f.madeToOrder,
          dispatchTimeLabel: f.dispatchTimeLabel || null,
          leadTime: f.leadTime || null,
          shippingNotes: f.shippingNotes || null,
          publicBrandVisible: f.publicBrandVisible,
        }),
      })
      const json = await res.json()
      if (!json.success) alert(json.error ?? 'Save failed')
      else flash('Fulfilment details saved.')
    } catch {
      alert('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const fieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--forest)', display: 'block', marginBottom: 5 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <div>
        <label style={fieldLabel}>Technical description <span style={{ fontWeight: 400, color: 'var(--stone)' }}>(shown as &quot;Technical description&quot; on the product page)</span></label>
        <textarea rows={5} value={f.technicalDescription} onChange={e => setF({ ...f, technicalDescription: e.target.value })} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
      </div>
      <div>
        <label style={fieldLabel}>Customisation note <span style={{ fontWeight: 400, color: 'var(--stone)' }}>(leave blank for the default copy)</span></label>
        <textarea rows={2} value={f.customisationNote} onChange={e => setF({ ...f, customisationNote: e.target.value })} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={f.madeToOrder} onChange={e => setF({ ...f, madeToOrder: e.target.checked })} />
          Made to order
        </label>
        <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={f.publicBrandVisible} onChange={e => setF({ ...f, publicBrandVisible: e.target.checked })} />
          Show artisan/brand name publicly
        </label>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <label style={fieldLabel}>Dispatch time label</label>
          <input placeholder="e.g. 4–6 weeks" value={f.dispatchTimeLabel} onChange={e => setF({ ...f, dispatchTimeLabel: e.target.value })} style={{ ...inputStyle, width: 180 }} />
        </div>
        <div>
          <label style={fieldLabel}>Lead time</label>
          <input placeholder="e.g. 6–8 weeks" value={f.leadTime} onChange={e => setF({ ...f, leadTime: e.target.value })} style={{ ...inputStyle, width: 180 }} />
        </div>
      </div>
      <div>
        <label style={fieldLabel}>Shipping notes <span style={{ fontWeight: 400, color: 'var(--stone)' }}>(leave blank for the default contact copy)</span></label>
        <textarea rows={2} value={f.shippingNotes} onChange={e => setF({ ...f, shippingNotes: e.target.value })} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
      </div>
      <div>
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save fulfilment details'}
        </button>
      </div>
    </div>
  )
}
