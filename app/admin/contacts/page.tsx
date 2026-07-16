'use client'

import { useEffect, useState, useCallback } from 'react'
import { appConfirm } from '@/lib/appConfirm'
import Link from 'next/link'
import { accountRoleLabel } from '@/lib/contactRoleLabel'
import { stageLabel } from '@/lib/pipeline'
import { CONTACT_SOURCES, CONTACT_SOURCE_LABELS, contactSourceLabel } from '@/lib/contactSources'

type Contact = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  company_name: string | null
  contact_type: string
  source: string | null
  consent_marketing: boolean
  notes: string | null
  created_at: string
  account_role: string | null
  account_is_owner: boolean
}

type Note = { id: string; body: string; created_at: string; author: { first_name: string | null; last_name: string | null } | null }
type PipeEntry = { id: string; proforma_number: string; quote_number: string | null; stage: string; project_name: string | null; currency: string; updated_at: string; items: { unit_price: number | null; quantity: number }[] }

const TYPE_LABELS: Record<string, string> = {
  retail: 'Retail', trade: 'Trade', retail_customer: 'Retail', trade_prospect: 'Trade Prospect',
  trade_client: 'Trade Client', press: 'Press', artisan: 'Artisan', general: 'General',
}
const CONTACT_TYPES = ['general', 'retail', 'trade', 'press', 'artisan']

const emptyForm = { firstName: '', lastName: '', email: '', phone: '', companyName: '', contactType: 'general', source: 'manual', consentMarketing: false, notes: '' }

function money(n: number, cur: string) { const s = cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£'; return `${s}${n.toLocaleString('en-GB')}` }
const entryTotal = (e: PipeEntry) => (e.items ?? []).reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 0), 0)

