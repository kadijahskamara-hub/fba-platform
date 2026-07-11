'use client'

import { useState } from 'react'
import { box, CommercialDoc, DocPermissions } from './ui'

const BANNER: Record<string, { bg: string; fg: string; label: string }> = {
  none: { bg: '#eef5ef', fg: 'var(--forest)', label: 'No approval needed' },
  approved: { bg: '#eef5ef', fg: 'var(--forest)', label: 'Approved' },
  required_commercial: { bg: '#faf3dd', fg: '#8a6d1a', label: 'Commercial Admin approval required' },
  required_ultra: { bg: '#fdeeda', fg: '#9a5b12', label: 'Ultra Admin approval required' },
  blocked: { bg: '#fdf0f0', fg: '#a03030', label: 'Blocked — negative margin' },
}

export function ApprovalStatusPanel({ doc, perms, onAction }: {
  doc: CommercialDoc
  perms: DocPermissions
  onAction: (action: 'approve' | 'reject', note: string | null) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const status = doc.approval_status
  const b = BANNER[status] ?? BANNER.none
  const reasons = doc.totals?.approvalReasons ?? (doc.approval_reason ? [doc.approval_reason] : [])

  const mayApprove =
    (status === 'required_commercial' && (perms.canApprove || perms.isUltraAdmin)) ||
    ((status === 'required_ultra' || status === 'blocked') && perms.isUltraAdmin)

  const act = async (action: 'approve' | 'reject') => {
    const note = prompt(action === 'approve' ? 'Approval note (optional):' : 'Rejection note (optional):') ?? null
    setBusy(true)
    await onAction(action, note)
    setBusy(false)
  }

  return (
    <div style={{ ...box, background: b.bg, borderColor: b.fg, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <strong style={{ color: b.fg, fontSize: 13, letterSpacing: '0.05em' }}>{b.label.toUpperCase()}</strong>
        {status === 'approved' && doc.approved_at && (
          <span style={{ fontSize: 12, color: 'var(--stone)' }}>approved {new Date(doc.approved_at).toLocaleString('en-GB')}</span>
        )}
        <span style={{ flex: 1 }} />
        {mayApprove && !doc.locked_at && (
          <>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act('approve')}>
              {status === 'blocked' ? 'Ultra Admin: approve negative margin' : 'Approve'}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act('reject')}>Reject</button>
          </>
        )}
      </div>
      {status !== 'none' && status !== 'approved' && reasons.length > 0 && (
        <ul style={{ margin: '10px 0 0 18px', fontSize: 12.5, color: b.fg }}>
          {reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
    </div>
  )
}
