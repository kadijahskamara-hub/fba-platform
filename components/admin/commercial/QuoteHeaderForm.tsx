'use client'

import { Field, box, CommercialDoc } from './ui'
import { PROFORMA_STAGES, LOST_REASONS, stageLabel } from '@/lib/pipeline'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', pending_approval: 'Pending approval', approved: 'Approved',
  issued: 'Issued', cancelled: 'Cancelled',
}

export function QuoteHeaderForm({ doc, locked, busy, onPatch, onChangeStage }: {
  doc: CommercialDoc
  locked: boolean
  busy: boolean
  onPatch: (patch: Record<string, unknown>) => Promise<boolean>
  onChangeStage: (stage: string, lostReason?: string) => void
}) {
  return (
    <>
      <div className="admin-header">
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <a href="/admin/quotes" className="btn btn-ghost btn-sm">← Pipeline</a>
            <h1 className="admin-title" style={{ margin: 0 }}>{doc.quote_number ?? doc.proforma_number}</h1>
            {doc.revision_number > 1 && <span className="status-pill">Rev R{String(doc.revision_number).padStart(2, '0')}</span>}
            <span className={`status-pill status-${doc.document_status}`}
              style={doc.document_status === 'issued' ? { background: 'var(--forest)', color: '#fff' } : undefined}>
              {STATUS_LABEL[doc.document_status] ?? doc.document_status}{locked ? ' · locked' : ''}
            </span>
            <span className={`status-pill status-${doc.stage}`}>{stageLabel(doc.stage)}{doc.stage === 'lost' && doc.lost_reason ? ` · ${doc.lost_reason}` : ''}</span>
            {doc.invoice_number && <span className="status-pill" style={{ background: 'var(--forest)', color: '#fff' }}>{doc.invoice_number}</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--stone)', marginTop: 6 }}>
            Pro forma ref {doc.proforma_number} · Quote date {doc.quote_date ?? '—'} · Valid until {doc.valid_until ?? '—'}
            {doc.valid_until && new Date(doc.valid_until) < new Date() && (
              <strong style={{ color: '#a03030' }}> · EXPIRED</strong>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--stone)' }}>Stage</label>
          <select className="form-select" value={doc.stage} disabled={busy} style={{ fontSize: 13 }}
            onChange={e => {
              const stage = e.target.value
              if (stage === 'lost') {
                const reason = prompt(`Reason for marking Lost?\nOne of: ${LOST_REASONS.map(r => r.key).join(', ')}`, 'price')
                if (!reason) return
                onChangeStage(stage, reason)
              } else onChangeStage(stage)
            }}>
            {PROFORMA_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div style={box}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Field label="Quote date" value={doc.quote_date} onSave={v => onPatch({ quoteDate: v || null })} placeholder="YYYY-MM-DD" disabled={locked} />
          <Field label="Valid until" value={doc.valid_until} onSave={v => onPatch({ validUntil: v || null })} placeholder="YYYY-MM-DD" disabled={locked} />
          <Field label="Currency" value={doc.currency} onSave={v => onPatch({ currency: v || 'GBP' })} placeholder="GBP" disabled={locked} />
        </div>
      </div>
    </>
  )
}
