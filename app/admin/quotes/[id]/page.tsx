'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { PROFORMA_STAGES, LOST_REASONS, stageLabel } from '@/lib/pipeline'

type Manu = { id: string; name: string } | null
type Item = {
  id: string; product_id: string | null; is_bespoke: boolean; name: string; description: string | null
  manufacturer_id: string | null; manufacturer_name: string | null; manufacturer: Manu
  quantity: number; unit_price: number | null; selected_finish: string | null
  selected_fabric: string | null; selected_size: string | null; notes: string | null; sort_order: number
}
type Send = { id: string; send_type: string; manufacturer_id: string | null; manufacturer_name: string | null; recipient_email: string | null; note: string | null; sent_at: string; manufacturer: Manu }
type Contact = { id: string; first_name: string | null; last_name: string | null; email: string; role: string } | null
type Proforma = {
  id: string; proforma_number: string; stage: string; lost_reason: string | null
  client_name: string | null; client_email: string | null; client_company: string | null
  project_name: string | null; project_location: string | null; currency: string
  notes: string | null; admin_notes: string | null; valid_until: string | null
  quote_request_id: string | null; contact_user_id: string | null
  items: Item[]; sends: Send[]; contact: Contact
}

function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }
function money(n: number | null, cur: string) { return n == null ? '—' : `${sym(cur)}${Number(n).toLocaleString('en-GB')}` }

