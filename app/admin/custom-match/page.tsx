'use client'

// Custom Match admin queue (Sprint 11).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CUSTOM_MATCH_STATUSES, CUSTOM_MATCH_STATUS_LABELS, type CustomMatchStatus } from '@/lib/customMatch/logic'

type Row = {
  id: string; reference_number: string; status: CustomMatchStatus; quantity: number
  requester_name: string; requester_studio: string | null
  supplier_brand: string | null; material_code: string | null; created_at: string
  product?: { name: string; sku: string | null } | null
  material_type?: { name: string } | null
  assignee?: { first_name: string; last_name: string } | null
}

export default function CustomMatchQueuePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/custom-match?status=${status}`).then(r => r.json())
    if (res.success) { setRows(res.data); setCounts(res.counts ?? {}) }
    setLoading(false)
  }, [status])
  useEffect(() => { load() }, [load])

  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  const activeTabs = CUSTOM_MATCH_STATUSES.filter(s => (counts[s] ?? 0) > 0)

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Custom Match</h1>
          <p className="admin-subtitle">Customer&apos;s Own Material — match requests, feasibility and approvals</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        <button className={`btn btn-sm ${status === 'all' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setStatus('all')}>All ({total})</button>
        {activeTabs.map(s => (
          <button key={s} className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setStatus(s)}>
            {CUSTOM_MATCH_STATUS_LABELS[s]} ({counts[s]})
          </button>
        ))}
      </div>

      {loading ? <p style={{ color: 'var(--stone)', fontSize: 13 }}>Loading…</p> : rows.length === 0 ? (
        <div className="empty-state" style={{ padding: 48, textAlign: 'center', color: 'var(--stone)' }}>
          <p>No Custom Match requests{status !== 'all' ? ' in this status' : ' yet'}. Requests submitted from the product page arrive here.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table" style={{ fontSize: 13 }}>
            <thead>
              <tr><th>Reference</th><th>Product</th><th>Material</th><th>Supplier / code</th><th>Requester</th><th>Qty</th><th>Status</th><th>Assigned</th><th>Received</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td><Link href={`/admin/custom-match/${r.id}`} style={{ color: 'var(--forest)', fontWeight: 500 }}>{r.reference_number}</Link></td>
                  <td>{r.product?.name ?? '—'}</td>
                  <td>{r.material_type?.name ?? '—'}</td>
                  <td>{[r.supplier_brand, r.material_code].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{r.requester_name}{r.requester_studio ? ` (${r.requester_studio})` : ''}</td>
                  <td>{r.quantity}</td>
                  <td><span className="status-pill">{CUSTOM_MATCH_STATUS_LABELS[r.status] ?? r.status}</span></td>
                  <td>{r.assignee ? `${r.assignee.first_name} ${r.assignee.last_name}` : '—'}</td>
                  <td>{new Date(r.created_at).toLocaleDateString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
