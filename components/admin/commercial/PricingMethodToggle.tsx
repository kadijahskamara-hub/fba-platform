'use client'

// Markup / margin toggle. Switching the method never touches stored
// costs — the server recalculates selling prices from the same cost
// basis using the newly selected method.
//   Markup % = (selling − cost) ÷ cost × 100
//   Margin % = (selling − cost) ÷ selling × 100

export function PricingMethodToggle({ value, disabled, onChange, compact }: {
  value: 'markup' | 'margin'
  disabled?: boolean
  compact?: boolean
  onChange: (method: 'markup' | 'margin') => void
}) {
  const btn = (m: 'markup' | 'margin', label: string) => (
    <button
      key={m}
      type="button"
      disabled={disabled}
      onClick={() => value !== m && onChange(m)}
      title={m === 'markup' ? 'Markup % = (selling − cost) ÷ cost' : 'Margin % = (selling − cost) ÷ selling'}
      style={{
        padding: compact ? '3px 10px' : '6px 14px',
        fontSize: compact ? 11 : 12.5,
        letterSpacing: '0.06em',
        border: '1px solid var(--light-line)',
        cursor: disabled ? 'default' : 'pointer',
        background: value === m ? 'var(--forest)' : 'var(--warm-white)',
        color: value === m ? '#fff' : 'var(--stone)',
        opacity: disabled ? 0.6 : 1,
      }}>
      {label}
    </button>
  )
  return <span style={{ display: 'inline-flex' }}>{btn('markup', 'Markup %')}{btn('margin', 'Margin %')}</span>
}
