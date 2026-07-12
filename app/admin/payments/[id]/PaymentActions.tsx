'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface InvoiceOpt { id: string; label: string; balance: number }

export default function PaymentActions({ paymentId, status, unallocated, invoices, hasReceipt }: {
  paymentId: string; status: string; unallocated: number; invoices: InvoiceOpt[]; hasReceipt: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [invId, setInvId] = useState(invoices[0]?.id ?? '')
  const [amount, setAmount] = useState('')

  async function call(path: string, body?: unknown, method = 'POST') {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.success === false) { setErr(json.error ?? 'Action failed'); return false }
      router.refresh(); return true
    } catch { setErr('Network error'); return false } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {status === 'pending' && (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => call(`/api/admin/payments/${paymentId}`, { action: 'confirm' })}>Confirm payment</button>
        )}
        {status === 'confirmed' && (
          <>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => call(`/api/admin/payments/${paymentId}`, { action: 'receipt' })}>{hasReceipt ? 'Re-issue receipt' : 'Issue receipt'}</button>
            {hasReceipt && <a className="btn btn-secondary btn-sm" href={`/api/admin/payments/${paymentId}/receipt`} target="_blank" rel="noreferrer">Open receipt</a>}
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { const r = prompt('Reason for reversing this payment?'); if (r) call(`/api/admin/payments/${paymentId}/reverse`, { reason: r }) }}>Reverse</button>
          </>
        )}
      </div>

      {status === 'confirmed' && unallocated > 0.005 && invoices.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: 12, background: 'var(--sand, #f4f2ea)', borderRadius: 4 }}>
          <span style={{ fontSize: 13, color: 'var(--stone)' }}>Allocate {unallocated.toFixed(2)} to:</span>
          <select value={invId} onChange={e => setInvId(e.target.value)} style={{ padding: 6 }}>
            {invoices.map(o => <option key={o.id} value={o.id}>{o.label} (bal {o.balance.toFixed(2)})</option>)}
          </select>
          <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="amount" style={{ padding: 6, width: 100 }} />
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={async () => {
            const amt = Number(amount); if (!(amt > 0)) { setErr('Enter an amount'); return }
            const ok = await call(`/api/admin/payments/${paymentId}/allocate`, { invoiceId: invId, amount: amt }); if (ok) setAmount('')
          }}>Allocate</button>
        </div>
      )}
      {err && <span style={{ color: '#a03030', fontSize: 13 }}>{err}</span>}
    </div>
  )
}
