'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

// ============================================================
// Sprint 16 — the invoice side of payment allocation.
//
// Staff who start from the invoice rather than the payment get the
// mirror of the payment-detail panel: the client's (or order's)
// confirmed payments that still carry unallocated money, applied to
// this invoice. Same endpoint, same server-side validation.
// ============================================================

export interface CandidatePayment {
  id: string
  reference: string
  paymentDate: string | null
  method: string | null
  unallocated: number
}

function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }

export function InvoiceApplyPayment({ invoiceId, currency, balanceDue, payments, reason }: {
  invoiceId: string
  currency: string
  balanceDue: number
  payments: CandidatePayment[]
  reason: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<string>(payments[0]?.id ?? '')
  const [amount, setAmount] = useState('')

  const money = (n: number) => `${sym(currency)}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const chosen = useMemo(() => payments.find(p => p.id === sel) ?? null, [payments, sel])
  const cap = chosen ? Math.min(chosen.unallocated, balanceDue) : 0

  async function apply() {
    const amt = Number(amount)
    if (!chosen) { setErr('Select a payment.'); return }
    if (!(amt > 0)) { setErr('Enter an amount.'); return }
    if (amt > cap + 0.005) { setErr(`The most you can apply here is ${money(cap)}.`); return }
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/payments/${chosen.id}/allocate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, amount: amt }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.success === false) { setErr(json.error ?? 'Allocation failed'); return }
      setAmount(''); setOpen(false); router.refresh()
    } catch { setErr('Network error') } finally { setBusy(false) }
  }

  if (balanceDue <= 0.005) return null

  return (
    <div style={{ background: '#fff', border: '1px solid #ece7de', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ color: '#1B4332' }}>Payment</strong>
        <span style={{ fontSize: 13, color: '#6b6257' }}>{money(balanceDue)} outstanding</span>
        <div style={{ flex: 1 }} />
        {payments.length > 0 && (
          <button disabled={busy} onClick={() => setOpen(o => !o)} style={btn}>
            {open ? 'Close' : 'Apply payment'}
          </button>
        )}
      </div>

      {reason && (
        <p style={{ marginTop: 10, marginBottom: 0, fontSize: 12.5, color: '#8A6D3B', background: '#FDF6EC', padding: '8px 12px', borderRadius: 6 }}>
          {reason}
        </p>
      )}

      {open && payments.length > 0 && (
        <div style={{ marginTop: 12, padding: 12, background: '#F8F6F2', borderRadius: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={lbl}>Payment
              <select value={sel} onChange={e => { setSel(e.target.value); setAmount('') }} style={{ ...inp, minWidth: 260 }}>
                {payments.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.reference} · {money(p.unallocated)} unallocated{p.paymentDate ? ` · ${p.paymentDate}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label style={lbl}>Amount
              <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" style={{ ...inp, width: 110 }} />
            </label>
            <button type="button" disabled={busy} onClick={() => setAmount(cap.toFixed(2))} style={btnGhost}>Use {money(cap)}</button>
            <button disabled={busy} onClick={apply} style={btn}>{busy ? 'Applying…' : 'Apply'}</button>
          </div>
          <p style={{ fontSize: 12, color: '#9E9589', marginBottom: 0, marginTop: 8 }}>
            Capped at the lower of the payment&apos;s unallocated balance and this invoice&apos;s outstanding balance.
          </p>
        </div>
      )}

      {err && <p style={{ marginTop: 10, marginBottom: 0, fontSize: 13, color: '#a03030' }}>{err}</p>}
    </div>
  )
}

const btn: React.CSSProperties = { background: '#1B4332', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }
const btnGhost: React.CSSProperties = { background: '#fff', color: '#1B4332', border: '1px solid #cfc8bc', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#8A6D3B', textTransform: 'uppercase', letterSpacing: 0.4 }
const inp: React.CSSProperties = { padding: '7px 9px', border: '1px solid #d8d2c8', borderRadius: 6, fontSize: 13 }