export default function ProformaEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [pf, setPf] = useState<Proforma | null>(null)
  const [loading, setLoading] = useState(true)
  const [artisans, setArtisans] = useState<{ id: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)

  // product search
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; trade_price: number | null }[]>([])
  // bespoke form
  const [bespoke, setBespoke] = useState({ name: '', manufacturerName: '', unitPrice: '', quantity: '1' })
  const [showBespoke, setShowBespoke] = useState(false)
  // send modal
  const [sendFor, setSendFor] = useState<{ type: 'client' | 'manufacturer'; manufacturerId?: string | null; manufacturerName?: string; email: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/proformas/${id}`).then(r => r.json())
    if (res.success) setPf(res.data)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { fetch('/api/admin/artisans').then(r => r.json()).then(d => setArtisans(d.data ?? [])) }, [])

  const cur = pf?.currency ?? 'GBP'
  const total = (pf?.items ?? []).reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 0), 0)

  const patchHeader = async (patch: Record<string, unknown>) => {
    setBusy(true)
    const res = await fetch(`/api/admin/proformas/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).then(r => r.json())
    setBusy(false)
    if (!res.success) { alert(res.error ?? 'Update failed'); return false }
    await load(); return true
  }

  const changeStage = async (stage: string) => {
    if (stage === 'lost') {
      const reason = prompt(`Reason for marking Lost?\nOne of: ${LOST_REASONS.map(r => r.key).join(', ')}`, 'price')
      if (!reason) return
      await patchHeader({ stage, lostReason: reason })
    } else {
      await patchHeader({ stage })
    }
  }

  const searchProducts = async (term: string) => {
    setQ(term)
    if (term.trim().length < 2) { setResults([]); return }
    const res = await fetch(`/api/products?q=${encodeURIComponent(term)}&limit=8`).then(r => r.json())
    setResults((res.data ?? []).map((p: Record<string, unknown>) => ({ id: p.id as string, name: p.name as string, trade_price: (p.trade_price as number) ?? null })))
  }

  const addProduct = async (productId: string) => {
    setBusy(true)
    await fetch(`/api/admin/proformas/${id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId }) })
    setBusy(false); setQ(''); setResults([]); load()
  }

  const addBespoke = async () => {
    if (!bespoke.name.trim()) { alert('Name required'); return }
    setBusy(true)
    await fetch(`/api/admin/proformas/${id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: bespoke.name, manufacturerName: bespoke.manufacturerName || null, unitPrice: bespoke.unitPrice ? parseFloat(bespoke.unitPrice) : null, quantity: parseFloat(bespoke.quantity) || 1 }) })
    setBusy(false); setBespoke({ name: '', manufacturerName: '', unitPrice: '', quantity: '1' }); setShowBespoke(false); load()
  }

  const updateItem = async (itemId: string, patch: Record<string, unknown>) => {
    await fetch(`/api/admin/proformas/${id}/items/${itemId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    load()
  }
  const deleteItem = async (itemId: string) => {
    if (!confirm('Remove this line?')) return
    await fetch(`/api/admin/proformas/${id}/items/${itemId}`, { method: 'DELETE' })
    load()
  }

  const doSend = async () => {
    if (!sendFor) return
    setBusy(true)
    const res = await fetch(`/api/admin/proformas/${id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sendType: sendFor.type, manufacturerId: sendFor.manufacturerId ?? null, manufacturerName: sendFor.manufacturerName ?? null, recipientEmail: sendFor.email || null }) }).then(r => r.json())
    setBusy(false)
    if (!res.success) { alert(res.error ?? 'Send failed'); return }
    setSendFor(null)
    alert(res.emailed ? 'Recorded and emailed.' : 'Send recorded (no email — add a recipient or configure email).')
    load()
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--stone)' }}>Loading…</div>
  if (!pf) return <div style={{ padding: 60, textAlign: 'center' }}>Proforma not found. <Link href="/admin/quotes">Back</Link></div>

  // Group items by manufacturer for the split/send section.
  const groups = new Map<string, { key: string; name: string; manufacturerId: string | null; items: Item[]; subtotal: number }>()
  for (const it of pf.items ?? []) {
    const name = it.manufacturer?.name ?? it.manufacturer_name ?? 'Unassigned'
    const key = it.manufacturer_id ?? (it.manufacturer_name ? `n:${it.manufacturer_name}` : 'unassigned')
    if (!groups.has(key)) groups.set(key, { key, name, manufacturerId: it.manufacturer_id, items: [], subtotal: 0 })
    const g = groups.get(key)!
    g.items.push(it); g.subtotal += (Number(it.unit_price) || 0) * (Number(it.quantity) || 0)
  }
  const manuGroups = [...groups.values()]

  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--forest, #2d3a2e)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--stone)' }
  const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--light-line)', fontSize: 13, verticalAlign: 'top' }
  const inp: React.CSSProperties = { width: '100%', border: '1px solid var(--light-line)', borderRadius: 4, padding: '4px 6px', fontSize: 13, background: 'var(--warm-white)' }

  return (
    <>
      <div className="admin-header">
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Link href="/admin/quotes" className="btn btn-ghost btn-sm">← Pipeline</Link>
            <h1 className="admin-title" style={{ margin: 0 }}>{pf.proforma_number}</h1>
            <span className={`status-pill status-${pf.stage}`}>{stageLabel(pf.stage)}{pf.stage === 'lost' && pf.lost_reason ? ` · ${pf.lost_reason}` : ''}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--stone)' }}>Stage</label>
          <select className="form-select" value={pf.stage} onChange={e => changeStage(e.target.value)} disabled={busy} style={{ fontSize: 13 }}>
            {PROFORMA_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Header / client + project */}
      <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Client name" value={pf.client_name} onSave={v => patchHeader({ clientName: v })} />
          <Field label="Client email" value={pf.client_email} onSave={v => patchHeader({ clientEmail: v })} />
          <Field label="Company" value={pf.client_company} onSave={v => patchHeader({ clientCompany: v })} />
          <Field label="Project" value={pf.project_name} onSave={v => patchHeader({ projectName: v })} />
          <Field label="Location" value={pf.project_location} onSave={v => patchHeader({ projectLocation: v })} />
          <Field label="Valid until" value={pf.valid_until} onSave={v => patchHeader({ validUntil: v })} placeholder="YYYY-MM-DD" />
        </div>
        {pf.contact && (
          <p style={{ marginTop: 14, fontSize: 12, color: 'var(--stone)' }}>
            Linked contact: <Link href="/admin/contacts" style={{ color: 'var(--forest)' }}>{pf.contact.first_name} {pf.contact.last_name} · {pf.contact.email}</Link>
          </p>
        )}
      </div>

      {/* Proforma line items */}
      <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="label">Line items</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Total: {money(total, cur)}</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Item</th><th style={th}>Manufacturer</th><th style={{ ...th, width: 70 }}>Qty</th>
            <th style={{ ...th, width: 110 }}>Unit ({sym(cur)})</th><th style={{ ...th, width: 90 }}>Line</th><th style={{ ...th, width: 40 }}></th>
          </tr></thead>
          <tbody>
            {(pf.items ?? []).map(it => (
              <tr key={it.id}>
                <td style={td}>
                  <div style={{ fontWeight: 500 }}>{it.name}{it.is_bespoke && <span style={{ fontSize: 10, color: 'var(--caramel)', marginLeft: 6 }}>BESPOKE</span>}</div>
                  {(it.selected_finish || it.selected_fabric || it.selected_size) && (
                    <div style={{ fontSize: 11, color: 'var(--stone)' }}>{[it.selected_finish, it.selected_fabric, it.selected_size].filter(Boolean).join(' · ')}</div>
                  )}
                </td>
                <td style={td}>
                  <select style={inp} value={it.manufacturer_id ?? ''} onChange={e => updateItem(it.id, { manufacturerId: e.target.value || null })}>
                    <option value="">{it.manufacturer_name ? `${it.manufacturer_name} (free-text)` : '— none —'}</option>
                    {artisans.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </td>
                <td style={td}><input style={inp} type="number" min={1} defaultValue={it.quantity} onBlur={e => { const v = parseFloat(e.target.value) || 1; if (v !== it.quantity) updateItem(it.id, { quantity: v }) }} /></td>
                <td style={td}><input style={inp} type="number" step="0.01" defaultValue={it.unit_price ?? ''} onBlur={e => { const v = e.target.value === '' ? null : parseFloat(e.target.value); if (v !== it.unit_price) updateItem(it.id, { unitPrice: v }) }} /></td>
                <td style={{ ...td, fontWeight: 500 }}>{money((Number(it.unit_price) || 0) * (Number(it.quantity) || 0), cur)}</td>
                <td style={td}><button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} onClick={() => deleteItem(it.id)}>✕</button></td>
              </tr>
            ))}
            {(pf.items ?? []).length === 0 && <tr><td style={td} colSpan={6}><span style={{ color: 'var(--stone)' }}>No items yet — add a catalogue product or a bespoke line below.</span></td></tr>}
          </tbody>
        </table>

        {/* Add product / bespoke */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--light-line)' }}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <input style={{ ...inp, maxWidth: 420 }} placeholder="Search catalogue to add a product…" value={q} onChange={e => searchProducts(e.target.value)} />
            {results.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 20, background: 'var(--warm-white)', border: '1px solid var(--light-line)', maxWidth: 420, width: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
                {results.map(r => (
                  <button key={r.id} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }} onClick={() => addProduct(r.id)}>
                    {r.name} <span style={{ color: 'var(--stone)' }}>· trade {money(r.trade_price, cur)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {!showBespoke ? (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowBespoke(true)}>+ Add bespoke / off-catalogue item</button>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', background: 'var(--cream)', padding: 12, border: '1px solid var(--light-line)' }}>
              <div><div className="form-label">Name *</div><input style={{ ...inp, width: 200 }} value={bespoke.name} onChange={e => setBespoke(b => ({ ...b, name: e.target.value }))} /></div>
              <div><div className="form-label">Manufacturer</div><input style={{ ...inp, width: 160 }} value={bespoke.manufacturerName} onChange={e => setBespoke(b => ({ ...b, manufacturerName: e.target.value }))} placeholder="free text" /></div>
              <div><div className="form-label">Unit ({sym(cur)})</div><input style={{ ...inp, width: 100 }} type="number" step="0.01" value={bespoke.unitPrice} onChange={e => setBespoke(b => ({ ...b, unitPrice: e.target.value }))} /></div>
              <div><div className="form-label">Qty</div><input style={{ ...inp, width: 70 }} type="number" value={bespoke.quantity} onChange={e => setBespoke(b => ({ ...b, quantity: e.target.value }))} /></div>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={addBespoke}>Add</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowBespoke(false)}>Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Split by manufacturer + send */}
      <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="label">Send &amp; split by manufacturer</div>
          <button className="btn btn-primary btn-sm" onClick={() => setSendFor({ type: 'client', email: pf.client_email ?? '' })}>Send client copy →</button>
        </div>
        {manuGroups.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--stone)' }}>Add line items to split by manufacturer.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {manuGroups.map(g => (
              <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, padding: '8px 12px', border: '1px solid var(--light-line)' }}>
                <div style={{ flex: 1 }}><strong>{g.name}</strong> · {g.items.length} item{g.items.length !== 1 ? 's' : ''} · {money(g.subtotal, cur)}</div>
                <button className="btn btn-secondary btn-sm" disabled={g.manufacturerId === null && g.name === 'Unassigned'}
                  onClick={() => setSendFor({ type: 'manufacturer', manufacturerId: g.manufacturerId, manufacturerName: g.manufacturerId ? undefined : g.name, email: '' })}>
                  Send this manufacturer’s copy →
                </button>
              </div>
            ))}
          </div>
        )}

        {(pf.sends ?? []).length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--light-line)' }}>
            <div className="label" style={{ marginBottom: 8 }}>Send history</div>
            {(pf.sends ?? []).map(s => (
              <div key={s.id} style={{ fontSize: 12, color: 'var(--stone)', padding: '3px 0' }}>
                {new Date(s.sent_at).toLocaleString('en-GB')} · {s.send_type === 'client' ? 'Client copy' : `Manufacturer: ${s.manufacturer?.name ?? s.manufacturer_name ?? '—'}`}{s.recipient_email ? ` → ${s.recipient_email}` : ' (not emailed)'}
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} onClick={async () => { if (confirm(`Delete proforma ${pf.proforma_number}?`)) { await fetch(`/api/admin/proformas/${id}`, { method: 'DELETE' }); router.push('/admin/quotes') } }}>
        Delete proforma
      </button>

      {/* Send modal */}
      {sendFor && (
        <div className="modal-overlay" onClick={() => setSendFor(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h3 className="h3" style={{ marginBottom: 12 }}>{sendFor.type === 'client' ? 'Send client copy' : `Send ${sendFor.manufacturerName ?? 'manufacturer'} copy`}</h3>
            <p style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 12 }}>
              {sendFor.type === 'client' ? 'The full proforma with all line items.' : 'Only this manufacturer’s line items.'} Enter a recipient email to send now, or leave blank to just record the send.
            </p>
            <input style={{ ...inp, marginBottom: 16 }} type="email" placeholder="recipient@example.com" value={sendFor.email} onChange={e => setSendFor(s => s ? { ...s, email: e.target.value } : s)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={doSend}>{busy ? 'Sending…' : 'Record / Send'}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSendFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Inline-editable header field: click to edit, blur/Enter to save.
function Field({ label, value, onSave, placeholder }: { label: string; value: string | null; onSave: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => { setV(value ?? '') }, [value])
  return (
    <div>
      <div className="form-label">{label}</div>
      <input
        style={{ width: '100%', border: '1px solid var(--light-line)', borderRadius: 4, padding: '6px 8px', fontSize: 13, background: 'var(--warm-white)' }}
        value={v} placeholder={placeholder} onChange={e => setV(e.target.value)}
        onBlur={() => { if (v !== (value ?? '')) onSave(v) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </div>
  )
}
