'use client'

import { useEffect, useState, useCallback } from 'react'

// ============================================================
// Communications list — surfaces prepared-but-never-sent packs and
// needs-attention items so nothing falls through. No sending here:
// staff download the pack, send from their own mailbox, mark it sent.
// ============================================================

type Pack = {
  id: string; pack_number: string; pack_type: string; template_key: string
  subject: string; status: string; attention_note: string | null; version: number
  superseded_by_id: string | null; marked_sent_at: string | null; created_at: string
}
type EventRow = { id: string; event: string; detail: Record<string, unknown>; created_at: string }
type Attachment = { id: string; entity_type: string; document_number: string; audience: string | null; version: number; byte_size: number; sha256: string }

const STATUS_LABEL: Record<string, string> = {
  prepared: 'Prepared', downloaded: 'Downloaded', marked_sent: 'Sent',
  needs_attention: 'Needs attention', superseded: 'Superseded',
}
const STATUS_COLOR: Record<string, string> = {
  prepared: '#8A6D3B', downloaded: '#1B4332', marked_sent: '#3F7A54',
  needs_attention: '#B4472A', superseded: '#9E9589',
}

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'outstanding', label: 'Needs action' },
  { key: 'prepared', label: 'Prepared' },
  { key: 'downloaded', label: 'Downloaded' },
  { key: 'needs_attention', label: 'Needs attention' },
  { key: 'marked_sent', label: 'Sent' },
  { key: 'all', label: 'All' },
]

