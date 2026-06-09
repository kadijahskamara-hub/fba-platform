'use client'

interface Chip {
  label:   string
  onRemove: () => void
}

interface Props {
  chips:      Chip[]
  onClearAll: () => void
}

export function TheEditActiveFilters({ chips, onClearAll }: Props) {
  if (chips.length === 0) return null

  return (
    <div style={{
      display:    'flex',
      alignItems: 'center',
      gap:        8,
      flexWrap:   'wrap',
      padding:    '10px 0',
      borderBottom: '1px solid var(--light-line, #e0ddd7)',
      marginBottom: 20,
    }}>
      <span style={{ fontSize: 11, color: 'var(--stone, #7a7065)', letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
        Active:
      </span>

      {chips.map((chip, i) => (
        <span
          key={i}
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          6,
            padding:      '3px 10px 3px 12px',
            background:   'var(--forest, #1a2e16)',
            color:        '#fff',
            fontSize:     11,
            borderRadius: 2,
          }}
        >
          {chip.label}
          <button
            onClick={chip.onRemove}
            aria-label={`Remove ${chip.label} filter`}
            style={{
              background: 'none',
              border:     'none',
              color:      'rgba(255,255,255,0.6)',
              cursor:     'pointer',
              fontSize:   14,
              lineHeight: 1,
              padding:    0,
              display:    'flex',
              alignItems: 'center',
            }}
          >
            ×
          </button>
        </span>
      ))}

      <button
        onClick={onClearAll}
        style={{
          background:    'none',
          border:        'none',
          fontSize:      11,
          color:         'var(--caramel, #c9a96e)',
          cursor:        'pointer',
          textDecoration: 'underline',
          padding:       0,
          marginLeft:    4,
        }}
      >
        Clear all
      </button>
    </div>
  )
}
