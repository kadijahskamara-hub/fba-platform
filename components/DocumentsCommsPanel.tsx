'use client'

import { useEffect, useState, useCallback } from 'react'

// ============================================================
// Reusable "Documents & communications" panel for record detail
// pages (invoice, PO, delivery, quote/proforma). Shows the version
// chain per document with generate / regenerate / download / verify,
// and a one-click "Prepare communication" that hands off to the
// Communications area. No sending happens here.
// ============================================================

export type EntityType =
  | 'issued_document' | 'sales_invoice' | 'credit_note'
  | 'payment_receipt' | 'purchase_order' | 'delivery_note' | 'statement'
type Audience = 'client' | 'site' | 'manufacturer'

export interface DocTarget { label: string; entityType: EntityType; entityId: string; audience?: Audience }
export interface PrepareConfig {
  label: string
  templateKey: string
  entities: Record<string, string | null | undefined>
  attachments: Array<{ entityType: EntityType; entityId: string; audience?: Audience }>
}

type FileRow = {
  id: string; version: number; audience: string | null; byte_size: number
  sha256: string; generated_at: string; superseded_by_id: string | null
}

export function DocumentsCommsPanel({ documents, prepare }: { documents: DocTarget[]; prepare?: PrepareConfig[] }) {
  return (
    <section style={{ background: '#fff', borderRadius: 10, padding: 20, border: '1px solid #ece7de' }}>
      <h3 style={{ fontFamily: 'Georgia, serif', color: '#1B4332', margin: '0 0 12px' }}>Documents &amp; communications</h3>
      {documents.map(d => <DocRow key={`${d.entityType}:${d.entityId}:${d.audience ?? ''}`} target={d} />)}
      {prepare && prepare.length > 0 && (
        <div style={{ marginTop: 14, borderTop: '1px solid #efeae2', paddingTop: 12 }}>
          {prepare.map(p => <PrepareRow key={p.templateKey + p.label} cfg={p} />)}
        </div>
      )}
    </section>
  )
}

function DocRow({ target }: { target: DocTarget }) {
  const [current, setCurrent] = useState<FileRow | null>(null)
  const [chain, setChain] = useState<FileRow[]>([])
  const [busy, setBusy] = useState(false)
  const [verify, setVerify] = useState<string | null>(null)

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ entityType: target.entityType, entityId: target.entityId })
    if (target.audience) qs.set('audience', target.audience)
    const res = await fetch(`/api/admin/documents?${qs.toString()}`)
    const json = await res.json().catch(() => ({}))
    setCurrent(json.current ?? null); setChain(json.chain ?? [])
  }, [target])
  useEffect(() => { load() }, [load])

  async function generate(regenerate: boolean) {
    setBusy(true); setVerify(null)
    const res = await fetch('/api/admin/documents/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityType: target.entityType, entityId: target.entityId, audience: target.audience ?? null, regenerate }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setVerify(j.error ?? 'Generation failed') }
    await load(); setBusy(false)
  }

  async function doVerify() {
    if (!current) return
    setBusy(true)
    const res = await fetch(`/api/admin/documents/${current.id}/verify`)
    const j = await res.json().catch(() => ({}))
    setVerify(res.ok ? (j.match ? '✓ checksum verified' : '✗ checksum MISMATCH') : (j.error ?? 'verify failed'))
    setBusy(false)
  }

  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid #f4f0e9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: '#3a352f' }}>{target.label}</strong>
          {current
            ? <span style={{ color: '#9E9589', fontSize: 12.5 }}> · v{current.version} · {(current.byte_size / 1024).toFixed(0)} KB · {current.sha256.slice(0, 10)}…</span>
            : <span style={{ color: '#B4472A', fontSize: 12.5 }}> · not generated</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {!current && <button disabled={busy} onClick={() => generate(false)} style={btn}>Generate</button>}
          {current && <a href={`/api/admin/documents/${current.id}/download`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>Download</a>}
          {current && <button disabled={busy} onClick={doVerify} style={btnGhost}>Verify</button>}
          {current && <button disabled={busy} onClick={() => generate(true)} style={btnGhost}>Regenerate</button>}
        </div>
      </div>
      {verify && <div style={{ fontSize: 12, marginTop: 4, color: verify.startsWith('✓') ? '#3F7A54' : '#B4472A' }}>{verify}</div>}
      {chain.length > 1 && (
        <div style={{ fontSize: 11.5, color: '#9E9589', marginTop: 3 }}>
          Version history: {chain.map(c => `v${c.version}`).join(' ← ')}
        </div>
      )}
    </div>
  )
}

function PrepareRow({ cfg }: { cfg: PrepareConfig }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function prepare() {
    setBusy(true); setMsg(null)
    const res = await fetch('/api/admin/communications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateKey: cfg.templateKey, entities: cfg.entities, attachments: cfg.attachments }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg(j.error ?? 'Could not prepare'); return }
    setMsg(`Prepared ${j.pack?.pack_number ?? ''} — open Communications to review, download and send.`)
  }

  return (
    <div style={{ marginTop: 6 }}>
      <button disabled={busy} onClick={prepare} style={btnPrimary}>Prepare communication — {cfg.label}</button>
      {msg && <span style={{ fontSize: 12.5, color: '#1B4332', marginLeft: 10 }}>{msg} <a href="/admin/communications" style={{ color: '#1B4332' }}>Open →</a></span>}
    </div>
  )
}

const btn: React.CSSProperties = { background: '#1B4332', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12.5, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { background: '#fff', color: '#1B4332', border: '1px solid #cfc8bc', borderRadius: 6, padding: '5px 12px', fontSize: 12.5, cursor: 'pointer' }
const btnPrimary: React.CSSProperties = { background: '#8A6D3B', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }
