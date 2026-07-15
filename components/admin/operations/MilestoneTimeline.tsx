'use client'

// Sprint 7 — derived milestone timeline for one commercial order.
// Embedded on the procurement screen; every milestone is dated
// from existing records (no manual milestone data entry).

import { useEffect, useState } from 'react'
import { box } from '@/components/admin/commercial/ui'

interface Milestone { key: string; label: string; date: string | null; reached: boolean }
interface Flag { type: string; refLabel: string | null; daysLate: number; detail: string }
interface Readiness { ready: boolean; blockers: string[] }

export function MilestoneTimeline({ orderId }: { orderId: string }) {
  const [data, setData] = useState<{
    milestones: Milestone[]; flags: Flag[]; readiness: Readiness
  } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/operations/orders/${orderId}/milestones`)
      .then(r => r.json())
      .then(res => { if (res.success) setData(res.data); else setFailed(true) })
      .catch(() => setFailed(true))
  }, [orderId])

  if (failed) return null
  if (!data) {
    return <div style={{ ...box, fontSize: 12, color: 'var(--stone)' }}>Loading milestones…</div>
  }

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : null

  return (
    <div style={box}>
      <div className="label" style={{ marginBottom: 14 }}>Procurement milestones</div>

      {/* Timeline */}
      <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 6 }}>
        {data.milestones.map((m, i) => (
          <div key={m.key} style={{ display: 'flex', alignItems: 'flex-start', flex: '1 0 auto', minWidth: 96 }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{
                width: 14, height: 14, borderRadius: '50%', margin: '0 auto 6px',
                background: m.reached ? 'var(--forest)' : 'transparent',
                border: `2px solid ${m.reached ? 'var(--forest)' : 'var(--light-line)'}`,
              }} />
              <div style={{ fontSize: 10.5, letterSpacing: '0.04em', color: m.reached ? 'var(--forest)' : 'var(--stone)', fontWeight: m.reached ? 600 : 400 }}>
                {m.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--stone)', marginTop: 2 }}>
                {fmt(m.date) ?? (m.reached ? '✓' : '—')}
              </div>
            </div>
            {i < data.milestones.length - 1 && (
              <div style={{
                height: 2, flex: '0 0 20px', marginTop: 6,
                background: m.reached ? 'var(--forest)' : 'var(--light-line)',
              }} />
            )}
          </div>
        ))}
      </div>

      {/* Readiness + flags */}
      <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5 }}>
          {data.readiness.ready ? (
            <span style={{ color: '#155724', fontWeight: 600 }}>✓ Ready to book delivery</span>
          ) : (
            <span style={{ color: '#8a6d1a' }}>
              <strong>Delivery blocked:</strong> {data.readiness.blockers.join(' · ')}
            </span>
          )}
        </div>
        {data.flags.length > 0 && (
          <div style={{ fontSize: 12.5, color: '#a03030' }}>
            {data.flags.map((f, i) => (
              <div key={i}>
                ⚑ {f.detail}{f.refLabel ? ` (${f.refLabel})` : ''} — {f.daysLate}d late
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
