'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type QuoteRequest = {
  id: string
  status: string
  project_name: string | null
  project_location: string | null
  budget: number | null
  notes: string | null
  created_at: string
  user: { first_name: string; last_name: string; email: string; role: string } | null
  items: { id: string; quantity: number; product: { id: string; name: string; slug: string } | null }[]
}

const STATUS_OPTIONS = ['new', 'reviewing', 'quoted', 'accepted', 'rejected', 'converted_to_order']

const STATUS_LABELS: Record<string, string> = {
  new: 'New', reviewing: 'Reviewing', quoted: 'Quoted',
  accepted: 'Accepted', rejected: 'Rejected', converted_to_order: 'Order',
}

export default function AdminQuotesPage() {
  const [quotes, setQuotes]       = useState<QuoteRequest[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [statusFilter, setStatus] = useState('')
  const [page, setPage]           = useState(1)
  const [selected, setSelected]   = useState<QuoteRequest | null>(null)
  const limit = 20

  const fetchQuotes = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (statusFilter) params.set('status', statusFilter)
    const res  = await fetch(`/api/admin/quote-requests?${params}`)
    const json = await res.json()
    if (json.success) { setQuotes(json.data); setTotal(json.total ?? 0) }
    setLoading(false)
  }, [page, statusFilter])

  useEffect(() => { fetchQuotes() }, [fetchQuotes])

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/admin/quote-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchQuotes()
    if (selected?.id === id) setSelected(q => q ? { ...q, status } : null)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Quote Pipeline</h1>
          <p className="admin-subtitle">{total} quote request{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="tab-bar" style={{ marginBottom: 24 }}>
        <button className={`tab-btn${statusFilter === '' ? ' active' : ''}`} onClick={() => { setStatus(''); setPage(1) }}>
          All
        </button>
        {STATUS_OPTIONS.map(s => (
          <button key={s} className={`tab-btn${statusFilter === s ? ' active' : ''}`}
            onClick={() => { setStatus(s); setPage(1) }}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--stone)', fontSize: 14 }}>Loading…</div>
        ) : !quotes.length ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--stone)', fontSize: 14 }}>No quotes found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Project</th>
                <th>Items</th>
                <th>Budget</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map(q => (
                <tr key={q.id}>
                  <td style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 500 }}>
                      {q.user ? `${q.user.first_name} ${q.user.last_name}` : '—'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--stone)' }}>{q.user?.email}</div>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    <div>{q.project_name ?? '—'}</div>
                    {q.project_location && (
                      <div style={{ fontSize: 11, color: 'var(--stone)' }}>📍 {q.project_location}</div>
                    )}
                  </td>
                  <td style={{ fontSize: 13 }}>{q.items.length} piece{q.items.length !== 1 ? 's' : ''}</td>
                  <td style={{ fontSize: 13 }}>
                    {q.budget ? `£${Number(q.budget).toLocaleString()}` : '—'}
                  </td>
                  <td>
                    <span className={`status-pill status-${q.status}`}>
                      {STATUS_LABELS[q.status] ?? q.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--stone)' }}>
                    {new Date(q.created_at).toLocaleDateString('en-GB')}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelected(q)} style={{ fontSize: 11 }}>
                      View
                    </button>
                  </td>
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

      {/* Detail modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 className="h3">{selected.project_name ?? 'Quote Request'}</h2>
                <p style={{ fontSize: 13, color: 'var(--stone)', marginTop: 4 }}>
                  {selected.user?.email} · {new Date(selected.created_at).toLocaleDateString('en-GB')}
                </p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--stone)' }}>×</button>
            </div>

            <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 0', fontSize: 13, marginBottom: 20 }}>
              <dt style={{ color: 'var(--stone)' }}>Contact</dt>
              <dd>{selected.user?.first_name} {selected.user?.last_name}</dd>
              {selected.project_location && (<><dt style={{ color: 'var(--stone)' }}>Location</dt><dd>{selected.project_location}</dd></>)}
              {selected.budget && (<><dt style={{ color: 'var(--stone)' }}>Budget</dt><dd>£{Number(selected.budget).toLocaleString()}</dd></>)}
              <dt style={{ color: 'var(--stone)' }}>Status</dt>
              <dd><span className={`status-pill status-${selected.status}`}>{STATUS_LABELS[selected.status]}</span></dd>
            </dl>

            {selected.items.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div className="label" style={{ marginBottom: 10 }}>Products requested</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selected.items.map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 12px', background: 'var(--cream)' }}>
                      <span>{item.product?.name ?? 'Unknown product'}</span>
                      <span style={{ color: 'var(--stone)' }}>Qty: {item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selected.notes && (
              <div style={{ padding: 16, background: 'var(--cream)', borderLeft: '3px solid var(--sand)', marginBottom: 20 }}>
                <div className="label" style={{ marginBottom: 6 }}>Notes</div>
                <p style={{ fontSize: 13, color: 'var(--stone)', lineHeight: 1.7 }}>{selected.notes}</p>
              </div>
            )}

            <div>
              <div className="label" style={{ marginBottom: 10 }}>Update status</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {STATUS_OPTIONS.filter(s => s !== selected.status).map(s => (
                  <button key={s} className="btn btn-secondary btn-sm"
                    onClick={() => updateStatus(selected.id, s)}
                    style={{ fontSize: 11 }}>
                    → {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
