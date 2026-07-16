'use client'

// Billing panel for a commercial order (QA items 1 & 2): shows the
// invoiceable position, existing ledger invoices, a Create Invoice
// action (the API existed; no screen offered it) and a Record Payment
// action so deposit/stage balances can actually be satisfied.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import RecordPaymentModal from './RecordPaymentModal'

const TYPES = [
  ['deposit', 'Deposit'], ['stage', 'Stage'], ['final', 'Final'],
  ['service', 'Service'], ['adjustment', 'Adjustment'],
] as const

function money(n: unknown, cur: string) {
  const sym = cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£'
  return `${sym}${Number(n ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
}

interface InvoiceRow {
  id: string; invoice_number: string | null; invoice_type: string; status: string
  gross_total: number; amount_paid: number; balance_due: number; due_date: string | null
}
interface BillingState {
  orderGross: number; priorInvoiced: number; paid: number; outstanding: number
  remainingToInvoice: number; invoices: InvoiceRow[]
  order: { currency?: string; client_id?: string | null }
}

export default function OrderBillingPanel({ orderId }: { orderId: string }) {
  const [state, setState] = useState<BillingState | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [invoiceType, setInvoiceType] = useState('deposit')
  const [stageAmount, setStageAmount] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/commercial-orders/${orderId}/invoices`)
    const data = await res.json()
    if (data.success) setState(data.data)
  }, [orderId])
  useEffect(() => { load() }, [load])

  if (!state) return null
  const currency = state.order?.currency ?? 'GBP'

  const createInvoice = async () => {
    setErr(''); setBusy(true)
    try {
      const body: Record<string, unknown> = { invoiceType }
      if (invoiceType === 'stage' && stageAmount) body.stageAmount = parseFloat(stageAmount)
      const res = await fetch(`/api/admin/commercial-orders/${orderId}/invoices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.success) setErr(data.error ?? 'Could not create the invoice.')
      else await load()
    } catch { setErr('Request failed.') }
    setBusy(false)
  }

  return (
    <div className="admin-card" style={{ marginBottom: 24, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Billing</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="form-input" style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }}
            value={invoiceType} onChange={e => setInvoiceType(e.target.value)} aria-label="Invoice type">
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {invoiceType === 'stage' && (
            <input type="number" min="0.01" step="0.01" className="form-input" placeholder="Stage amount"
              style={{ width: 130, padding: '6px 10px', fontSize: 13 }}
              value={stageAmount} onChange={e => setStageAmount(e.target.value)} aria-label="Stage amount" />
          )}
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={createInvoice}>
            {busy ? 'Creating…' : 'Create invoice'}
          </button>
          <RecordPaymentModal commercialOrderId={orderId} clientId={state.order?.client_id ?? null} currency={currency} onDone={load} />
        </div>
      </div>
      {err && <p style={{ color: '#a33', fontSize: 13 }}>{err}</p>}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: 'var(--stone)', margin: '12px 0' }}>
        <span>Order value <strong style={{ color: 'var(--forest)' }}>{money(state.orderGross, currency)}</strong></span>
        <span>Invoiced <strong style={{ color: 'var(--forest)' }}>{money(state.priorInvoiced, currency)}</strong></span>
        <span>Paid <strong style={{ color: '#1e7e34' }}>{money(state.paid, currency)}</strong></span>
        <span>Outstanding <strong style={{ color: state.outstanding > 0 ? '#8a6d1a' : 'var(--forest)' }}>{money(state.outstanding, currency)}</strong></span>
        <span>Remaining to invoice <strong style={{ color: 'var(--forest)' }}>{money(state.remainingToInvoice, currency)}</strong></span>
      </div>

      {state.invoices.length > 0 && (
        <table className="admin-table" style={{ fontSize: 13 }}>
          <thead>
            <tr><th>Invoice</th><th>Type</th><th>Status</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Balance</th><th>Due</th></tr>
          </thead>
          <tbody>
            {state.invoices.map(i => (
              <tr key={i.id}>
                <td><Link href={`/admin/invoices/${i.id}`} style={{ color: 'var(--forest)', fontWeight: 500 }}>{i.invoice_number ?? 'Draft'}</Link></td>
                <td>{i.invoice_type}</td>
                <td><span className="status-pill">{i.status.replace(/_/g, ' ')}</span></td>
                <td style={{ textAlign: 'right' }}>{money(i.gross_total, currency)}</td>
                <td style={{ textAlign: 'right' }}>{money(i.balance_due, currency)}</td>
                <td>{i.due_date ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
