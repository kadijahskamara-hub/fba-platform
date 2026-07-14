'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ReconciliationBadge } from './InvoiceAccountingControls'

// ============================================================
// Sprint 6 — record a refund against a confirmed payment. Approval
// is a separate, Ultra-only step and cannot be done by the recorder
// (segregation of duties) — enforced server-side; noted here.
// ============================================================

type Refund = { id: string; refund_number: string; amount: number; status: string; refund_date: string }

export function PaymentRefundControls(props: {
  paymentId: string
  status: string
  currency: string
  refundable: number
  reconciliationStatus: string
  refunds: Refund[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [amount, setAmount] = useState(props.refundable > 0 ? props.refundable.toFixed(2) : '')
  const [method, setMethod] = useState('bank_transfer')
  const [date, setDate] = useState('')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')

  const canRefund = props.status === 'confirmed' && props.refundable > 0

  async function submit() {
    if (!amount) { setMsg('Enter an amount.'); return }
    setBusy(true); setMsg(null)
    const r = await fetch('/api/admin/refunds', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId: props.paymentId, amount: Number(amount), method, refundDate: date || undefined, externalReference: reference || undefined, reason: reason || undefined }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(j.error ?? 'Could not record refund'); return }
    setMsg(`Refund ${j.refundNumber} recorded — pending Ultra approval.`); setOpen(false); router.refresh()
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #ece7de', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ color: '#1B4332' }}>Refunds</strong>
        <ReconciliationBadge status={props.reconciliationStatus} />
        <span style={{ fontSize: 12.5, color: '#6b6257' }}>Refundable: {props.currency} {props.refundable.toFixed(2)}</span>
        <div style={{ flex: 1 }} />
        {canRefund && <button disabled={busy} onClick={() => setOpen(o => !o)} style={btn}>Record refund</button>}
      </div>

      {open && (
        <div style={{ marginTop: 12, padding: 12, background: '#F8F6F2', borderRadius: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={lbl}>Amount<input value={amount} onChange={e => setAmount(e.target.value)} style={{ ...inp, width: 100 }} inputMode="decimal" /></label>
            <label style={lbl}>Method<select value={method} onChange={e => setMethod(e.target.value)} style={inp}>
              <option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="cash">Cash</option><option value="other">Other</option></select></label>
            <label style={lbl}>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} /></label>
            <label style={lbl}>Reference<input value={reference} onChange={e => setReference(e.target.value)} style={inp} placeholder="optional" /></label>
            <label style={lbl}>Reason<input value={reason} onChange={e => setReason(e.target.value)} style={inp} placeholder="optional" /></label>
            <button disabled={busy} onClick={submit} style={btn}>Record</button>
          </div>
          <p style={{ fontSize: 12, color: '#8A6D3B', marginBottom: 0 }}>Segregation of duties: approval &amp; completion are Ultra-only and cannot be done by whoever records the refund.</p>
        </div>
      )}

      {props.refunds.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 13 }}>
          <thead><tr style={{ textAlign: 'left', color: '#6b6257' }}><th style={th}>Refund</th><th style={th}>Amount</th><th style={th}>Date</th><th style={th}>Status</th></tr></thead>
          <tbody>{props.refunds.map(r => (
            <tr key={r.id} style={{ borderTop: '1px solid #efeae2' }}>
              <td style={td}><code style={{ fontSize: 12 }}>{r.refund_number}</code></td>
              <td style={td}>{props.currency} {Number(r.amount).toFixed(2)}</td>
              <td style={td}>{r.refund_date}</td>
              <td style={td}>{r.status}</td>
            </tr>))}
          </tbody>
        </table>
      )}

      {msg && <p style={{ marginTop: 10, fontSize: 13, color: '#1B4332', background: '#EEF3EE', padding: '8px 12px', borderRadius: 6 }}>{msg}</p>}
    </div>
  )
}

const btn: React.CSSProperties = { background: '#1B4332', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#8A6D3B', textTransform: 'uppercase', letterSpacing: 0.4 }
const inp: React.CSSProperties = { padding: '7px 9px', border: '1px solid #d8d2c8', borderRadius: 6, fontSize: 13 }
const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 600, fontSize: 11.5 }
const td: React.CSSProperties = { padding: '6px 8px', color: '#3a352f' }
