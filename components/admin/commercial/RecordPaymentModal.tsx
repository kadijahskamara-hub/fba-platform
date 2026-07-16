'use client'

// Record a manual payment/deposit (QA item 2). The API existed
// (POST /api/admin/payments) but no screen ever offered the action, so
// the "client balance not satisfied" delivery gate could never clear.
// Flow: record here (pending) -> confirm + allocate on the payment page.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const METHODS = [
  ['bank_transfer', 'Bank transfer'], ['card', 'Card'], ['cash', 'Cash'],
  ['cheque', 'Cheque'], ['credit', 'Credit'], ['other', 'Other'],
] as const

export default function RecordPaymentModal({ commercialOrderId, clientId, currency, onDone }: {
  commercialOrderId?: string | null
  clientId?: string | null
  currency?: string
  onDone?: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('bank_transfer')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  const submit = async () => {
    setErr('')
    const amt = parseFloat(amount)
    if (!(amt > 0)) { setErr('Enter a positive amount.'); return }
    if (!date) { setErr('Enter the payment date.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          currency: currency ?? 'GBP',
          paymentDate: date,
          paymentMethod: method,
          externalReference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
          commercialOrderId: commercialOrderId ?? undefined,
          clientId: clientId ?? undefined,
        }),
      })
      const data = await res.json()
      if (!data.success) { setErr(data.error ?? 'Could not record the payment.'); setBusy(false); return }
      setOpen(false)
      setBusy(false)
      setAmount(''); setReference(''); setNotes('')
      const paymentId = (data.data?.payment as { id?: string } | undefined)?.id
      if (paymentId) router.push(`/admin/payments/${paymentId}`)
      else { router.refresh(); onDone?.() }
    } catch {
      setErr('Request failed.'); setBusy(false)
    }
  }

  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>Record payment</button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Record a payment" style={{
          position: 'fixed', inset: 0, background: 'rgba(24,32,26,0.45)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{ background: 'var(--cream, #F7F3EE)', maxWidth: 460, width: '100%', padding: 24, borderRadius: 4, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginTop: 0, fontSize: 20 }}>Record a payment</h2>
            <p style={{ fontSize: 13, color: 'var(--stone)' }}>
              Records a pending payment{commercialOrderId ? ' against this order' : ''}. Confirm and
              allocate it to an invoice from the payment page to clear client balances.
            </p>
            {err && <p style={{ color: '#a33', fontSize: 13 }}>{err}</p>}
            <label style={{ display: 'block', fontSize: 12.5, marginBottom: 10 }}>Amount ({currency ?? 'GBP'})
              <input type="number" min="0.01" step="0.01" className="form-input" value={amount} onChange={e => setAmount(e.target.value)} />
            </label>
            <label style={{ display: 'block', fontSize: 12.5, marginBottom: 10 }}>Payment date
              <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
            </label>
            <label style={{ display: 'block', fontSize: 12.5, marginBottom: 10 }}>Method
              <select className="form-input" value={method} onChange={e => setMethod(e.target.value)}>
                {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label style={{ display: 'block', fontSize: 12.5, marginBottom: 10 }}>Reference (optional)
              <input className="form-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Bank / remittance reference" />
            </label>
            <label style={{ display: 'block', fontSize: 12.5, marginBottom: 16 }}>Notes (optional)
              <textarea className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={submit}>{busy ? 'Recording…' : 'Record payment'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
