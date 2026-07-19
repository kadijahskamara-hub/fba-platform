'use client'

// Sprint 7.1 — Ultra-only permanent deletion of one commercial
// record (quote, order, invoice, payment, credit note, refund,
// delivery, PO, retail order, quote request) with dependents.
// Self-gating: renders nothing unless the live Ultra check passes,
// so it can be dropped onto any admin screen without extra
// permission plumbing. The API re-checks live on every call.

import { useEffect, useState } from 'react'
import type { DeletableEntity } from '@/lib/commercial/authorityLogic'

const ENTITY_LABELS: Record<DeletableEntity, string> = {
  proforma: 'quote / proforma',
  commercial_order: 'commercial order',
  sales_invoice: 'invoice',
  payment: 'payment',
  credit_note: 'credit note',
  refund: 'refund',
  delivery: 'delivery',
  purchase_order: 'purchase order',
  retail_order: 'retail order',
  quote_request: 'quote request',
  custom_match: 'Custom Match request',
  trade_application: 'trade application',
  service_enquiry: 'service enquiry',
}

export function UltraDeleteRecordButton({
  entity,
  recordId,
  label,
  redirectTo,
  onDeleted,
}: {
  entity: DeletableEntity
  recordId: string
  /** Human label shown in the dialog, e.g. the document number. */
  label: string
  /** Where to go after deletion (e.g. the list page). */
  redirectTo?: string
  onDeleted?: () => void
}) {
  const [isUltra, setIsUltra] = useState(false)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/authority/me').then(r => r.json())
      .then(res => setIsUltra(Boolean(res?.data?.isUltraAdmin)))
      .catch(() => {})
  }, [])

  if (!isUltra) return null

  async function handleDelete() {
    if (reason.trim().length === 0 || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/authority/delete-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, id: recordId, reason: reason.trim() }),
      })
      const json = await res.json()
      if (!json.success) {
        setError(json.error ?? 'Deletion failed')
        return
      }
      setOpen(false)
      onDeleted?.()
      if (redirectTo) window.location.href = redirectTo
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        className="btn btn-sm"
        onClick={() => { setOpen(true); setReason(''); setError('') }}
        title={`Permanently delete this ${ENTITY_LABELS[entity]} — Ultra Admin only`}
        style={{
          color: 'var(--danger)', border: '1px solid var(--danger)',
          background: 'transparent', padding: '6px 14px',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Delete record…
      </button>

      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(20,28,18,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
          onClick={e => { if (e.target === e.currentTarget && !busy) setOpen(false) }}
        >
          <div style={{
            background: 'var(--warm-white)', border: '1.5px solid var(--danger)',
            maxWidth: 480, width: '100%', padding: '26px 30px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: 'var(--danger)', marginBottom: 14,
            }}>
              Delete {ENTITY_LABELS[entity]}
            </div>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--forest)', marginBottom: 12 }}>{label}</p>
            <p style={{
              fontSize: 12.5, lineHeight: 1.6, color: 'var(--forest)',
              background: 'rgba(176,58,46,0.06)', border: '1px solid rgba(176,58,46,0.25)',
              padding: '10px 14px', marginBottom: 16,
            }}>
              <strong>This cannot be undone.</strong> The record and everything that
              belongs to it (lines, documents, linked financial entries) are
              permanently removed. Intended for test data — live trading records
              should be voided or credited instead.
            </p>
            <label className="form-label">Reason *</label>
            <textarea
              className="form-input"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. test order — pre-launch cleanup"
              style={{ resize: 'vertical', marginBottom: 12 }}
            />
            {error && <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-sm"
                disabled={busy || reason.trim().length === 0}
                onClick={handleDelete}
                style={{
                  background: reason.trim() ? 'var(--danger)' : 'rgba(176,58,46,0.35)',
                  color: '#fff', border: 'none', padding: '8px 18px',
                  fontSize: 12, fontWeight: 600,
                  cursor: reason.trim() && !busy ? 'pointer' : 'not-allowed',
                }}
              >
                {busy ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
