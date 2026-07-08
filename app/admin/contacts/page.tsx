'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { accountRoleLabel } from '@/lib/contactRoleLabel'

type Contact = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  company_name: string | null
  contact_type: string
  source: string | null
  message: string | null
  subscribed_marketing: boolean
  created_at: string
  account_role: string | null
  account_is_owner: boolean
}

const TYPE_LABELS: Record<string, string> = {
  retail_customer: 'Retail',
  trade_prospect: 'Trade Prospect',
  trade_client: 'Trade Client',
  press: 'Press',
  artisan: 'Artisan',
  general: 'General',
}

const SOURCE_LABELS: Record<string, string> = {
  registration: 'Registration',
  trade_application: 'Trade Application',
  contact_form: 'Contact Form',
  service_enquiry: 'Service Enquiry',
  newsletter: 'Newsletter',
  manual: 'Manual',
}

export default function AdminContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Contact | null>(null)
  const limit = 20

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    if (search)      params.set('search', search)
    if (typeFilter)  params.set('type', typeFilter)
    if (sourceFilter) params.set('source', sourceFilter)

    const res = await fetch(`/api/admin/contacts?${params}`)
    const json = await res.json()
    if (json.success) {
      setContacts(json.data)
      setTotal(json.total ?? 0)
    }
    setLoading(false)
  }, [page, search, typeFilter, sourceFilter])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  const exportCsv = useCallback(() => {
    const params = new URLSearchParams()
    if (search)       params.set('search', search)
    if (typeFilter)   params.set('type', typeFilter)
    if (sourceFilter) params.set('source', sourceFilter)
    const qs = params.toString()
    window.location.href = `/api/admin/contacts/export${qs ? `?${qs}` : ''}`
  }, [search, typeFilter, sourceFilter])

  const totalPages = Math.ceil(total / limit)

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Contacts</h1>
          <p className="admin-subtitle">{total} contact{total !== 1 ? 's' : ''} in database</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={loading || total === 0}>Export CSV</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search name, email, company…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="form-input"
          style={{ width: 280 }}
        />
        <select
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
          className="form-select"
          style={{ width: 180 }}
        >
          <option value="">All Types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={e => { setSourceFilter(e.target.value); setPage(1) }}
          className="form-select"
          style={{ width: 180 }}
        >
          <option value="">All Sources</option>
          {Object.entries(SOURCE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--stone)', fontSize: 14 }}>
            Loading contacts…
          </div>
        ) : !contacts.length ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--stone)', fontSize: 14 }}>
            No contacts found.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Company</th>
                <th>Type</th>
                <th>Source</th>
                <th>Marketing</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500, fontSize: 13 }}>
                    {[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    <a href={`mailto:${c.email}`} style={{ color: 'var(--caramel)' }}>{c.email}</a>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--stone)' }}>{c.company_name ?? '—'}</td>
                  <td>
                    {accountRoleLabel(c.account_role, c.account_is_owner) ? (
                      <span className="status-pill" style={{ background: 'var(--forest, #2d3a2e)', color: '#fff' }}
                        title="Appointed account status">
                        {accountRoleLabel(c.account_role, c.account_is_owner)}
                      </span>
                    ) : (
                      <span className={`status-pill status-${c.contact_type}`}>
                        {TYPE_LABELS[c.contact_type] ?? c.contact_type}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--stone)' }}>
                    {SOURCE_LABELS[c.source ?? ''] ?? c.source ?? '—'}
                  </td>
                  <td style={{ fontSize: 12, textAlign: 'center' }}>
                    {c.subscribed_marketing ? (
                      <span style={{ color: '#155724' }}>✓</span>
                    ) : (
                      <span style={{ color: 'var(--stone)' }}>—</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--stone)' }}>
                    {new Date(c.created_at).toLocaleDateString('en-GB')}
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setSelected(c)}
                      style={{ fontSize: 11 }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24 }}>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 13, color: 'var(--stone)', padding: '6px 12px' }}>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next →
          </button>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 className="h3">
                  {[selected.first_name, selected.last_name].filter(Boolean).join(' ') || selected.email}
                </h2>
                <p style={{ fontSize: 13, color: 'var(--stone)', marginTop: 4 }}>
                  {accountRoleLabel(selected.account_role, selected.account_is_owner) ?? TYPE_LABELS[selected.contact_type] ?? selected.contact_type}
                  {selected.source ? ` · via ${SOURCE_LABELS[selected.source] ?? selected.source}` : ''}
                </p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--stone)' }}>×</button>
            </div>

            <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 0', fontSize: 13 }}>
              <dt style={{ color: 'var(--stone)', paddingRight: 16 }}>Email</dt>
              <dd><a href={`mailto:${selected.email}`} style={{ color: 'var(--caramel)' }}>{selected.email}</a></dd>

              {selected.phone && (
                <>
                  <dt style={{ color: 'var(--stone)' }}>Phone</dt>
                  <dd>{selected.phone}</dd>
                </>
              )}
              {selected.company_name && (
                <>
                  <dt style={{ color: 'var(--stone)' }}>Company</dt>
                  <dd>{selected.company_name}</dd>
                </>
              )}
              <dt style={{ color: 'var(--stone)' }}>Marketing</dt>
              <dd>{selected.subscribed_marketing ? 'Subscribed' : 'Not subscribed'}</dd>
              <dt style={{ color: 'var(--stone)' }}>Added</dt>
              <dd>{new Date(selected.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
            </dl>

            {selected.message && (
              <div style={{ marginTop: 20, padding: 16, background: 'var(--cream)', borderLeft: '3px solid var(--sand)' }}>
                <div className="label" style={{ marginBottom: 8 }}>Message / Notes</div>
                <p style={{ fontSize: 13, color: 'var(--stone)', lineHeight: 1.7 }}>{selected.message}</p>
              </div>
            )}

            <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
              <a href={`mailto:${selected.email}`} className="btn btn-primary btn-sm">
                Send Email
              </a>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
