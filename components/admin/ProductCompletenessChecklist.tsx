// ============================================================
// Edit-page completeness checklist (QA item 1, July 2026).
// Server-rendered; uses <details> so it needs no client JS.
// Shows exactly which of the 11 product_health checks are still
// outstanding and where to fill each one — no more trial-and-error
// saves to move the percentage.
// ============================================================

import { completenessBreakdown, COMPLETENESS_CHECKS, type ProductHealthChecks } from '@/lib/productCompleteness'

export default function ProductCompletenessChecklist({ health }: { health: Partial<ProductHealthChecks> | null }) {
  if (!health) return null
  const b = completenessBreakdown(health)
  const colour = b.percent >= 80 ? '#166534' : b.percent >= 50 ? '#B45309' : '#B91C1C'

  return (
    <details
      open={b.missing.length > 0}
      style={{ marginBottom: 16, border: '1px solid var(--light-line)', background: 'var(--warm-white)' }}
    >
      <summary style={{ cursor: 'pointer', padding: '12px 16px', fontSize: 13, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ color: colour }}>Completeness {b.percent}%</strong>
        <span style={{ color: 'var(--stone)', fontSize: 12 }}>
          {b.done}/{b.total} checks · {b.missing.length === 0 ? 'nothing outstanding' : `${b.missing.length} outstanding`}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--stone)' }}>
          All checks apply to every category — none are category-specific.
        </span>
      </summary>
      <div style={{ padding: '4px 16px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '4px 20px' }}>
        {COMPLETENESS_CHECKS.map(c => {
          const done = health[c.key] === true
          return (
            <div key={c.key} style={{ fontSize: 12.5, color: done ? 'var(--stone)' : 'var(--forest)' }}>
              <span style={{ color: done ? '#166534' : '#B91C1C' }}>{done ? '✓' : '✗'}</span>{' '}
              {c.label}
              {!done && <span style={{ color: 'var(--stone)', opacity: 0.8 }}> — {c.hint}</span>}
            </div>
          )
        })}
      </div>
    </details>
  )
}
