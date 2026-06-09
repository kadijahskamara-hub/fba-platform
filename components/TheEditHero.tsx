'use client'

import type { Category } from '@/lib/types'

interface Props {
  categories:    Category[]
  heroImage?:    { url: string; alt: string }
  activeCategory: string
  onCategory:    (slug: string) => void
}

export function TheEditHero({ categories, heroImage, activeCategory, onCategory }: Props) {
  const hasImage = !!heroImage?.url

  return (
    <div
      className="the-edit-hero"
      style={{
        position:        'relative',
        backgroundColor: 'var(--forest)',
        overflow:        'hidden',
      }}
    >
      {/* Hero image layer */}
      {hasImage && (
        <div
          aria-hidden
          style={{
            position:           'absolute',
            inset:              0,
            backgroundImage:    `url(${heroImage!.url})`,
            backgroundSize:     'cover',
            backgroundPosition: 'center',
            zIndex:             0,
          }}
        />
      )}

      {/* Dark green tint overlay — always present, thicker without image */}
      <div
        aria-hidden
        style={{
          position:        'absolute',
          inset:           0,
          backgroundColor: hasImage ? 'rgba(20,38,22,0.78)' : 'var(--forest)',
          zIndex:          1,
        }}
      />

      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex:   2,
          padding:  'calc(var(--nav-h, 72px) + 52px) 48px 0',
        }}
      >
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 48 }}>

            {/* Left — headline */}
            <div>
              <p style={{
                fontSize:      11,
                letterSpacing: '0.16em',
                color:         'rgba(255,255,255,0.55)',
                marginBottom:  20,
                fontWeight:    500,
                textTransform: 'uppercase',
              }}>
                The Edit — Trade Catalogue
              </p>
              <h1 style={{
                fontFamily:  'var(--font-serif, Georgia, serif)',
                fontSize:    'clamp(40px, 5.5vw, 68px)',
                fontWeight:  400,
                color:       '#fff',
                lineHeight:  1.05,
                margin:      0,
              }}>
                Curated for craft.
              </h1>
              <p style={{
                fontFamily:  'var(--font-serif, Georgia, serif)',
                fontSize:    'clamp(36px, 5vw, 62px)',
                fontWeight:  400,
                fontStyle:   'italic',
                color:       'var(--caramel, #c9a96e)',
                lineHeight:  1.2,
                margin:      '6px 0 0',
              }}>
                Vetted for precision.
              </p>
            </div>

            {/* Right — editorial subtitle, aligned to bottom of headline */}
            <p style={{
              maxWidth:    340,
              fontSize:    15,
              lineHeight:  1.75,
              color:       'rgba(255,255,255,0.65)',
              textAlign:   'left',
              marginBottom: 6,
              flexShrink:  0,
            }}>
              Every finish in this catalogue has been selected by FBA.
              Not everything the maker offers — only the best of what they have.
            </p>

          </div>
        </div>
      </div>

      {/* Category tab strip — bottom of hero */}
      <div
        style={{
          position:        'relative',
          zIndex:          2,
          marginTop:       56,
          padding:         '0 48px',
          borderTop:       '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', gap: 0 }}>

          {/* All Categories tab */}
          <button
            onClick={() => onCategory('')}
            style={{
              padding:         '16px 24px',
              fontSize:        11,
              letterSpacing:   '0.14em',
              fontWeight:      500,
              textTransform:   'uppercase',
              border:          'none',
              borderBottom:    !activeCategory ? '2px solid #fff' : '2px solid transparent',
              background:      !activeCategory ? 'rgba(255,255,255,0.08)' : 'transparent',
              color:           !activeCategory ? '#fff' : 'rgba(255,255,255,0.55)',
              cursor:          'pointer',
              transition:      'color 0.15s, border-color 0.15s, background 0.15s',
              whiteSpace:      'nowrap',
            }}
          >
            All Categories
          </button>

          {categories.map(cat => {
            const isActive  = activeCategory === cat.slug
            const isFbaCol  = cat.slug === 'fba-collection'
            return (
              <button
                key={cat.id}
                onClick={() => onCategory(cat.slug)}
                style={{
                  padding:         '16px 24px',
                  fontSize:        11,
                  letterSpacing:   '0.14em',
                  fontWeight:      500,
                  textTransform:   'uppercase',
                  border:          'none',
                  borderBottom:    isActive ? '2px solid #fff' : '2px solid transparent',
                  background:      isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color:           isActive
                    ? '#fff'
                    : isFbaCol
                      ? 'var(--caramel, #c9a96e)'
                      : 'rgba(255,255,255,0.55)',
                  cursor:          'pointer',
                  transition:      'color 0.15s, border-color 0.15s, background 0.15s',
                  whiteSpace:      'nowrap',
                }}
              >
                {cat.name}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
