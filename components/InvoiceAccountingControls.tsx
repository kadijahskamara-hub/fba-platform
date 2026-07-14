'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ============================================================
// Sprint 6 — controlled accounting actions on an issued invoice:
// void (with reason), one-click replacement, and create-credit-note.
// Plus the reconciliation-status badge. The server enforces the hard
// rules (payments/credits present, locked period, permissions); this
// surfaces them and shows the returned error inline.
// ============================================================

const RECON_COLOR: Record<string, string> = {
  not_exported: '#9E9589', exported: '#1B4332', reconciled: '#3F7A54',
  needs_re_export: '#B4472A', excluded: '#8A6D3B',
}
const RECON_LABEL: Record<string, string> = {
  not_exported: 'Not exported', exported: 'Exported', reconciled: 'Reconciled',
  needs_re_export: 'Needs re-export', excluded: 'Excluded',
}

export function ReconciliationBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600,
      color: '#fff', background: RECON_COLOR[status] ?? '#9E9589',
    }}>{RECON_LABEL[status] ?? status}</span>
  )
}

export function InvoiceAccountingControls(props: {
  invoiceId: string
  status: string
  locked: boolean
  reconciliationStatus: string
  replacedByInvoiceId?: string | null
  replacesInvoiceId?: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [showCredit, setShowCredit] = useState(false)
  const [cnReason, setCnReason] = useState('')
  const [cnAmount, setCnAmount] = useState('')

  const isVoid = props.status === 'void' || props.status === 'cancelled'

  async function call(url: string, body?: unknown) {
    setBusy(true); setMsg(null)
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(j.error ?? 'Action failed'); return null }
    return j
  }

  async function doVoid() {
    const reason = prompt('Reason for voiding this invoice? (blocked if payments/credits exist or the period is locked)')
    if (!reason) return
    const j = await call(`/api/admin/invoices/${props.invoiceId}/void`, { reason })
    if (j) { setMsg(`Voided ${j.invoiceNumber ?? ''}.`); router.refresh() }
  }
  async function doReplace() {
    const j = await call(`/api/admin/invoices/${props.invoiceId}/replace`)
    if (j?.invoiceId) router.push(`/admin/invoices/${j.invoiceId}`)
  }
  async function doCreateCredit() {
    if (!cnReason.trim() || !cnAmount) { setMsg('A reason and amount are required.'); return }
    const j = await call('/api/admin/credit-notes/from-invoice', { invoiceId: props.invoiceId, reason: cnReason, amount: Number(cnAmount) })
    if (j?.creditNote) { setShowCredit(false); setCnReason(''); setCnAmount(''); setMsg(`Draft credit note ${j.creditNote.credit_note_number ?? ''} created.`); router.refresh() }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #ece7de', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ color: '#1B4332' }}>Accounting</strong>
        <ReconciliationBadge status={props.reconciliationStatus} />
        <div style={{ flex: 1 }} />
        {props.locked && !isVoid && (
          <>
            <button disabled={busy} onClick={() => setShowCredit(s => !s)} style={btnGhost}>Create credit note</button>
            <button disabled={busy} onClick={doVoid} style={btnDanger}>Void invoice</button>
          </>
        )}
        {isVoid && !props.replacedByInvoiceId && (
          <button disabled={busy} onClick={doReplace} style={btn}>Create replacement draft</button>
        )}
      </div>

      {props.replacedByInvoiceId && (
        <p style={link}>Replaced by <a href={`/admin/invoices/${props.replacedByInvoiceId}`} style={a}>the replacement invoice →</a></p>
      )}
      {props.replacesInvoiceId && (
        <p style={link}>Replaces <a href={`/admin/invoices/${props.replacesInvoiceId}`} style={a}>a voided invoice →</a></p>
      )}

      {showCredit && (
        <div style={{ marginTop: 12, padding: 12, background: '#F8F6F2', borderRadius: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={lbl}>Reason<input value={cnReason} onChange={e => setCnReason(e.target.value)} style={inp} placeholder="e.g. Returned item" /></label>
            <label style={lbl}>Amount (gross)<input value={cnAmount} onChange={e => setCnAmount(e.target.value)} style={{ ...inp, width: 110 }} inputMode="decimal" placeholder="0.00" /></label>
            <button disabled={busy} onClick={doCreateCredit} style={btn}>Create draft</button>
            <button disabled={busy} onClick={() => setShowCredit(false)} style={btnGhost}>Cancel</button>
          </div>
          <p style={{ fontSize: 12, color: '#9E9589', marginBottom: 0 }}>Creates a draft credit note (capped at the invoice&apos;s eligible amount). It then follows approve → issue → allocate/refund.</p>
        </div>
      )}

      {msg && <p style={{ marginTop: 10, fontSize: 13, color: '#1B4332', background: '#EEF3EE', padding: '8px 12px', borderRadius: 6 }}>{msg}</p>}
    </div>
  )
}

const btn: React.CSSProperties = { background: '#1B4332', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }
const btnGhost: React.CSSProperties = { background: '#fff', color: '#1B4332', border: '1px solid #cfc8bc', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }
const btnDanger: React.CSSProperties = { background: '#fff', color: '#B4472A', border: '1px solid #e0b3a6', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#8A6D3B', textTransform: 'uppercase', letterSpacing: 0.4 }
const inp: React.CSSProperties = { padding: '7px 9px', border: '1px solid #d8d2c8', borderRadius: 6, fontSize: 13 }
const link: React.CSSProperties = { fontSize: 12.5, color: '#6b6257', marginTop: 8, marginBottom: 0 }
const a: React.CSSProperties = { color: '#1B4332', fontWeight: 600 }
