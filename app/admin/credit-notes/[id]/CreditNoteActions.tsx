'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { appConfirm } from '@/lib/appConfirm'
import type { CreditNoteAvailability } from '@/lib/commercial/creditNoteLogic'

// ============================================================
// Credit-note actions (Sprint 18, QA P0). Approve / issue / void /
// allocate / refund against the endpoints that have existed since
// Sprint 3/6. Availability (incl. segregation of duties and
// permission tiers) is computed server-side by creditNoteAvailability
// and enforced again by every API route.
// ============================================================

export interface AllocTarget { id: string; label: string; balance: number }

function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }

export default function CreditNoteActions({ creditNoteId, currency, availability, refundable, allocTargets }: {
  creditNoteId: string
  currency: string
  availability: CreditNoteAvailability
  refundable: number
  allocTargets: AllocTarget[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [panel, setPanel] = useState<'allocate' | 'refund' | null>(null)

  // Allocate form
  const [target, setTarget] = useState(allocTargets[0]?.id ?? '')
  const [allocAmount, setAllocAmount] = useState('')
  // Refund form
  const [rfAmount, setRfAmount] = useState(refundable > 0 ? refundable.toFixed(2) : '')
  const [rfMethod, setRfMethod] = useState('bank_transfer')
  const [rfDate, setRfDate] = useState('')
  const [rfRef, setRfRef] = useState('')
  const [rfReason, setRfReason] = useState('')

  const money = (n: number) => `${sym(currency)}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const chosen = allocTargets.find(t => t.id === target) ?? null
  const cap = chosen ? Math.min(chosen.balance, availability.available) : 0

  async function call(path: string, body: unknown): Promise<Record<string, unknown> | null> {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.success === false) { setErr(json.error ?? 'Action failed'); return null }
      router.refresh(); return json
    } catch { setErr('Network error'); return null } finally { setBusy(false) }
  }

  async function approve() {
    if (await appConfirm('Approve this credit note? It can then be issued and will reduce reported revenue once allocated.', { title: 'Approve credit note', confirmLabel: 'Approve' })) {
      if (await call(`/api/admin/credit-notes/${creditNoteId}`, { action: 'approve' })) setMsg('Credit note approved. It can now be issued.')
    }
  }
  async function issue() {
    if (await appConfirm('Issue this credit note? It becomes immutable and receives a credit-note number.', { title: 'Issue credit note', confirmLabel: 'Issue' })) {
      const j = await call(`/api/admin/credit-notes/${creditNoteId}`, { action: 'issue' })
      if (j) setMsg(`Issued as ${(j.data as Record<string, unknown>)?.creditNoteNumber ?? 'numbered credit note'}.`)
    }
  }
  async function doVoid() {
    const reason = prompt('Reason for voiding this credit note? (blocked once it has allocations)')
    if (!reason) return
    if (await call(`/api/admin/credit-notes/${creditNoteId}/void`, { reason })) setMsg('Credit note voided.')
  }
  async function allocate() {
    const amt = Number(allocAmount)
    if (!chosen) { setErr('Select an invoice.'); return }
    if (!(amt > 0)) { setErr('Enter an amount.'); return }
    if (amt > cap + 0.005) { setErr(`The most you can allocate here is ${money(cap)}.`); return }
    const j = await call(`/api/admin/credit-notes/${creditNoteId}`, { action: 'allocate', invoiceId: chosen.id, amount: amt })
    if (j) { setAllocAmount(''); setPanel(null); setMsg(`${money(amt)} allocated to ${chosen.label}.`) }
  }
  async function recordRefund() {
    const amt = Number(rfAmount)
    if (!(amt > 0)) { setErr('Enter a refund amount.'); return }
    if (amt > refundable + 0.005) { setErr(`The most refundable on this credit note is ${money(refundable)}.`); return }
    setBusy(true); setErr(null); setMsg(null)
    try {
      const res = await fetch('/api/admin/refunds', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditNoteId, amount: amt, method: rfMethod, refundDate: rfDate || undefined, externalReference: rfRef || undefined, reason: rfReason || undefined }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.success === false) { setErr(j.error ?? 'Could not record refund'); return }
      setPanel(null); setMsg(`Refund ${j.refundNumber ?? j.data?.refundNumber ?? ''} recorded — pending Ultra approval in Accounting → Refunds.`)
      router.refresh()
    } catch { setErr('Network error') } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {availability.canApprove && <button className="btn btn-primary btn-sm" disabled={busy} onClick={approve}>Approve</button>}
        {availability.canIssue && <button className="btn btn-primary btn-sm" disabled={busy} onClick={issue}>Issue credit note</button>}
        {availability.canAllocate && (
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setPanel(p => p === 'allocate' ? null : 'allocate')}>
            Allocate to invoice ({sym(currency)}{availability.available.toFixed(2)} unapplied)
          </button>
        )}
        {availability.canRefund && (
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setPanel(p => p === 'refund' ? null : 'refund')}>Record refund</button>
        )}
        {availability.canVoid && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={doVoid}>Void</button>}
      </div>

      {availability.approveBlockedReason && (
        <div style={{ padding: 12, background: '#FDF6EC', border: '1px solid #E8D5B5', borderRadius: 6, fontSize: 13, color: '#8A6D3B' }}>
          {availability.approveBlockedReason}
        </div>
      )}

      {panel === 'allocate' && availability.canAllocate && (
        <div style={{ padding: 16, background: '#F8F6F2', border: '1px solid #ece7de', borderRadius: 8 }}>
          <strong style={{ color: '#1B4332', fontSize: 14 }}>Allocate this credit note</strong>
          {allocTargets.length === 0 ? (
            <p style={{ fontSize: 13, color: '#8A6D3B', marginBottom: 0 }}>
              No issued invoices with an outstanding balance and matching currency were found for this client or order.
            </p>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginTop: 10 }}>
              <label style={lbl}>Invoice
                <select value={target} onChange={e => { setTarget(e.target.value); setAllocAmount('') }} style={{ ...inp, minWidth: 240 }}>
                  {allocTargets.map(t => <option key={t.id} value={t.id}>{t.label} · {money(t.balance)} outstanding</option>)}
                </select>
              </label>
              <label style={lbl}>Amount
                <input value={allocAmount} onChange={e => setAllocAmount(e.target.value)} inputMode="decimal" placeholder="0.00" style={{ ...inp, width: 110 }} />
              </label>
              <button type="button" disabled={busy} onClick={() => setAllocAmount(cap.toFixed(2))} style={btnGhost}>Use {money(cap)}</button>
              <button disabled={busy} onClick={allocate} style={btn}>{busy ? 'Allocating…' : 'Allocate'}</button>
            </div>
          )}
          <p style={{ fontSize: 12, color: '#9E9589', marginBottom: 0, marginTop: 8 }}>
            Reduces the invoice&apos;s balance through an allocation — mirrors the payment-allocation flow. Capped at the lower of the unapplied credit and the invoice&apos;s outstanding balance.
          </p>
        </div>
      )}

      {panel === 'refund' && availability.canRefund && (
        <div style={{ padding: 16, background: '#F8F6F2', border: '1px solid #ece7de', borderRadius: 8 }}>
          <strong style={{ color: '#1B4332', fontSize: 14 }}>Refund the unapplied credit</strong>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginTop: 10 }}>
            <label style={lbl}>Amount<input value={rfAmount} onChange={e => setRfAmount(e.target.value)} inputMode="decimal" style={{ ...inp, width: 100 }} /></label>
            <label style={lbl}>Method<select value={rfMethod} onChange={e => setRfMethod(e.target.value)} style={inp}>
              <option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="cash">Cash</option><option value="other">Other</option></select></label>
            <label style={lbl}>Date<input type="date" value={rfDate} onChange={e => setRfDate(e.target.value)} style={inp} /></label>
            <label style={lbl}>Reference<input value={rfRef} onChange={e => setRfRef(e.target.value)} style={inp} placeholder="optional" /></label>
            <label style={lbl}>Reason<input value={rfReason} onChange={e => setRfReason(e.target.value)} style={inp} placeholder="optional" /></label>
            <button disabled={busy} onClick={recordRefund} style={btn}>{busy ? 'Recording…' : 'Record'}</button>
          </div>
          <p style={{ fontSize: 12, color: '#8A6D3B', marginBottom: 0, marginTop: 8 }}>
            Segregation of duties: approval &amp; completion are Ultra-only, in Accounting → Refunds — never by whoever records the refund.
          </p>
        </div>
      )}

      {msg && <span style={{ color: '#1e7e34', fontSize: 13 }}>{msg}</span>}
      {err && <span style={{ color: '#a03030', fontSize: 13 }}>{err}</span>}
    </div>
  )
}

const btn: React.CSSProperties = { background: '#1B4332', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }
const btnGhost: React.CSSProperties = { background: '#fff', color: '#1B4332', border: '1px solid #cfc8bc', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#8A6D3B', textTransform: 'uppercase', letterSpacing: 0.4 }
const inp: React.CSSProperties = { padding: '7px 9px', border: '1px solid #d8d2c8', borderRadius: 6, fontSize: 13 }
