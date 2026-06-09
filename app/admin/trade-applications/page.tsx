'use client'

import { useState, useEffect, useTransition } from 'react'
import type { TradeApplication, ApplicationStatus } from '@/lib/types'

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending:      'Pending',
  form_sent:    'Form Sent',
  under_review: 'Under Review',
  approved:     'Approved',
  declined:     'Declined',
  revoked:      'Revoked',
}

const STATUS_CLASS: Record<ApplicationStatus, string> = {
  pending:      'status-pending',
  form_sent:    'status-form-sent',
  under_review: 'status-review',
  approved:     'status-approved',
  declined:     'status-declined',
  revoked:      'status-revoked',
}

type Counts = { all: number; pending: number; form_sent: number; under_review: number; approved: number; declined: number; revoked: number }

export default function TradeApplicationsPage() {
  const [apps,       setApps]       = useState<TradeApplication[]>([])
  const [counts,     setCounts]     = useState<Counts>({ all: 0, pending: 0, form_sent: 0, under_review: 0, approved: 0, declined: 0, revoked: 0 })
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState<ApplicationStatus | 'all'>('all')
  const [selected,   setSelected]   = useState<TradeApplication | null>(null)
  const [noteText,   setNoteText]   = useState('')
  const [isPending,  startTransition] = useTransition()
  const [actionMsg,  setActionMsg]  = useState('')
  const [actionErr,  setActionErr]  = useState('')

  useEffect(() => { loadAll() }, [filter])

  const loadAll = async () => {
    setLoading(true)
    const [appsRes, countsRes] = await Promise.all([
      fetch(`/api/admin/trade-applications${filter !== 'all' ? `?status=${filter}` : ''}`).then(r => r.json()),
      fetch('/api/admin/trade-applications/counts').then(r => r.json()),
    ])
    setApps(appsRes.success ? appsRes.data : [])
    if (countsRes.success) setCounts(countsRes.data)
    setLoading(false)
  }

  const doAction = (id: string, action: string, body?: object) => {
    setActionErr('')
    setActionMsg('')
    startTransition(async () => {
      const res = await fetch(`/api/admin/trade-applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      })
      const data = await res.json()
      if (data.success) {
        setActionMsg(`Done: ${action.replace(/_/g, ' ')}`)
        setSelected(null)
        loadAll()
        setTimeout(() => setActionMsg(''), 4000)
      } else {
        setActionErr(data.error ?? 'Something went wrong')
      }
    })
  }

  const openModal = (app: TradeApplication) => {
    setSelected(app)
    setNoteText(app.adminNotes ?? '')
    setActionErr('')
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Trade Applications</h1>
          <p className="admin-subtitle">Review, approve and manage trade account applications</p>
        </div>
        {actionMsg && (
          <span style={{ fontSize: 13, color: '#155724', padding: '8px 16px', background: '#D4EDDA', borderRadius: 4 }}>
            ✓ {actionMsg}
          </span>
        )}
      </div>

      {/* Stats strip — real DB counts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Pending',      value: counts.pending,      color: '#856404' },
          { label: 'Under Review', value: counts.under_review, color: '#004085' },
          { label: 'Approved',     value: counts.approved,     color: '#155724' },
          { label: 'Declined',     value: counts.declined,     color: '#721C24' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value" style={{ fontSize: 32, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="tab-bar">
        {(['all', 'pending', 'form_sent', 'under_review', 'approved', 'declined', 'revoked'] as const).map(f => (
          <button key={f} className={`tab-btn${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}>
            {f === 'all' ? `All (${counts.all})` : `${STATUS_LABELS[f as ApplicationStatus]} (${counts[f as keyof Counts] ?? 0})`}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--stone)' }}>Loading…</div>
      ) : apps.length === 0 ? (
        <div className="empty-state">
          <h3>No applications</h3>
          <p>No trade applications match this filter.</p>
        </div>
      ) : (
        <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Company</th>
                <th>Business Type</th>
                <th>Location</th>
                <th>Status</th>
                <th>Applied</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {apps.map(app => (
                <tr key={app.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{app.user?.firstName} {app.user?.lastName}</div>
                    <div style={{ fontSize: 12, color: 'var(--stone)' }}>{app.user?.email}</div>
                  </td>
                  <td>{app.companyName}</td>
                  <td style={{ textTransform: 'capitalize' }}>{app.businessType?.replace(/_/g, ' ')}</td>
                  <td>{app.location ?? '—'}</td>
                  <td>
                    <span className={`status-pill ${STATUS_CLASS[app.status]}`}>{STATUS_LABELS[app.status]}</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--stone)' }}>
                    {new Date(app.createdAt).toLocaleDateString('en-GB')}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => openModal(app)}>
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Detail Modal ───────────────────────────────────── */}
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" style={{ maxWidth: 720, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelected(null)}>✕</button>

            {/* Scrollable body */}
            <div style={{ overflowY: 'auto', padding: 40, flex: 1 }}>

              {/* Header */}
              <div style={{ marginBottom: 28 }}>
                <div className="label label-sage" style={{ marginBottom: 8 }}>Trade Application</div>
                <h2 className="h2" style={{ marginBottom: 4 }}>{selected.companyName}</h2>
                <p style={{ fontSize: 14, color: 'var(--stone)' }}>
                  {selected.user?.firstName} {selected.user?.lastName}
                  {selected.user?.email && <> · <a href={`mailto:${selected.user.email}`} style={{ color: 'var(--forest)' }}>{selected.user.email}</a></>}
                </p>
                <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`status-pill ${STATUS_CLASS[selected.status]}`}>{STATUS_LABELS[selected.status]}</span>
                  {selected.reviewedAt && (
                    <span style={{ fontSize: 12, color: 'var(--stone)' }}>
                      Reviewed {new Date(selected.reviewedAt).toLocaleDateString('en-GB')}
                    </span>
                  )}
                  {selected.detailedFormSentAt && (
                    <span style={{ fontSize: 12, color: 'var(--stone)' }}>
                      · Form sent {new Date(selected.detailedFormSentAt).toLocaleDateString('en-GB')}
                    </span>
                  )}
                </div>
              </div>

              {/* Primary details */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--light-line)' }}>
                  Business Details
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                  {[
                    ['Business type',  selected.businessType?.replace(/_/g,' ')],
                    ['Location',       selected.location],
                    ['Website',        selected.website ? <a href={selected.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--forest)' }}>{selected.website}</a> : null],
                    ['Project type',   selected.projectType],
                    ['Estimated budget', selected.estimatedBudget],
                    ['How they heard', selected.howDidYouHear],
                  ].map(([k, v]) => v ? (
                    <div key={k as string} style={{ padding: '10px 0', borderBottom: '1px solid var(--sage-light)' }}>
                      <div className="form-label" style={{ marginBottom: 2 }}>{k}</div>
                      <div style={{ fontSize: 14 }}>{v}</div>
                    </div>
                  ) : null)}
                </div>
              </div>

              {/* Trade details (populated on detailed form) */}
              {(selected.vatNumber || selected.companyRegistration || selected.tradeReferences || selected.portfolioUrl || selected.annualSpendEstimate) && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--light-line)' }}>
                    Trade Credentials
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                    {[
                      ['VAT number',           selected.vatNumber],
                      ['Company registration', selected.companyRegistration],
                      ['Annual spend estimate', selected.annualSpendEstimate],
                      ['Portfolio / work URL',  selected.portfolioUrl ? <a href={selected.portfolioUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--forest)' }}>{selected.portfolioUrl}</a> : null],
                    ].map(([k, v]) => v ? (
                      <div key={k as string} style={{ padding: '10px 0', borderBottom: '1px solid var(--sage-light)' }}>
                        <div className="form-label" style={{ marginBottom: 2 }}>{k}</div>
                        <div style={{ fontSize: 14 }}>{v}</div>
                      </div>
                    ) : null)}
                    {selected.tradeReferences && (
                      <div style={{ gridColumn: '1 / -1', padding: '10px 0', borderBottom: '1px solid var(--sage-light)' }}>
                        <div className="form-label" style={{ marginBottom: 2 }}>Trade references</div>
                        <div style={{ fontSize: 14, whiteSpace: 'pre-line', lineHeight: 1.6 }}>{selected.tradeReferences}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Admin notes */}
              <div className="form-group" style={{ marginBottom: 24 }}>
                <label className="form-label">Internal notes (not visible to applicant)</label>
                <textarea className="form-textarea" rows={3}
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Add notes for your team…" />
              </div>

              {/* Error */}
              {actionErr && (
                <div style={{ padding: '12px 16px', background: '#F8D7DA', color: '#721C24', fontSize: 13, borderRadius: 4, marginBottom: 16 }}>
                  {actionErr}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {selected.status === 'pending' && (
                  <>
                    <button className="btn btn-primary btn-sm" disabled={isPending}
                      onClick={() => doAction(selected.id, 'approve')}>
                      ✓ Approve
                    </button>
                    <button className="btn btn-sm" style={{ background: '#CCE5FF', color: '#004085' }} disabled={isPending}
                      onClick={() => doAction(selected.id, 'send_form')}>
                      Send Detailed Form
                    </button>
                    <button className="btn btn-sm" style={{ background: '#F8D7DA', color: '#721C24' }} disabled={isPending}
                      onClick={() => doAction(selected.id, 'decline')}>
                      Decline
                    </button>
                  </>
                )}
                {selected.status === 'form_sent' && (
                  <>
                    <button className="btn btn-primary btn-sm" disabled={isPending}
                      onClick={() => doAction(selected.id, 'approve')}>
                      ✓ Approve
                    </button>
                    <button className="btn btn-sm" style={{ background: '#E2D9F3', color: '#4B0082' }} disabled={isPending}
                      onClick={() => doAction(selected.id, 'under_review')}>
                      Mark Under Review
                    </button>
                    <button className="btn btn-sm" style={{ background: '#F8D7DA', color: '#721C24' }} disabled={isPending}
                      onClick={() => doAction(selected.id, 'decline')}>
                      Decline
                    </button>
                  </>
                )}
                {selected.status === 'under_review' && (
                  <>
                    <button className="btn btn-primary btn-sm" disabled={isPending}
                      onClick={() => doAction(selected.id, 'approve')}>
                      ✓ Approve
                    </button>
                    <button className="btn btn-sm" style={{ background: '#F8D7DA', color: '#721C24' }} disabled={isPending}
                      onClick={() => doAction(selected.id, 'decline')}>
                      Decline
                    </button>
                  </>
                )}
                {selected.status === 'approved' && (
                  <button className="btn btn-sm" style={{ background: '#F8D7DA', color: '#721C24' }} disabled={isPending}
                    onClick={() => doAction(selected.id, 'revoke')}>
                    Revoke Access
                  </button>
                )}
                {selected.status === 'declined' && (
                  <button className="btn btn-sm" style={{ background: '#D4EDDA', color: '#155724' }} disabled={isPending}
                    onClick={() => doAction(selected.id, 'approve')}>
                    Approve (override)
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" disabled={isPending}
                  onClick={() => doAction(selected.id, 'add_note', { note: noteText })}>
                  Save Note
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  )
}
