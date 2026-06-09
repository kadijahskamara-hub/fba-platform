'use client'

import type { Category } from '@/lib/types'

interface Props {
  categories:    Category[]
  activeCategory: string
  activeSubcategory: string
  onSubcategory: (slug: string) => void
}

export function TheEditFilterBar({
  categories,
  activeCategory,
  activeSubcategory,
  onSubcategory,
}: Props) {
  const cat = categories.find(c => c.slug === activeCategory)
  const subs = cat?.subcategories ?? []

  // No bar needed when no category selected or category has no subcategories
  if (!activeCategory || subs.length === 0) {
    return (
      <div style={{
        background:   'var(--light-bg, #f2f0eb)',
        borderBottom: '1px solid var(--light-line, #e0ddd7)',
        padding:      '0 48px',
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 8, height: 48 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--stone, #7a7065)', textTransform: 'uppercase', marginRight: 8 }}>
            Filter:
          </span>
          <button
            style={{
              padding:       '4px 14px',
              fontSize:      11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight:    600,
              background:    'var(--forest, #1a2e16)',
              color:         '#fff',
              border:        'none',
              borderRadius:  2,
              cursor:        'default',
            }}
          >
            All
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background:   'var(--light-bg, #f2f0eb)',
      borderBottom: '1px solid var(--light-line, #e0ddd7)',
      padding:      '0 48px',
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 8, height: 48, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--stone, #7a7065)', textTransform: 'uppercase', marginRight: 4 }}>
          Filter:
        </span>

        {/* All subcategories pill */}
        <button
          onClick={() => onSubcategory('')}
          style={{
            padding:       '4px 14px',
            fontSize:      11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight:    !activeSubcategory ? 600 : 400,
            background:    !activeSubcategory ? 'var(--forest, #1a2e16)' : 'transparent',
            color:         !activeSubcategory ? '#fff' : 'var(--stone, #7a7065)',
            border:        !activeSubcategory ? 'none' : '1px solid var(--light-line, #e0ddd7)',
            borderRadius:  2,
            cursor:        'pointer',
            transition:    'all 0.15s',
          }}
        >
          All
        </button>

        {subs.map(sub => {
          const isActive = activeSubcategory === sub.slug
          return (
            <button
              key={sub.id}
              onClick={() => onSubcategory(isActive ? '' : sub.slug)}
              style={{
                padding:       '4px 14px',
                fontSize:      11,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight:    isActive ? 600 : 400,
                background:    isActive ? 'var(--forest, #1a2e16)' : 'transparent',
                color:         isActive ? '#fff' : 'var(--stone, #7a7065)',
                border:        isActive ? 'none' : '1px solid var(--light-line, #e0ddd7)',
                borderRadius:  2,
                cursor:        'pointer',
                transition:    'all 0.15s',
                whiteSpace:    'nowrap',
              }}
            >
              {sub.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