export default function CommunicationsPage() {
  const [packs, setPacks] = useState<Pack[]>([])
  const [filter, setFilter] = useState('outstanding')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = filter === 'all' ? '' : filter === 'outstanding' ? '?outstanding=1' : `?status=${filter}`
    const res = await fetch(`/api/admin/communications${qs}`)
    const json = await res.json().catch(() => ({ packs: [] }))
    setPacks(json.packs ?? [])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Georgia, serif', color: '#1B4332', fontSize: 26, marginBottom: 4 }}>Communications</h1>
      <p style={{ color: '#6b6257', marginTop: 0, fontSize: 14 }}>
        Prepared packs the platform assembled for you to download and send from your own mailbox. Mark them sent so nothing is missed.
      </p>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
              border: '1px solid ' + (filter === f.key ? '#1B4332' : '#d8d2c8'),
              background: filter === f.key ? '#1B4332' : '#fff',
              color: filter === f.key ? '#fff' : '#4a453f',
            }}>{f.label}</button>
        ))}
      </div>

      {loading ? <p style={{ color: '#9E9589' }}>Loading…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: '#F4F1ED', textAlign: 'left', color: '#6b6257' }}>
              <th style={th}>Pack</th><th style={th}>Type</th><th style={th}>Subject</th>
              <th style={th}>Status</th><th style={th}>Created</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {packs.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 24, color: '#9E9589', textAlign: 'center' }}>Nothing here — you&apos;re all caught up.</td></tr>
            )}
            {packs.map(p => (
              <tr key={p.id} style={{ borderTop: '1px solid #efeae2' }}>
                <td style={td}><code style={{ fontSize: 12 }}>{p.pack_number}</code>{p.version > 1 && <span style={{ color: '#9E9589' }}> v{p.version}</span>}</td>
                <td style={td}>{p.pack_type.replace('_', ' ')}</td>
                <td style={{ ...td, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.subject}</td>
                <td style={td}><span style={{ color: STATUS_COLOR[p.status], fontWeight: 600 }}>{STATUS_LABEL[p.status] ?? p.status}</span></td>
                <td style={td}>{new Date(p.created_at).toLocaleDateString('en-GB')}</td>
                <td style={td}><button onClick={() => setSelected(p.id)} style={linkBtn}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && <PackDetail id={selected} onClose={() => setSelected(null)} onChange={load} />}
    </div>
  )
}

function PackDetail({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const [pack, setPack] = useState<Pack | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/communications/${id}`)
    const json = await res.json().catch(() => null)
    if (json) { setPack(json.pack); setEvents(json.events ?? []); setAttachments(json.attachments ?? []) }
  }, [id])
  useEffect(() => { load() }, [load])

  async function act(url: string, body?: unknown, download = false) {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      if (download) {
        if (!res.ok) { setMsg('Download failed'); return }
        const blob = await res.blob()
        const cd = res.headers.get('Content-Disposition') || ''
        const name = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? 'pack.eml'
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
        setMsg('Downloaded. Send it from your own mailbox, then Mark as sent.')
      } else {
        const json = await res.json().catch(() => ({}))
        if (!res.ok) { setMsg(json.error ?? 'Action failed'); return }
        setMsg('Done.')
      }
      await load(); onChange()
    } finally { setBusy(false) }
  }

  if (!pack) return null
  const editable = pack.status === 'prepared'
  const canSend = ['prepared', 'downloaded', 'needs_attention'].includes(pack.status)

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={drawer}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'Georgia, serif', color: '#1B4332', margin: 0, fontSize: 20 }}>{pack.pack_number}</h2>
          <button onClick={onClose} style={{ ...linkBtn, fontSize: 18 }}>×</button>
        </div>
        <p style={{ margin: '4px 0 12px', color: STATUS_COLOR[pack.status], fontWeight: 600 }}>{STATUS_LABEL[pack.status] ?? pack.status}</p>

        <label style={lbl}>Subject</label>
        <div style={box}>{pack.subject}</div>

        <label style={lbl}>Attachments</label>
        <div style={box}>
          {attachments.length === 0 ? <em style={{ color: '#9E9589' }}>None</em> : attachments.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span>{a.document_number}{a.audience ? ` (${a.audience})` : ''} · v{a.version}</span>
              <span style={{ color: '#9E9589' }}>{(a.byte_size / 1024).toFixed(0)} KB · {a.sha256.slice(0, 10)}…</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
          <button disabled={busy} onClick={() => act(`/api/admin/communications/${id}/download`, undefined, true)} style={primaryBtn}>Download pack (.eml)</button>
          {canSend && <button disabled={busy} onClick={() => { const via = prompt('Sent via (e.g. Outlook — kadijahta@)?'); if (via) act(`/api/admin/communications/${id}/mark-sent`, { sentVia: via }) }} style={secBtn}>Mark as sent</button>}
          <button disabled={busy} onClick={() => { const n = prompt('What needs attention? (bounce, wrong address, resend…)'); if (n) act(`/api/admin/communications/${id}/needs-attention`, { note: n }) }} style={secBtn}>Needs attention</button>
          {pack.status !== 'superseded' && <button disabled={busy} onClick={() => act(`/api/admin/communications/${id}/re-prepare`)} style={secBtn}>Re-prepare</button>}
        </div>
        {!editable && <p style={{ fontSize: 12, color: '#9E9589' }}>This pack is locked to edits. Use Re-prepare to make a new version.</p>}
        {msg && <p style={{ fontSize: 13, color: '#1B4332', background: '#EEF3EE', padding: '8px 12px', borderRadius: 6 }}>{msg}</p>}

        <label style={lbl}>History</label>
        <div style={{ ...box, maxHeight: 180, overflowY: 'auto' }}>
          {events.map(e => (
            <div key={e.id} style={{ fontSize: 12, color: '#6b6257', padding: '2px 0' }}>
              <strong>{e.event}</strong> · {new Date(e.created_at).toLocaleString('en-GB')}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 600, fontSize: 12 }
const td: React.CSSProperties = { padding: '10px 12px', color: '#3a352f' }
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#1B4332', cursor: 'pointer', fontWeight: 600 }
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(30,25,20,0.35)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }
const drawer: React.CSSProperties = { width: 460, maxWidth: '92vw', height: '100%', background: '#fff', padding: 24, overflowY: 'auto', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: '#8A6D3B', margin: '12px 0 4px', fontWeight: 700 }
const box: React.CSSProperties = { background: '#F8F6F2', borderRadius: 6, padding: '10px 12px', fontSize: 13.5, color: '#3a352f', whiteSpace: 'pre-wrap' }
const primaryBtn: React.CSSProperties = { background: '#1B4332', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }
const secBtn: React.CSSProperties = { background: '#fff', color: '#1B4332', border: '1px solid #1B4332', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }
