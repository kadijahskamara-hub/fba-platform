'use client'

import { box, CommercialDoc } from './ui'

// Revision context: which revision is live, what has been superseded,
// and the frozen documents each revision produced.
export function RevisionHistoryPanel({ doc }: { doc: CommercialDoc }) {
  if (doc.revision_number <= 1 && doc.issued.length === 0) return null

  const byRevision = new Map<number, typeof doc.issued>()
  for (const d of doc.issued) {
    if (!byRevision.has(d.revision)) byRevision.set(d.revision, [])
    byRevision.get(d.revision)!.push(d)
  }
  const revisions = [...byRevision.keys()].sort((a, b) => b - a)

  return (
    <div style={box}>
      <div className="label" style={{ marginBottom: 10 }}>Revision history</div>
      <div style={{ fontSize: 13 }}>
        <div style={{ padding: '6px 0', borderBottom: '1px solid var(--light-line)' }}>
          <strong>R{String(doc.revision_number).padStart(2, '0')}</strong>
          <span style={{ color: 'var(--stone)' }}> — current working revision ({doc.locked_at ? 'issued & locked' : 'editable draft'})</span>
        </div>
        {revisions.map(rev => (
          <div key={rev} style={{ padding: '6px 0', borderBottom: '1px solid var(--light-line)', color: 'var(--stone)' }}>
            <strong style={{ color: 'inherit' }}>R{String(rev).padStart(2, '0')}</strong>
            {' — '}
            {byRevision.get(rev)!.map(d => `${d.document_number} (${d.doc_type.replace('_', ' ')}, ${new Date(d.issued_at).toLocaleDateString('en-GB')})`).join(' · ')}
          </div>
        ))}
        <p style={{ fontSize: 11.5, color: 'var(--stone)', marginTop: 8 }}>
          Issued documents are immutable snapshots — they always render exactly as issued, regardless of later edits.
        </p>
      </div>
    </div>
  )
}