export default function AdminContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ contact: Contact; notes: Note[]; proformas: PipeEntry[] } | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [noteText, setNoteText] = useState('')
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(emptyForm)

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search) params.set('search', search)
    if (typeFilter) params.set('type', typeFilter)
    if (sourceFilter) params.set('source', sourceFilter)
    const res = await fetch(`/api/admin/contacts?${params}`)
    const json = await res.json()
    if (json.success) { setContacts(json.data); setTotal(json.total ?? 0) }
    setLoading(false)
  }, [page, search, typeFilter, sourceFilter])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  const exportCsv = useCallback(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (typeFilter) params.set('type', typeFilter)
    if (sourceFilter) params.set('source', sourceFilter)
    const qs = params.toString()
    window.location.href = `/api/admin/contacts/export${qs ? `?${qs}` : ''}`
  }, [search, typeFilter, sourceFilter])

  const openDetail = async (id: string) => {
    setSelectedId(id); setDetail(null); setNoteText('')
    const res = await fetch(`/api/admin/contacts/${id}`).then(r => r.json())
    if (res.success) {
      setDetail(res.data)
      const c: Contact = res.data.contact
      setForm({
        firstName: c.first_name ?? '', lastName: c.last_name ?? '', email: c.email ?? '',
        phone: c.phone ?? '', companyName: c.company_name ?? '', contactType: c.contact_type ?? 'general',
        source: c.source ?? 'manual',
        consentMarketing: !!c.consent_marketing, notes: c.notes ?? '',
      })
    }
  }
  const closeDetail = () => { setSelectedId(null); setDetail(null) }

  const saveEdit = async () => {
    if (!selectedId) return
    setBusy(true)
    const res = await fetch(`/api/admin/contacts/${selectedId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).then(r => r.json())
    setBusy(false)
    if (!res.success) { alert(res.error ?? 'Save failed'); return }
    await fetchContacts(); await openDetail(selectedId)
  }
  const deleteContact = async () => {
    if (!selectedId || !await appConfirm('Delete this contact and its notes? This cannot be undone.')) return
    setBusy(true)
    await fetch(`/api/admin/contacts/${selectedId}`, { method: 'DELETE' })
    setBusy(false); closeDetail(); fetchContacts()
  }
  const addNote = async () => {
    if (!selectedId || !noteText.trim()) return
    setBusy(true)
    const res = await fetch(`/api/admin/contacts/${selectedId}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: noteText }) }).then(r => r.json())
    setBusy(false)
    if (res.success) { setNoteText(''); openDetail(selectedId) }
    else alert(res.error ?? 'Could not add note')
  }
  const deleteNote = async (noteId: string) => {
    if (!selectedId) return
    await fetch(`/api/admin/contacts/${selectedId}/notes/${noteId}`, { method: 'DELETE' })
    openDetail(selectedId)
  }
  const createContact = async () => {
    if (!createForm.email.trim()) { alert('Email is required'); return }
    setBusy(true)
    const res = await fetch('/api/admin/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createForm) }).then(r => r.json())
    setBusy(false)
    if (!res.success) { alert(res.error ?? 'Create failed'); return }
    setShowCreate(false); setCreateForm(emptyForm); fetchContacts(); openDetail(res.data.id)
  }

  const totalPages = Math.ceil(total / limit)
  const inp: React.CSSProperties = { width: '100%', border: '1px solid var(--light-line)', borderRadius: 4, padding: '7px 9px', fontSize: 13, background: 'var(--warm-white)' }

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Contacts</h1>
          <p className="admin-subtitle">{total} contact{total !== 1 ? 's' : ''} in database</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={() => { setCreateForm(emptyForm); setShowCreate(true) }}>+ New Contact</button>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={loading || total === 0}>Export CSV</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <input type="search" placeholder="Search name, email, company…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="form-input" style={{ width: 280 }} />
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }} className="form-select" style={{ width: 180 }}>
          <option value="">All Types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
        </select>
        <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1) }} className="form-select" style={{ width: 200 }}>
          <option value="">All Sources</option>
          {CONTACT_SOURCES.map(s => (<option key={s.value} value={s.value}>{s.label}</option>))}
        </select>
      </div>

      <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--stone)', fontSize: 14 }}>Loading contacts…</div>
        ) : !contacts.length ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--stone)', fontSize: 14 }}>No contacts found.</div>
        ) : (
          <table className="data-table">
            <thead><tr>
              <th>Name</th><th>Email</th><th>Company</th><th>Type</th><th>Source</th><th>Marketing</th><th>Date</th><th></th>
            </tr></thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500, fontSize: 13 }}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</td>
                  <td style={{ fontSize: 13 }}><a href={`mailto:${c.email}`} style={{ color: 'var(--caramel)' }}>{c.email}</a></td>
                  <td style={{ fontSize: 13, color: 'var(--stone)' }}>{c.company_name ?? '—'}</td>
                  <td>
                    {accountRoleLabel(c.account_role, c.account_is_owner) ? (
                      <span className="status-pill" style={{ background: 'var(--forest, #2d3a2e)', color: '#fff' }} title="Appointed account status">
                        {accountRoleLabel(c.account_role, c.account_is_owner)}
                      </span>
                    ) : (
                      <span className={`status-pill status-${c.contact_type}`}>{TYPE_LABELS[c.contact_type] ?? c.contact_type}</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--stone)' }}>{contactSourceLabel(c.source)}</td>
                  <td style={{ fontSize: 12, textAlign: 'center' }}>{c.consent_marketing ? <span style={{ color: '#155724' }}>✓</span> : <span style={{ color: 'var(--stone)' }}>—</span>}</td>
                  <td style={{ fontSize: 12, color: 'var(--stone)' }}>{new Date(c.created_at).toLocaleDateString('en-GB')}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => openDetail(c.id)} style={{ fontSize: 11 }}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24 }}>
          <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ fontSize: 13, color: 'var(--stone)', padding: '6px 12px' }}>Page {page} of {totalPages}</span>
          <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h2 className="h3" style={{ marginBottom: 16 }}>New contact</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><div className="form-label">First name</div><input style={inp} value={createForm.firstName} onChange={e => setCreateForm(f => ({ ...f, firstName: e.target.value }))} /></div>
              <div><div className="form-label">Last name</div><input style={inp} value={createForm.lastName} onChange={e => setCreateForm(f => ({ ...f, lastName: e.target.value }))} /></div>
              <div><div className="form-label">Email *</div><input style={inp} type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><div className="form-label">Phone</div><input style={inp} value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><div className="form-label">Company</div><input style={inp} value={createForm.companyName} onChange={e => setCreateForm(f => ({ ...f, companyName: e.target.value }))} /></div>
              <div><div className="form-label">Type</div><select style={inp} value={createForm.contactType} onChange={e => setCreateForm(f => ({ ...f, contactType: e.target.value }))}>{CONTACT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>)}</select></div>
              <div style={{ gridColumn: '1 / -1' }}><div className="form-label">Source — where did this contact come from?</div><select style={inp} value={createForm.source} onChange={e => setCreateForm(f => ({ ...f, source: e.target.value }))}>{CONTACT_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13 }}>
              <input type="checkbox" checked={createForm.consentMarketing} onChange={e => setCreateForm(f => ({ ...f, consentMarketing: e.target.checked }))} /> Marketing opt-in
            </label>
            <div style={{ marginTop: 12 }}><div className="form-label">Notes</div><textarea style={{ ...inp, minHeight: 60 }} value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={createContact}>Create</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail / edit modal */}
      {selectedId && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
            {!detail ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--stone)' }}>Loading…</div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <h2 className="h3">{[form.firstName, form.lastName].filter(Boolean).join(' ') || form.email || 'Contact'}</h2>
                  <button onClick={closeDetail} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--stone)' }}>×</button>
                </div>

                {/* Editable fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div><div className="form-label">First name</div><input style={inp} value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
                  <div><div className="form-label">Last name</div><input style={inp} value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
                  <div><div className="form-label">Email</div><input style={inp} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div><div className="form-label">Phone</div><input style={inp} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                  <div><div className="form-label">Company</div><input style={inp} value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} /></div>
                  <div><div className="form-label">Type</div><select style={inp} value={form.contactType} onChange={e => setForm(f => ({ ...f, contactType: e.target.value }))}>{CONTACT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>)}</select></div>
                  <div style={{ gridColumn: '1 / -1' }}><div className="form-label">Source</div><select style={inp} value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>{CONTACT_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
                  <input type="checkbox" checked={form.consentMarketing} onChange={e => setForm(f => ({ ...f, consentMarketing: e.target.checked }))} /> Marketing opt-in
                </label>
                <div style={{ marginBottom: 12 }}><div className="form-label">Notes (summary)</div><textarea style={{ ...inp, minHeight: 60 }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveEdit}>Save changes</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: '#a03030', marginLeft: 'auto' }} disabled={busy} onClick={deleteContact}>Delete contact</button>
                </div>

                {/* Linked pipeline entries (2.8 / 4.3) */}
                <div style={{ borderTop: '1px solid var(--light-line)', paddingTop: 16, marginBottom: 20 }}>
                  <div className="label" style={{ marginBottom: 10 }}>Quote Pipeline entries ({detail.proformas.length})</div>
                  {detail.proformas.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--stone)' }}>No proformas linked to this contact yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {detail.proformas.map(p => (
                        <Link key={p.id} href={`/admin/quotes/${p.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '8px 12px', background: 'var(--cream)', textDecoration: 'none', color: 'inherit' }}>
                          <span><strong>{p.quote_number ?? p.proforma_number}</strong> · {p.project_name ?? 'Untitled'}</span>
                          <span style={{ color: 'var(--stone)' }}>{stageLabel(p.stage)} · {money(entryTotal(p), p.currency)}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Activity / notes log */}
                <div style={{ borderTop: '1px solid var(--light-line)', paddingTop: 16 }}>
                  <div className="label" style={{ marginBottom: 10 }}>Activity log</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input style={inp} placeholder="Add a note or log activity…" value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addNote() }} />
                    <button className="btn btn-secondary btn-sm" disabled={busy || !noteText.trim()} onClick={addNote}>Add</button>
                  </div>
                  {detail.notes.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--stone)' }}>No activity yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {detail.notes.map(n => (
                        <div key={n.id} style={{ fontSize: 13, padding: '8px 12px', background: 'var(--cream)', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <div>
                            <div>{n.body}</div>
                            <div style={{ fontSize: 11, color: 'var(--stone)', marginTop: 3 }}>
                              {n.author ? `${n.author.first_name ?? ''} ${n.author.last_name ?? ''}`.trim() : 'Staff'} · {new Date(n.created_at).toLocaleString('en-GB')}
                            </div>
                          </div>
                          <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} onClick={() => deleteNote(n.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
