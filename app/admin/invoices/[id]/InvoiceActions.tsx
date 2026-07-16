'use client'
import { useState } from 'react'
import { appConfirm } from '@/lib/appConfirm'
import { useRouter } from 'next/navigation'

export default function InvoiceActions({ invoiceId, locked }: { invoiceId: string; locked: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function call(path: string, body?: unknown, method = 'POST') {
    setBusy(path); setErr(null)
    try {
      const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.success === false) { setErr(json.error ?? 'Action failed'); return }
      router.refresh()
    } catch { setErr('Network error') } finally { setBusy('') }
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <a className="btn btn-secondary btn-sm" href={`/api/admin/invoices/${invoiceId}/document`} target="_blank" rel="noreferrer">Open document</a>
      {!locked && (
        <>
          <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => call(`/api/admin/invoices/${invoiceId}`, { action: 'recalc' })}>Recalculate</button>
          <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={async () => { if (await appConfirm('Issue this invoice? It becomes immutable and gets an invoice number.')) call(`/api/admin/invoices/${invoiceId}/issue`) }}>Issue invoice</button>
          <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => { const r = prompt('Reason for voiding this draft invoice?'); if (r) call(`/api/admin/invoices/${invoiceId}`, { action: 'void', reason: r }) }}>Void</button>
        </>
      )}
      {err && <span style={{ color: '#a03030', fontSize: 13 }}>{err}</span>}
    </div>
  )
}
