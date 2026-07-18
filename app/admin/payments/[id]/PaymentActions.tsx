'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { appConfirm } from '@/lib/appConfirm'

// ============================================================
// Sprint 16 — payment allocation.
//
// The allocate endpoint existed from Sprint 3 but the picker was
// gated on a candidate list that matched invoices by client_id
// only, which is null across the quote->proforma->order flow. The
// control therefore never rendered and every confirmed payment sat
// permanently unallocated. This panel supports splitting one
// payment across several invoices, partial amounts, and removing
// an allocation again.
// ============================================================

interface InvoiceOpt { id: string; label: string; balance: number; dueDate: string | null }
interface AllocationRow { id: string; amount: number; invoiceNumber: string }

function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }

export default function PaymentActions({
  paymentId, status, unallocated, invoices, hasReceipt, currency, allocations, noCandidatesReason,
}: {
  paymentId: string
  status: string
  unallocated: number
  invoices: InvoiceOpt[]
  hasReceipt: boolean
  currency: string
  allocations: AllocationRow[]
  noCandidatesReason: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const money = (n: number) => `${sym(currency)}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const entered = useMemo(() => Object.values(draft)
    .reduce((s, v) => s + (Number(v) > 0 ? Number(v) : 0), 0), [draft])
  const remaining = Math.round((unallocated - entered) * 100) / 100
  const overAllocated = remaining < -0.005

  async function call(path: string, body?: unknown, method = 'POST') {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.success === false) { setErr(json.error ?? 'Action failed'); return false }
      router.refresh(); return true
    } catch { setErr('Network error'); return false } finally { setBusy(false) }
  }

  /** Allocate every non-empty row, stopping at the first server rejection. */
  async function saveAllocations() {
    const rows = Object.entries(draft)
      .map(([invoiceId, v]) => ({ invoiceId, amount: Number(v) }))
      .filter(r => r.amount > 0)
    if (rows.length === 0) { setErr('Enter an amount against at least one invoice.'); return }
    if (overAllocated) { setErr(`That is ${money(Math.abs(remaining))} more than this payment has left to allocate.`); return }

    setBusy(true); setErr(null)
    let applied = 0
    for (const r of rows) {
      const res = await fetch(`/api/admin/payments/${paymentId}/allocate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: r.invoiceId, amount: r.amount }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.success === false) {
        setBusy(false)
        setErr(applied > 0
          ? `${applied} allocation(s) saved, then: ${json.error ?? 'allocation failed'}`
          : (json.error ?? 'Allocation failed'))
        router.refresh()
        return
      }
      applied += 1
    }
    setBusy(false); setDraft({}); setOpen(false); router.refresh()
  }

  const canAllocate = status === 'confirmed' && unallocated > 0.005

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {status === 'pending' && (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => call(`/api/admin/payments/${paymentId}`, { action: 'confirm' })}>Confirm payment</button>
        )}
        {status === 'confirmed' && (
          <>
            {canAllocate && invoices.length > 0 && (
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setOpen(o => !o)}>
                {open ? 'Close' : `Allocate to invoice (${money(unallocated)} unallocated)`}
              </button>
            )}
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => call(`/api/admin/payments/${paymentId}`, { action: 'receipt' })}>{hasReceipt ? 'Re-issue receipt' : 'Issue receipt'}</button>
            {hasReceipt && <a className="btn btn-secondary btn-sm" href={`/api/admin/payments/${paymentId}/receipt`} target="_blank" rel="noreferrer">Open receipt</a>}
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { const r = prompt('Reason for reversing this payment?'); if (r) call(`/api/admin/payments/${paymentId}/reverse`, { reason: r }) }}>Reverse</button>
          </>
        )}
      </div>

      {/* Sprint 18 QA (P2): the explanation used to render only for
          confirmed payments, so a pending payment showed no allocation
          control AND no reason. noCandidateReason() already covers the
          pending case ("Only confirmed payments can be allocated") — it
          just has to be allowed to render. */}
      {noCandidatesReason && (
        <div style={{ padding: 12, background: '#FDF6EC', border: '1px solid #E8D5B5', borderRadius: 6, fontSize: 13, color: '#8A6D3B' }}>
          {noCandidatesReason}
        </div>
      )}

      {open && canAllocate && invoices.length > 0 && (
        <div style={{ padding: 16, background: '#F8F6F2', border: '1px solid #ece7de', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <strong style={{ color: '#1B4332', fontSize: 14 }}>Allocate this payment</strong>
            <span style={{ fontSize: 12.5, color: overAllocated ? '#B4472A' : '#6b6257' }}>
              {money(entered)} of {money(unallocated)} · {overAllocated ? `over by ${money(Math.abs(remaining))}` : `${money(remaining)} left`}
            </span>
          </div>

          <table className="data-table" style={{ marginBottom: 12 }}>
            <thead><tr><th>Invoice</th><th>Due</th><th style={{ textAlign: 'right' }}>Balance</th><th style={{ width: 150 }}>Allocate</th></tr></thead>
            <tbody>
              {invoices.map(inv => {
                const cap = Math.min(inv.balance, unallocated)
                return (
                  <tr key={inv.id}>
                    <td>{inv.label}</td>
                    <td style={{ fontSize: 12, color: '#6b6257' }}>{inv.dueDate ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{money(inv.balance)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          value={draft[inv.id] ?? ''}
                          inputMode="decimal"
                          placeholder="0.00"
                          onChange={e => setDraft(d => ({ ...d, [inv.id]: e.target.value }))}
                          style={{ padding: '6px 8px', width: 90, border: '1px solid #d8d2c8', borderRadius: 5, fontSize: 13 }}
                        />
                        <button
                          type="button"
                          title={`Fill ${money(cap)}`}
                          onClick={() => setDraft(d => ({ ...d, [inv.id]: cap.toFixed(2) }))}
                          style={{ background: 'none', border: 'none', color: '#1B4332', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
                        >max</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" disabled={busy || overAllocated || entered <= 0} onClick={saveAllocations}>
              {busy ? 'Saving…' : 'Save allocation'}
            </button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setDraft({}); setOpen(false); setErr(null) }}>Cancel</button>
            <span style={{ fontSize: 12, color: '#9E9589' }}>
              Split across several invoices by entering an amount against each. Partial amounts are allowed.
            </span>
          </div>
        </div>
      )}

      {allocations.length > 0 && status === 'confirmed' && (
        <div style={{ fontSize: 12.5, color: '#6b6257', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>Applied to:</span>
          {allocations.map(a => (
            <span key={a.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: '#EEF3EE', padding: '3px 9px', borderRadius: 20 }}>
              {a.invoiceNumber} · {money(a.amount)}
              <button
                type="button"
                disabled={busy}
                title="Remove this allocation"
                onClick={async () => {
                  // Sprint 18 QA (P2): destructive action — use the styled
                  // in-app confirmation (native confirm() is suppressed in
                  // some environments, letting this run with no prompt).
                  if (await appConfirm(
                    `Remove the ${money(a.amount)} allocation to ${a.invoiceNumber}? The invoice's paid and balance figures will be recalculated.`,
                    { title: 'Remove allocation', confirmLabel: 'Remove' },
                  )) call(`/api/admin/payments/${paymentId}/allocate`, { allocationId: a.id }, 'DELETE')
                }}
                style={{ background: 'none', border: 'none', color: '#B4472A', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
              >&times;</button>
            </span>
          ))}
        </div>
      )}

      {err && <span style={{ color: '#a03030', fontSize: 13 }}>{err}</span>}
    </div>
  )
}
