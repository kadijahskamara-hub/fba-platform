'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  orderId:        string
  currentStatus:  string
  trackingNumber: string | null
}

const NEXT_STEPS: Record<string, { label: string; next: string; requiresTracking?: boolean }[]> = {
  paid:       [{ label: 'Mark as processing', next: 'processing' },
               { label: 'Cancel order',       next: 'cancelled' }],
  processing: [{ label: 'Mark as shipped',    next: 'shipped', requiresTracking: true },
               { label: 'Cancel order',       next: 'cancelled' }],
  shipped:    [{ label: 'Mark as completed',  next: 'completed' }],
  pending:    [{ label: 'Mark as paid',       next: 'paid' },
               { label: 'Cancel order',       next: 'cancelled' }],
  cancelled:  [{ label: 'Issue refund',       next: 'refunded' }],
}

export function OrderStatusActions({ orderId, currentStatus, trackingNumber: initialTracking }: Props) {
  const router            = useRouter()
  const [isPending, start] = useTransition()
  const [tracking, setTracking] = useState(initialTracking ?? '')
  const [error, setError]  = useState('')

  const actions = NEXT_STEPS[currentStatus] ?? []

  if (actions.length === 0) {
    return (
      <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 24 }}>
        <p style={{ fontSize: 13, color: 'var(--stone)' }}>No further actions available.</p>
      </div>
    )
  }

  const handleAction = (next: string, requiresTracking?: boolean) => {
    if (requiresTracking && !tracking.trim()) {
      setError('Please enter a tracking number before marking as shipped.')
      return
    }
    setError('')

    start(async () => {
      const res = await fetch(`/api/admin/retail-orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: next,
          ...(tracking.trim() ? { tracking_number: tracking.trim() } : {}),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Update failed')
        return
      }

      router.refresh()
    })
  }

  return (
    <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 24 }}>
      <h3 className="h4" style={{ marginBottom: 20 }}>Actions</h3>

      {/* Tracking number input — shown when processing */}
      {currentStatus === 'processing' && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--stone)',
                          letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Tracking number
          </label>
          <input
            type="text"
            value={tracking}
            onChange={e => setTracking(e.target.value)}
            placeholder="e.g. JD123456789GB"
            className="input"
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
          />
        </div>
      )}

      {error && (
        <p style={{ fontSize: 12, color: '#c0392b', marginBottom: 16, lineHeight: 1.5 }}>{error}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {actions.map(({ label, next, requiresTracking }) => (
          <button
            key={next}
            className={next === 'cancelled' || next === 'refunded' ? 'btn btn-secondary' : 'btn btn-primary'}
            onClick={() => handleAction(next, requiresTracking)}
            disabled={isPending}
            style={{ width: '100%' }}
          >
            {isPending ? 'Updating…' : label}
          </button>
        ))}
      </div>
    </div>
  )
}
