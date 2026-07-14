'use client'

import { useState } from 'react'

// ============================================================
// Sprint 6 — from a "credited" delivery-line exception, pre-fill a
// draft credit note linked back to the exception. Delivery documents
// carry no price, so staff pick the order's invoice and enter the
// credit amount; it then follows the normal approve → issue →
// allocate/refund lifecycle. (Requires credit_note_create; the API
// enforces it.)
// ============================================================

type Invoice = { id: string; invoice_number: string | null; status: string; balance_due: number }

export function CreditFromExceptionButton({ exceptionId, orderId, onDone }: {
  exceptionId: string
  orderId: string | null
  onDone?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoiceId, setInvoiceId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function expand() {
    setOpen(true); setMsg(null)
    if (!orderId) { setMsg('No order linked to this delivery.'); return }
    const r = await fetch(`/api/admin/commercial-orders/${orderId}/invoices`)
    const j = await r.json().catch(() => ({}))
    const list = ((j?.data?.invoices ?? []) as Invoice[]).filter(i => i.invoice_number) // issued only
    setInvoices(list)
    if (list.length) setInvoiceId(list[0].id)
  }

  async function submit() {
    if (!invoiceId) { setMsg('Choose an invoice to credit against.'); return }
    if (!amount) { setMsg('Enter a credit amount.'); return }
    setBusy(true); setMsg(null)
    const r = await fetch(`/api/admin/credit-notes/from-exception/${exceptionId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId, amount: Number(amount), reason: reason || undefined }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(j.error ?? 'Could not create credit note'); return }
    setMsg(`Draft credit note ${j.creditNote?.credit_note_number ?? ''} created.`)
    setOpen(false); onDone?.()
  }

  if (!open) {
    return <button className="btn btn-ghost btn-sm" onClick={expand}>Create credit note</button>
  }

  return (
    <div style={{ width: '100%', marginTop: 6, padding: 10, background: '#F8F6F2', borderRadius: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
      <label style={lbl}>Invoice
        <select value={invoiceId} onChange={e => setInvoiceId(e.target.value)} style={inp}>
          {invoices.length === 0 && <option value="">No issued invoices</option>}
          {invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number} ({i.status})</option>)}
        </select>
      </label>
      <label style={lbl}>Amount (gross)<input value={amount} onChange={e => setAmount(e.target.value)} style={{ ...inp, width: 100 }} inputMode="decimal" placeholder="0.00" /></label>
      <label style={lbl}>Reason<input value={reason} onChange={e => setReason(e.target.value)} style={inp} placeholder="optional — pre-filled from exception" /></label>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={submit}>Create draft</button>
      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      {msg && <span style={{ fontSize: 12.5, color: '#1B4332', width: '100%' }}>{msg}</span>}
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#8A6D3B', textTransform: 'uppercase', letterSpacing: 0.4 }
const inp: React.CSSProperties = { padding: '6px 8px', border: '1px solid #d8d2c8', borderRadius: 6, fontSize: 13 }
