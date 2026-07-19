'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PROFORMA_STAGES, stageLabel } from '@/lib/pipeline'
import { UltraDeleteRecordButton } from '@/components/UltraDeleteRecordButton'

type Item = { id: string; name: string; quantity: number; unit_price: number | null; manufacturer_id: string | null; manufacturer_name: string | null; is_bespoke: boolean }
type Contact = { id: string; first_name: string | null; last_name: string | null; email: string } | null
type Proforma = {
  id: string; proforma_number: string; quote_number: string | null; stage: string
  client_name: string | null; client_company: string | null; client_email: string | null
  project_name: string | null; project_location: string | null; currency: string
  quote_request_id: string | null; updated_at: string
  items: Item[]; contact: Contact
}
type QuoteReq = {
  id: string; status: string; project_name: string | null; project_location: string | null
  budget: number | null; created_at: string
  user: { first_name: string; last_name: string; email: string } | null
  items: { id: string }[]
}

function money(n: number, cur: string) {
  const sym = cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£'
  return `${sym}${n.toLocaleString('en-GB')}`
}
const proformaTotal = (p: Proforma) =>
  (p.items ?? []).reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 0), 0)

export default function QuotePipelinePage() {
  const router = useRouter()
  const [proformas, setProformas] = useState<Proforma[]>([])
  const [inbox, setInbox] = useState<QuoteReq[]>([])
  const [loading, setLoading] = useState(true)
  const [stage, setStage] = useState<string>('all')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [pfRes, qrRes] = await Promise.all([
      fetch('/api/admin/proformas').then(r => r.json()),
      fetch('/api/admin/quote-requests?limit=100').then(r => r.json()),
    ])
    const pfs: Proforma[] = pfRes.success ? pfRes.data : []
    setProformas(pfs)
    // Inbox = OPEN quote requests (new / reviewing) not yet converted into
    // a proforma. Requests that were quoted and later had their proforma
    // deleted are closed as rejected and no longer resurface here.
    const converted = new Set(pfs.map(p => p.quote_request_id).filter(Boolean))
    const reqs: QuoteReq[] = qrRes.success ? qrRes.data : []
    setInbox(reqs.filter(r => !converted.has(r.id) && ['new', 'reviewing'].includes(r.status)))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const counts: Record<string, number> = { all: proformas.length }
  for (const s of PROFORMA_STAGES) counts[s.key] = proformas.filter(p => p.stage === s.key).length

  const visible = stage === 'all' ? proformas : proformas.filter(p => p.stage === stage)

  const newProforma = async (quoteRequestId?: string) => {
    setCreating(true)
    const res = await fetch('/api/admin/proformas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quoteRequestId ? { quoteRequestId } : {}),
    })
    const json = await res.json()
    setCreating(false)
    if (json.success) router.push(`/admin/quotes/${json.data.id}`)
    else alert(json.error ?? 'Could not create proforma')
  }

  const seedFromRequest = async (r: QuoteReq) => {
    // Create proforma then patch header from the request's details.
    setCreating(true)
    const res = await fetch('/api/admin/proformas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteRequestId: r.id,
        clientName: r.user ? `${r.user.first_name} ${r.user.last_name}`.trim() : null,
        clientEmail: r.user?.email ?? null,
        projectName: r.project_name,
        projectLocation: r.project_location,
      }),
    })
    const json = await res.json()
    setCreating(false)
    if (json.success) router.push(`/admin/quotes/${json.data.id}`)
    else alert(json.error ?? 'Could not create proforma')
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Quote Pipeline</h1>
          <p className="admin-subtitle">{proformas.length} proforma{proformas.length !== 1 ? 's' : ''}{inbox.length ? ` · ${inbox.length} incoming request${inbox.length !== 1 ? 's' : ''}` : ''}</p>
        </div>
        <button className="btn btn-primary btn-sm" disabled={creating} onClick={() => newProforma()}>
          {creating ? 'Creating…' : '+ New Proforma'}
        </button>
      </div>

      {/* Incoming quote requests (entry point 2.1) */}
      {inbox.length > 0 && (
        <div style={{ marginBottom: 28, background: 'var(--cream, #f7f3ec)', border: '1px solid var(--light-line)', borderRadius: 6, padding: 16 }}>
          <div className="label" style={{ marginBottom: 10 }}>Incoming quote requests</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {inbox.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, background: 'var(--warm-white)', padding: '8px 12px', border: '1px solid var(--light-line)' }}>
                <div style={{ flex: 1 }}>
                  <strong>{r.user ? `${r.user.first_name} ${r.user.last_name}` : '—'}</strong>
                  <span style={{ color: 'var(--stone)' }}> · {r.project_name ?? 'Untitled'} · {r.items.length} item{r.items.length !== 1 ? 's' : ''}</span>
                </div>
                <button className="btn btn-secondary btn-sm" disabled={creating} onClick={() => seedFromRequest(r)}>
                  Create proforma →
                </button>
                <UltraDeleteRecordButton
                  entity="quote_request"
                  recordId={r.id}
                  label={`Quote request · ${r.project_name ?? 'Untitled'} · ${r.user ? `${r.user.first_name} ${r.user.last_name}` : '—'}`}
                  onDeleted={load}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage tabs */}
      <div className="tab-bar" style={{ marginBottom: 18, flexWrap: 'wrap' }}>
        <button className={`tab-btn${stage === 'all' ? ' active' : ''}`} onClick={() => setStage('all')}>All ({counts.all})</button>
        {PROFORMA_STAGES.map(s => (
          <button key={s.key} className={`tab-btn${stage === s.key ? ' active' : ''}`} onClick={() => setStage(s.key)}>
            {s.label} ({counts[s.key]})
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--stone)' }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div className="empty-state"><h3>No proformas here</h3><p>Create one, or convert an incoming request above.</p></div>
      ) : (
        <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)' }}>
          <div className="table-scroll">
<table className="data-table">
            <thead>
              <tr><th>Proforma</th><th>Client</th><th>Project</th><th>Items</th><th>Total</th><th>Stage</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {visible.map(p => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/admin/quotes/${p.id}`)}>
                  <td style={{ fontWeight: 500, fontSize: 13 }}>{p.quote_number ?? p.proforma_number}</td>
                  <td style={{ fontSize: 13 }}>
                    {p.client_name || (p.contact ? `${p.contact.first_name ?? ''} ${p.contact.last_name ?? ''}`.trim() : '—')}
                    {p.client_company && <div style={{ fontSize: 11, color: 'var(--stone)' }}>{p.client_company}</div>}
                  </td>
                  <td style={{ fontSize: 13 }}>{p.project_name ?? '—'}</td>
                  <td style={{ fontSize: 13 }}>{p.items?.length ?? 0}</td>
                  <td style={{ fontSize: 13 }}>{money(proformaTotal(p), p.currency)}</td>
                  <td><span className={`status-pill status-${p.stage}`}>{stageLabel(p.stage)}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--stone)' }}>{new Date(p.updated_at).toLocaleDateString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
</div>
        </div>
      )}
    </>
  )
}
