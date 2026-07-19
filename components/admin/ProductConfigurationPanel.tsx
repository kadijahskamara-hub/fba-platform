'use client'

// Product configuration panel (Sprint 11): four editors on the Sprint 10
// data model — Finish Groups (+options +compatibility), Media, Technical
// Passport, Spec Rows. All mutations re-fetch; admin APIs are no-store.

import { useCallback, useEffect, useState } from 'react'
import { appConfirm } from '@/lib/appConfirm'

type Tab = 'finishes' | 'media' | 'passport' | 'specs'
const inp: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--light-line)', background: '#fff' }

async function api(url: string, method: string, body?: unknown): Promise<{ success: boolean; error?: string; data?: unknown }> {
  const res = await fetch(url, {
    method,
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

export default function ProductConfigurationPanel({ productId }: { productId: string }) {
  const [tab, setTab] = useState<Tab>('finishes')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  // QA item 10: brief success indicator when rows are added/changed —
  // previously inputs silently reset with no confirmation at all.
  const flash = useCallback((text: string) => {
    setMsg(text)
    window.setTimeout(() => setMsg(m => (m === text ? '' : m)), 3000)
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {([['finishes', 'Finish Groups'], ['media', 'Images & Media'], ['passport', 'Technical Passport'], ['specs', 'Specifications']] as Array<[Tab, string]>).map(([t, label]) => (
          <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setErr(''); setTab(t) }}>{label}</button>
        ))}
      </div>
      {err && <p style={{ color: '#a33', fontSize: 13 }}>{err}</p>}
      {msg && (
        <p role="status" style={{ padding: '8px 12px', background: '#DCFCE7', color: '#166534', fontSize: 13, borderRadius: 4 }}>
          ✓ {msg}
        </p>
      )}
      {tab === 'finishes' && <FinishGroupsTab productId={productId} setErr={setErr} flash={flash} />}
      {tab === 'media' && <MediaTab productId={productId} setErr={setErr} />}
      {tab === 'passport' && <PassportTab productId={productId} setErr={setErr} flash={flash} />}
      {tab === 'specs' && <SpecsTab productId={productId} setErr={setErr} flash={flash} />}
    </div>
  )
}

// ── Finish groups & options ──────────────────────────────────

type LibFinish = { id: string; name: string; code: string | null; hex_colour: string | null; material_type_id: string }
type Option = {
  id: string; finish_id: string; is_available: boolean; is_default: boolean
  price_adjustment: number; lead_time_adjustment_weeks: number; sort_order: number
  finish?: { id: string; name: string; code: string | null; hex_colour: string | null } | null
}
type Group = {
  id: string; label: string; key: string; required: boolean; help_text: string | null
  sort_order: number; is_active: boolean; material_type_id: string | null
  material_type?: { id: string; name: string } | null
  options?: Option[]
}
type Rule = {
  id: string
  source?: { id: string; finish?: { name: string } | null; group?: { label: string } | null } | null
  target?: { id: string; finish?: { name: string } | null; group?: { label: string } | null } | null
  explanation: string | null
}

function FinishGroupsTab({ productId, setErr, flash }: { productId: string; setErr: (s: string) => void; flash: (s: string) => void }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [types, setTypes] = useState<Array<{ id: string; name: string; is_active: boolean }>>([])
  const [library, setLibrary] = useState<LibFinish[]>([])
  const [newGroup, setNewGroup] = useState({ label: '', materialTypeId: '', required: false })

  const load = useCallback(async () => {
    const [g, r, t, lib] = await Promise.all([
      api(`/api/admin/products/${productId}/finish-groups`, 'GET'),
      api(`/api/admin/products/${productId}/compatibility`, 'GET'),
      api('/api/admin/material-types', 'GET'),
      api('/api/admin/finishes?active=true', 'GET'),
    ])
    if (g.success) setGroups(g.data as Group[])
    if (r.success) setRules(r.data as Rule[])
    if (t.success) setTypes(t.data as Array<{ id: string; name: string; is_active: boolean }>)
    if (lib.success) setLibrary(lib.data as LibFinish[])
  }, [productId])
  useEffect(() => { load() }, [load])

  const run = async (p: Promise<{ success: boolean; error?: string }>, okMsg?: string) => {
    const res = await p
    if (!res.success) setErr(res.error ?? 'Action failed'); else { setErr(''); if (okMsg) flash(okMsg); load() }
  }

  // QA fix: optimistic checkbox/radio state — the visual state used to
  // lag behind the click by a full server round-trip, tempting admins
  // to re-click and undo their own change.
  const setOptionLocal = (groupId: string, optionId: string, patch: Partial<Option>, exclusiveDefault = false) => {
    setGroups(gs => gs.map(g => g.id !== groupId ? g : {
      ...g,
      options: (g.options ?? []).map(o =>
        o.id === optionId ? { ...o, ...patch }
        : exclusiveDefault ? { ...o, is_default: false } : o),
    }))
  }

  const allOptions = groups.flatMap(g => (g.options ?? []).map(o => ({
    id: o.id, label: `${g.label}: ${o.finish?.name ?? '?'}`,
  })))

  return (
    <div>
      {/* QA item 4: differentiate this system from the legacy "Hard
          finishes" list on the product edit page. */}
      <div style={{
        marginBottom: 16, padding: '10px 14px', fontSize: 12.5, lineHeight: 1.6,
        background: 'var(--cream, #f7f3ec)', border: '1px solid var(--light-line)', color: 'var(--stone)',
      }}>
        <strong style={{ color: 'var(--forest)' }}>Finish Groups power the customer-facing configurator</strong> —
        selectable swatches with price and lead-time adjustments. When a product has at least one active group,
        the legacy “Hard finishes” list on the product edit page is <em>not</em> shown to customers.
      </div>
      {groups.map(g => (
        <div key={g.id} className="admin-card" style={{ padding: 16, marginBottom: 14, opacity: g.is_active ? 1 : 0.5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong style={{ fontSize: 15 }}>{g.label}</strong>
              <span style={{ fontSize: 12, color: 'var(--stone)', marginLeft: 8 }}>
                {g.material_type?.name ?? 'Any material'} · {g.required ? 'Required' : 'Optional'}{g.is_active ? '' : ' · INACTIVE'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => run(api(`/api/admin/products/${productId}/finish-groups/${g.id}`, 'PATCH', { required: !g.required }))}>
                {g.required ? 'Make optional' : 'Make required'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => run(api(`/api/admin/products/${productId}/finish-groups/${g.id}`, 'PATCH', { isActive: !g.is_active }))}>
                {g.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} onClick={async () => {
                if (await appConfirm(`Delete the "${g.label}" group and its options?`)) run(api(`/api/admin/products/${productId}/finish-groups/${g.id}`, 'DELETE'))
              }}>Delete</button>
            </div>
          </div>

          <table className="data-table" style={{ fontSize: 13, marginTop: 10 }}>
            <thead><tr><th></th><th>Finish</th><th>Default</th><th>Available</th><th>Price adj</th><th>Lead adj (wks)</th><th></th></tr></thead>
            <tbody>
              {(g.options ?? []).sort((a, b) => a.sort_order - b.sort_order).map(o => (
                <tr key={o.id}>
                  <td><span style={{ display: 'inline-block', width: 22, height: 22, borderRadius: '50%', background: o.finish?.hex_colour ?? '#EDEAE3', border: '1px solid var(--light-line)' }} /></td>
                  <td>{o.finish?.name ?? '?'}{o.finish?.code ? ` (${o.finish.code})` : ''}</td>
                  <td>
                    <input type="radio" name={`default-${g.id}`} checked={o.is_default} aria-label="Default option"
                      onChange={() => {
                        setOptionLocal(g.id, o.id, { is_default: true }, true)
                        run(api(`/api/admin/products/${productId}/finish-groups/${g.id}/options/${o.id}`, 'PATCH', { isDefault: true }))
                      }} />
                  </td>
                  <td>
                    <input type="checkbox" checked={o.is_available} aria-label="Available"
                      onChange={() => {
                        setOptionLocal(g.id, o.id, { is_available: !o.is_available })
                        run(api(`/api/admin/products/${productId}/finish-groups/${g.id}/options/${o.id}`, 'PATCH', { isAvailable: !o.is_available }))
                      }} />
                  </td>
                  <td>
                    <input type="number" step="0.01" defaultValue={o.price_adjustment} style={{ ...inp, width: 90 }} aria-label="Price adjustment"
                      onBlur={e => { const v = parseFloat(e.target.value) || 0; if (v !== o.price_adjustment) run(api(`/api/admin/products/${productId}/finish-groups/${g.id}/options/${o.id}`, 'PATCH', { priceAdjustment: v })) }} />
                  </td>
                  <td>
                    <input type="number" step="0.5" defaultValue={o.lead_time_adjustment_weeks} style={{ ...inp, width: 70 }} aria-label="Lead time adjustment"
                      onBlur={e => { const v = parseFloat(e.target.value) || 0; if (v !== o.lead_time_adjustment_weeks) run(api(`/api/admin/products/${productId}/finish-groups/${g.id}/options/${o.id}`, 'PATCH', { leadTimeAdjustmentWeeks: v })) }} />
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} onClick={async () => {
                      if (await appConfirm(`Remove ${o.finish?.name ?? 'this option'} from ${g.label}?`)) run(api(`/api/admin/products/${productId}/finish-groups/${g.id}/options/${o.id}`, 'DELETE'))
                    }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <AddOptionRow
            group={g}
            library={library}
            onAdd={(finishId) => run(api(`/api/admin/products/${productId}/finish-groups/${g.id}/options`, 'POST', { finishId }), `Option added to ${g.label}.`)}
            onCreateFinish={async (payload) => {
              const res = await api('/api/admin/finishes', 'POST', payload)
              if (!res.success) { setErr(res.error ?? 'Could not create the finish.'); return null }
              flash('Finish created in the library.')
              return (res.data as { id: string }).id
            }}
          />
        </div>
      ))}

      <div className="admin-card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 10 }}>Add finish group</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ ...inp, width: 200 }} placeholder="Label, e.g. Tabletop" value={newGroup.label}
            onChange={e => setNewGroup(v => ({ ...v, label: e.target.value }))} />
          <select style={inp} value={newGroup.materialTypeId} onChange={e => setNewGroup(v => ({ ...v, materialTypeId: e.target.value }))} aria-label="Material type">
            <option value="">Any material</option>
            {types.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={newGroup.required} onChange={e => setNewGroup(v => ({ ...v, required: e.target.checked }))} /> Required
          </label>
          <button className="btn btn-secondary btn-sm" disabled={!newGroup.label.trim()} onClick={() => {
            run(api(`/api/admin/products/${productId}/finish-groups`, 'POST', {
              label: newGroup.label.trim(), materialTypeId: newGroup.materialTypeId || null,
              required: newGroup.required, sortOrder: (groups.length + 1) * 10,
            }), `Group "${newGroup.label.trim()}" added.`)
            setNewGroup({ label: '', materialTypeId: '', required: false })
          }}>Add group</button>
        </div>
      </div>

      <div className="admin-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 10 }}>
          Incompatible combinations — blocked on the product page and re-validated on the server
        </div>
        {rules.map(r => (
          <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, marginBottom: 6 }}>
            <span><strong>{r.source?.group?.label}: {r.source?.finish?.name}</strong> ⟷ <strong>{r.target?.group?.label}: {r.target?.finish?.name}</strong>{r.explanation ? ` — ${r.explanation}` : ''}</span>
            <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} onClick={async () => {
              if (await appConfirm('Remove this compatibility rule?')) run(api(`/api/admin/products/${productId}/compatibility/${r.id}`, 'DELETE'))
            }}>✕</button>
          </div>
        ))}
        {rules.length === 0 && <p style={{ fontSize: 13, color: 'var(--stone)' }}>No rules — every combination is allowed.</p>}
        <AddRuleRow options={allOptions} onAdd={(sourceId, targetId, explanation) =>
          run(api(`/api/admin/products/${productId}/compatibility`, 'POST', { sourceFinishOptionId: sourceId, targetFinishOptionId: targetId, explanation: explanation || null }), 'Compatibility rule added.')} />
      </div>
    </div>
  )
}

function AddOptionRow({ group, library, onAdd, onCreateFinish }: {
  group: Group
  library: LibFinish[]
  onAdd: (finishId: string) => void
  // QA item 5: inline "+ create new finish" — no more leaving the page
  // to seed the Finish Library before an option can be added.
  onCreateFinish: (payload: { name: string; code: string | null; hexColour: string | null; materialTypeId: string | null }) => Promise<string | null>
}) {
  const [sel, setSel] = useState('')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: '', code: '', hex: '' })
  const [busy, setBusy] = useState(false)
  const usedIds = new Set((group.options ?? []).map(o => o.finish_id))
  const candidates = library.filter(f =>
    !usedIds.has(f.id) && (!group.material_type_id || f.material_type_id === group.material_type_id))

  async function createAndAdd() {
    if (!draft.name.trim()) return
    setBusy(true)
    try {
      const id = await onCreateFinish({
        name: draft.name.trim(),
        code: draft.code.trim() || null,
        hexColour: /^#[0-9a-f]{3,8}$/i.test(draft.hex.trim()) ? draft.hex.trim() : null,
        materialTypeId: group.material_type_id ?? null,
      })
      if (id) {
        onAdd(id)
        setDraft({ name: '', code: '', hex: '' })
        setCreating(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          style={{ ...inp, maxWidth: 320 }}
          value={creating ? '__new__' : sel}
          onChange={e => {
            if (e.target.value === '__new__') { setCreating(true); setSel('') }
            else { setCreating(false); setSel(e.target.value) }
          }}
          aria-label={`Add option to ${group.label}`}
        >
          <option value="">
            {candidates.length === 0
              ? `— no ${group.material_type?.name ?? ''} finishes in the library yet —`
              : '— add a finish from the library —'}
          </option>
          {candidates.map(f => <option key={f.id} value={f.id}>{f.name}{f.code ? ` (${f.code})` : ''}</option>)}
          <option value="__new__">＋ Create new finish…</option>
        </select>
        {!creating && <button className="btn btn-ghost btn-sm" disabled={!sel} onClick={() => { onAdd(sel); setSel('') }}>Add option</button>}
      </div>
      {creating && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8, padding: '10px 12px', background: 'var(--cream, #f7f3ec)', border: '1px solid var(--light-line)' }}>
          <input style={{ ...inp, width: 180 }} placeholder="Finish name *" value={draft.name} autoFocus
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
          <input style={{ ...inp, width: 90 }} placeholder="Code" value={draft.code}
            onChange={e => setDraft(d => ({ ...d, code: e.target.value }))} />
          <input style={{ ...inp, width: 110 }} placeholder="#hex colour" value={draft.hex}
            onChange={e => setDraft(d => ({ ...d, hex: e.target.value }))} />
          <button className="btn btn-secondary btn-sm" disabled={busy || !draft.name.trim()} onClick={createAndAdd}>
            {busy ? 'Creating…' : `Create & add to ${group.label}`}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setCreating(false)}>Cancel</button>
          <span style={{ fontSize: 11, color: 'var(--stone)', flexBasis: '100%' }}>
            Saved to the shared Finish Library{group.material_type?.name ? ` under ${group.material_type.name}` : ''} — reusable on other products.
          </span>
        </div>
      )}
    </div>
  )
}

function AddRuleRow({ options, onAdd }: { options: Array<{ id: string; label: string }>; onAdd: (s: string, t: string, e: string) => void }) {
  const [s, setS] = useState(''); const [t, setT] = useState(''); const [e, setE] = useState('')
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <select style={inp} value={s} onChange={ev => setS(ev.target.value)} aria-label="First option">
        <option value="">— option —</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <span style={{ fontSize: 13 }}>cannot combine with</span>
      <select style={inp} value={t} onChange={ev => setT(ev.target.value)} aria-label="Second option">
        <option value="">— option —</option>
        {options.filter(o => o.id !== s).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <input style={{ ...inp, width: 220 }} placeholder="Explanation shown to the client" value={e} onChange={ev => setE(ev.target.value)} />
      <button className="btn btn-ghost btn-sm" disabled={!s || !t} onClick={() => { onAdd(s, t, e); setS(''); setT(''); setE('') }}>Add rule</button>
    </div>
  )
}

// ── Media ────────────────────────────────────────────────────

type Media = {
  id: string; url: string; media_role: string; alt_text: string | null
  is_primary: boolean; sort_order: number; finish_option_id: string | null
}

function MediaTab({ productId, setErr }: { productId: string; setErr: (s: string) => void }) {
  const [media, setMedia] = useState<Media[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [m, g] = await Promise.all([
      api(`/api/admin/products/${productId}/media`, 'GET'),
      api(`/api/admin/products/${productId}/finish-groups`, 'GET'),
    ])
    if (m.success) setMedia(m.data as Media[])
    if (g.success) setGroups(g.data as Group[])
  }, [productId])
  useEffect(() => { load() }, [load])

  const run = async (p: Promise<{ success: boolean; error?: string }>) => {
    const res = await p
    if (!res.success) setErr(res.error ?? 'Action failed'); else { setErr(''); load() }
  }

  const optionChoices = groups.flatMap(g => (g.options ?? []).map(o => ({ id: o.id, label: `${g.label}: ${o.finish?.name ?? '?'}` })))

  return (
    <div>
      <div className="admin-card" style={{ padding: 16, marginBottom: 16 }}>
        <label style={{ fontSize: 13 }}>
          Upload image (JPG/PNG/WEBP, max 15 MB) —
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} style={{ marginLeft: 8, fontSize: 12 }}
            onChange={async e => {
              const file = e.target.files?.[0]; if (!file) return
              setBusy(true)
              const fd = new FormData(); fd.append('file', file)
              await run(api(`/api/admin/products/${productId}/media`, 'POST', fd))
              setBusy(false); e.target.value = ''
            }} />
        </label>
        <p style={{ fontSize: 12, color: 'var(--stone)', margin: '8px 0 0' }}>
          The first upload becomes the primary image. Link an image to a finish option and the
          product page will switch to it when that finish is selected.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
        {media.map(m => (
          <div key={m.id} className="admin-card" style={{ padding: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.url} alt={m.alt_text ?? ''} style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover', border: m.is_primary ? '2px solid var(--forest)' : '1px solid var(--light-line)' }} />
            <div style={{ fontSize: 12, margin: '8px 0 4px', color: 'var(--stone)' }}>
              {m.is_primary ? 'PRIMARY · ' : ''}{m.media_role}
            </div>
            <input style={{ ...inp, width: '100%', marginBottom: 6 }} defaultValue={m.alt_text ?? ''} placeholder="Alt text" aria-label="Alt text"
              onBlur={e => { if (e.target.value !== (m.alt_text ?? '')) run(api(`/api/admin/products/${productId}/media/${m.id}`, 'PATCH', { altText: e.target.value })) }} />
            <select style={{ ...inp, width: '100%', marginBottom: 6 }} value={m.finish_option_id ?? ''} aria-label="Linked finish option"
              onChange={e => run(api(`/api/admin/products/${productId}/media/${m.id}`, 'PATCH', { finishOptionId: e.target.value || null }))}>
              <option value="">No finish link</option>
              {optionChoices.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {!m.is_primary && <button className="btn btn-ghost btn-sm" onClick={() => run(api(`/api/admin/products/${productId}/media/${m.id}`, 'PATCH', { isPrimary: true }))}>Set primary</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => run(api(`/api/admin/products/${productId}/media/${m.id}`, 'PATCH', { sortOrder: Math.max(0, m.sort_order - 1) }))}>↑</button>
              <button className="btn btn-ghost btn-sm" onClick={() => run(api(`/api/admin/products/${productId}/media/${m.id}`, 'PATCH', { sortOrder: m.sort_order + 1 }))}>↓</button>
              <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} onClick={async () => {
                if (await appConfirm('Archive this image?')) run(api(`/api/admin/products/${productId}/media/${m.id}`, 'DELETE'))
              }}>✕</button>
            </div>
          </div>
        ))}
        {media.length === 0 && <p style={{ fontSize: 13, color: 'var(--stone)' }}>No structured media yet. Upload the first image above.</p>}
      </div>
    </div>
  )
}

// ── Technical passport ───────────────────────────────────────

type Passport = {
  id: string; attribute_key: string; label: string; value_text: string | null
  is_public: boolean; is_verified: boolean; verified_at: string | null; expires_at: string | null
  verifier?: { first_name: string; last_name: string } | null
}

function PassportTab({ productId, setErr, flash }: { productId: string; setErr: (s: string) => void; flash: (s: string) => void }) {
  const [attrs, setAttrs] = useState<Passport[]>([])
  const [form, setForm] = useState({ label: '', valueText: '' })

  const load = useCallback(async () => {
    const res = await api(`/api/admin/products/${productId}/passport`, 'GET')
    if (res.success) setAttrs(res.data as Passport[])
  }, [productId])
  useEffect(() => { load() }, [load])

  const run = async (p: Promise<{ success: boolean; error?: string }>, okMsg?: string) => {
    const res = await p
    if (!res.success) setErr(res.error ?? 'Action failed'); else { setErr(''); if (okMsg) flash(okMsg); load() }
  }

  // Optimistic toggle (QA fix: checkbox state lagged the click)
  const setLocal = (id: string, patch: Partial<Passport>) =>
    setAttrs(list => list.map(a => a.id === id ? { ...a, ...patch } : a))

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--stone)' }}>
        A claim appears in the pale-sage passport panel only when it is <strong>public</strong>, <strong>verified</strong> and not expired.
        Suggested claims: Crib 5 Fire Retardant, Golden Sample Sign-off, ETI Compliant, FSC Certified, Martindale rub count.
      </p>
      <table className="data-table" style={{ fontSize: 13 }}>
        <thead><tr><th>Claim</th><th>Detail</th><th>Public</th><th>Verified</th><th>Expires</th><th></th></tr></thead>
        <tbody>
          {attrs.map(a => (
            <tr key={a.id}>
              <td style={{ fontWeight: 500 }}>{a.label}</td>
              <td>
                <input style={{ ...inp, width: 160 }} defaultValue={a.value_text ?? ''} aria-label="Detail"
                  onBlur={e => { if (e.target.value !== (a.value_text ?? '')) run(api(`/api/admin/products/${productId}/passport/${a.id}`, 'PATCH', { valueText: e.target.value })) }} />
              </td>
              <td><input type="checkbox" checked={a.is_public} aria-label="Public" onChange={() => { setLocal(a.id, { is_public: !a.is_public }); run(api(`/api/admin/products/${productId}/passport/${a.id}`, 'PATCH', { isPublic: !a.is_public })) }} /></td>
              <td>
                <input type="checkbox" checked={a.is_verified} aria-label="Verified" onChange={() => { setLocal(a.id, { is_verified: !a.is_verified }); run(api(`/api/admin/products/${productId}/passport/${a.id}`, 'PATCH', { isVerified: !a.is_verified })) }} />
                {a.is_verified && a.verifier && <span style={{ fontSize: 11, color: 'var(--stone)', marginLeft: 6 }}>{a.verifier.first_name} {a.verifier.last_name}</span>}
              </td>
              <td>
                <input type="date" style={{ ...inp, width: 140 }} defaultValue={a.expires_at ? a.expires_at.slice(0, 10) : ''} aria-label="Expiry date"
                  onBlur={e => run(api(`/api/admin/products/${productId}/passport/${a.id}`, 'PATCH', { expiresAt: e.target.value || null }))} />
              </td>
              <td>
                <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} onClick={async () => {
                  if (await appConfirm(`Remove the "${a.label}" claim?`)) run(api(`/api/admin/products/${productId}/passport/${a.id}`, 'DELETE'))
                }}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <input style={{ ...inp, width: 220 }} placeholder="Claim, e.g. Crib 5 Fire Retardant" value={form.label} onChange={e => setForm(v => ({ ...v, label: e.target.value }))} />
        <input style={{ ...inp, width: 180 }} placeholder="Detail (optional)" value={form.valueText} onChange={e => setForm(v => ({ ...v, valueText: e.target.value }))} />
        <button className="btn btn-secondary btn-sm" disabled={!form.label.trim()} onClick={() => {
          run(api(`/api/admin/products/${productId}/passport`, 'POST', { label: form.label.trim(), valueText: form.valueText || null }), `Claim "${form.label.trim()}" added.`)
          setForm({ label: '', valueText: '' })
        }}>Add claim</button>
      </div>
    </div>
  )
}

// ── Spec rows ────────────────────────────────────────────────

type SpecRow = { id: string; label: string; value: string; unit: string | null; visibility: string; sort_order: number }

function SpecsTab({ productId, setErr, flash }: { productId: string; setErr: (s: string) => void; flash: (s: string) => void }) {
  const [rows, setRows] = useState<SpecRow[]>([])
  const [form, setForm] = useState({ label: '', value: '', unit: '', visibility: 'public' })

  const load = useCallback(async () => {
    const res = await api(`/api/admin/products/${productId}/spec-rows`, 'GET')
    if (res.success) setRows(res.data as SpecRow[])
  }, [productId])
  useEffect(() => { load() }, [load])

  const run = async (p: Promise<{ success: boolean; error?: string }>, okMsg?: string) => {
    const res = await p
    if (!res.success) setErr(res.error ?? 'Action failed'); else { setErr(''); if (okMsg) flash(okMsg); load() }
  }

  const move = (row: SpecRow, dir: -1 | 1) => {
    const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(r => r.id === row.id)
    const swap = sorted[idx + dir]
    if (!swap) return
    run(api(`/api/admin/products/${productId}/spec-rows/${row.id}`, 'PATCH', { sortOrder: swap.sort_order }))
    run(api(`/api/admin/products/${productId}/spec-rows/${swap.id}`, 'PATCH', { sortOrder: row.sort_order }))
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--stone)' }}>
        Structured rows rendered on the product page. Visibility: public (everyone), trade (trade accounts only), internal (admin only).
      </p>
      <table className="data-table" style={{ fontSize: 13 }}>
        <thead><tr><th>Label</th><th>Value</th><th>Unit</th><th>Visibility</th><th>Order</th><th></th></tr></thead>
        <tbody>
          {[...rows].sort((a, b) => a.sort_order - b.sort_order).map(r => (
            <tr key={r.id}>
              <td>
                <input style={{ ...inp, width: 150 }} defaultValue={r.label} aria-label="Label"
                  onBlur={e => { if (e.target.value !== r.label) run(api(`/api/admin/products/${productId}/spec-rows/${r.id}`, 'PATCH', { label: e.target.value })) }} />
              </td>
              <td>
                <input style={{ ...inp, width: 200 }} defaultValue={r.value} aria-label="Value"
                  onBlur={e => { if (e.target.value !== r.value) run(api(`/api/admin/products/${productId}/spec-rows/${r.id}`, 'PATCH', { value: e.target.value })) }} />
              </td>
              <td>
                <input style={{ ...inp, width: 70 }} defaultValue={r.unit ?? ''} aria-label="Unit"
                  onBlur={e => { if (e.target.value !== (r.unit ?? '')) run(api(`/api/admin/products/${productId}/spec-rows/${r.id}`, 'PATCH', { unit: e.target.value })) }} />
              </td>
              <td>
                <select style={inp} value={r.visibility} aria-label="Visibility"
                  onChange={e => run(api(`/api/admin/products/${productId}/spec-rows/${r.id}`, 'PATCH', { visibility: e.target.value }))}>
                  <option value="public">public</option><option value="trade">trade</option><option value="internal">internal</option>
                </select>
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => move(r, -1)}>↑</button>
                <button className="btn btn-ghost btn-sm" onClick={() => move(r, 1)}>↓</button>
              </td>
              <td>
                <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} onClick={async () => {
                  if (await appConfirm(`Remove the "${r.label}" row?`)) run(api(`/api/admin/products/${productId}/spec-rows/${r.id}`, 'DELETE'))
                }}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <input style={{ ...inp, width: 150 }} placeholder="Label" value={form.label} onChange={e => setForm(v => ({ ...v, label: e.target.value }))} />
        <input style={{ ...inp, width: 200 }} placeholder="Value" value={form.value} onChange={e => setForm(v => ({ ...v, value: e.target.value }))} />
        <input style={{ ...inp, width: 70 }} placeholder="Unit" value={form.unit} onChange={e => setForm(v => ({ ...v, unit: e.target.value }))} />
        <select style={inp} value={form.visibility} onChange={e => setForm(v => ({ ...v, visibility: e.target.value }))} aria-label="Visibility">
          <option value="public">public</option><option value="trade">trade</option><option value="internal">internal</option>
        </select>
        <button className="btn btn-secondary btn-sm" disabled={!form.label.trim() || !form.value.trim()} onClick={() => {
          run(api(`/api/admin/products/${productId}/spec-rows`, 'POST', { label: form.label.trim(), value: form.value.trim(), unit: form.unit || null, visibility: form.visibility }), `Spec row "${form.label.trim()}" added.`)
          setForm({ label: '', value: '', unit: '', visibility: 'public' })
        }}>Add row</button>
      </div>
    </div>
  )
}
