'use client'

import { useState } from 'react'
import type { SessionUser } from '@/lib/types'

interface FilterOptions {
  artisans:    { id: string; name: string; slug: string }[]
  materials:   string[]
  finishTypes: string[]
  regions:     string[]
  priceRange:  { min: number; max: number }
  leadTimeMax: number
}

interface ActiveFilters {
  fireRetardant:  boolean
  stainProofed:   boolean
  rubCount40k:    boolean
  maxLeadTime:    string
  finishType:     string
  region:         string
  minPrice:       string
  maxPrice:       string
  artisan:        string
  material:       string
  audience:       string
}

interface Props {
  session:        SessionUser | null
  filterOptions:  FilterOptions
  filters:        ActiveFilters
  onFilter:       (key: keyof ActiveFilters, value: string | boolean) => void
  minPriceInput:  string
  maxPriceInput:  string
  onMinPriceInput:(v: string) => void
  onMaxPriceInput:(v: string) => void
  onPriceBlur:    () => void
}

const PRICE_PRESETS = [500, 1000, 2500, 5000]
const LEAD_TIME_PRESETS = [4, 8, 12]

function SectionHeader({ title, collapsed, onToggle }: { title: string; collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        width:          '100%',
        background:     'none',
        border:         'none',
        padding:        '0 0 10px',
        cursor:         'pointer',
        borderBottom:   '1px solid var(--light-line, #e0ddd7)',
        marginBottom:   14,
      }}
    >
      <span style={{ fontSize: 10, letterSpacing: '0.16em', fontWeight: 600, textTransform: 'uppercase', color: 'var(--forest, #1a2e16)' }}>
        {title}
      </span>
      <span style={{ fontSize: 14, color: 'var(--stone, #7a7065)', lineHeight: 1 }}>
        {collapsed ? '+' : '−'}
      </span>
    </button>
  )
}

function CheckRow({ label, checked, onChange, badge }: { label: string; checked: boolean; onChange: () => void; badge?: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 10 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ width: 14, height: 14, accentColor: 'var(--forest, #1a2e16)', cursor: 'pointer', flexShrink: 0 }}
      />
      <span style={{ fontSize: 13, color: 'var(--ink, #1a1a18)', flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontSize:        10,
          letterSpacing:   '0.08em',
          fontWeight:      600,
          padding:         '2px 7px',
          background:      'var(--forest, #1a2e16)',
          color:           '#fff',
          borderRadius:    2,
          textTransform:   'uppercase',
          flexShrink:      0,
        }}>
          {badge}
        </span>
      )}
    </label>
  )
}

export function TheEditSidebar({
  session,
  filterOptions,
  filters,
  onFilter,
  minPriceInput,
  maxPriceInput,
  onMinPriceInput,
  onMaxPriceInput,
  onPriceBlur,
}: Props) {
  const [collapse, setCollapse] = useState<Record<string, boolean>>({
    passport:    false,
    finishType:  false,
    region:      false,
    leadTime:    false,
    price:       false,
    artisan:     true,
  })

  const toggle = (key: string) => setCollapse(c => ({ ...c, [key]: !c[key] }))

  const isTradeUser = session?.role === 'trade_user' || session?.role === 'admin'

  return (
    <aside style={{
      width:     260,
      flexShrink: 0,
      position:  'sticky',
      top:       160,
      maxHeight: 'calc(100vh - 180px)',
      overflowY: 'auto',
      paddingRight: 8,
      alignSelf: 'flex-start',
    }}>

      {/* ── TECHNICAL PASSPORT™ ─────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <SectionHeader title="Technical Passport™" collapsed={collapse.passport} onToggle={() => toggle('passport')} />
        {!collapse.passport && (
          <div>
            <CheckRow
              label="Fire Retardant"
              checked={filters.fireRetardant}
              onChange={() => onFilter('fireRetardant', !filters.fireRetardant)}
              badge="Crib 5"
            />
            <CheckRow
              label="Stain Proofed"
              checked={filters.stainProofed}
              onChange={() => onFilter('stainProofed', !filters.stainProofed)}
            />
            <CheckRow
              label="Rub Count 40,000+"
              checked={filters.rubCount40k}
              onChange={() => onFilter('rubCount40k', !filters.rubCount40k)}
            />
            <CheckRow
              label="Lead Time ≤ 10 wks"
              checked={filters.maxLeadTime === '10'}
              onChange={() => onFilter('maxLeadTime', filters.maxLeadTime === '10' ? '' : '10')}
            />
          </div>
        )}
      </div>

      {/* ── EVERY PIECE INCLUDES ────────────────────────────── */}
      <div style={{
        background:   'var(--forest, #1a2e16)',
        padding:      '16px 18px',
        marginBottom: 28,
        borderRadius: 2,
      }}>
        <p style={{ fontSize: 9, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', margin: '0 0 10px', fontWeight: 600 }}>
          Every Piece Includes
        </p>
        {[
          '8–12 week lead time guarantee',
          'Crib 5 fire compliance check',
          'Material integrity vetting',
          'Shop drawings ±2mm tolerance',
          'Golden Sample sign-off',
          'ETI ethical compliance',
        ].map(item => (
          <div key={item} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
            <span style={{ color: 'var(--caramel, #c9a96e)', fontSize: 10, flexShrink: 0 }}>—</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4 }}>{item}</span>
          </div>
        ))}
      </div>

      {/* ── FINISH TYPE ─────────────────────────────────────── */}
      {filterOptions.finishTypes.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionHeader title="Finish Type" collapsed={collapse.finishType} onToggle={() => toggle('finishType')} />
          {!collapse.finishType && (
            <div>
              {filterOptions.finishTypes.map(ft => (
                <CheckRow
                  key={ft}
                  label={ft}
                  checked={filters.finishType === ft}
                  onChange={() => onFilter('finishType', filters.finishType === ft ? '' : ft)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── REGION ──────────────────────────────────────────── */}
      {filterOptions.regions.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionHeader title="Region" collapsed={collapse.region} onToggle={() => toggle('region')} />
          {!collapse.region && (
            <div>
              {filterOptions.regions.map(r => (
                <CheckRow
                  key={r}
                  label={r}
                  checked={filters.region === r}
                  onChange={() => onFilter('region', filters.region === r ? '' : r)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MAX LEAD TIME ────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <SectionHeader title="Max Lead Time" collapsed={collapse.leadTime} onToggle={() => toggle('leadTime')} />
        {!collapse.leadTime && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {LEAD_TIME_PRESETS.map(wks => {
              const val = String(wks)
              const active = filters.maxLeadTime === val
              return (
                <button
                  key={wks}
                  onClick={() => onFilter('maxLeadTime', active ? '' : val)}
                  style={{
                    padding:     '5px 12px',
                    fontSize:    12,
                    border:      active ? 'none' : '1px solid var(--light-line, #e0ddd7)',
                    background:  active ? 'var(--forest, #1a2e16)' : 'transparent',
                    color:       active ? '#fff' : 'var(--stone, #7a7065)',
                    borderRadius: 2,
                    cursor:      'pointer',
                    transition:  'all 0.15s',
                  }}
                >
                  {wks} wks
                </button>
              )
            })}
            <button
              onClick={() => onFilter('maxLeadTime', '')}
              style={{
                padding:      '5px 12px',
                fontSize:     12,
                border:       !filters.maxLeadTime ? 'none' : '1px solid var(--light-line, #e0ddd7)',
                background:   !filters.maxLeadTime ? 'var(--forest, #1a2e16)' : 'transparent',
                color:        !filters.maxLeadTime ? '#fff' : 'var(--stone, #7a7065)',
                borderRadius: 2,
                cursor:       'pointer',
                transition:   'all 0.15s',
              }}
            >
              Any
            </button>
          </div>
        )}
      </div>

      {/* ── MAX TRADE PRICE ─────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <SectionHeader title="Max Trade Price" collapsed={collapse.price} onToggle={() => toggle('price')} />
        {!collapse.price && (
          <div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {PRICE_PRESETS.map(p => {
                const val = String(p)
                const active = filters.maxPrice === val && !filters.minPrice
                return (
                  <button
                    key={p}
                    onClick={() => {
                      onFilter('maxPrice', active ? '' : val)
                      onFilter('minPrice', '')
                    }}
                    style={{
                      padding:      '5px 12px',
                      fontSize:     12,
                      border:       active ? 'none' : '1px solid var(--light-line, #e0ddd7)',
                      background:   active ? 'var(--forest, #1a2e16)' : 'transparent',
                      color:        active ? '#fff' : 'var(--stone, #7a7065)',
                      borderRadius: 2,
                      cursor:       'pointer',
                      transition:   'all 0.15s',
                    }}
                  >
                    £{p.toLocaleString()}
                  </button>
                )
              })}
              <button
                onClick={() => { onFilter('maxPrice', ''); onFilter('minPrice', '') }}
                style={{
                  padding:      '5px 12px',
                  fontSize:     12,
                  border:       !filters.maxPrice ? 'none' : '1px solid var(--light-line, #e0ddd7)',
                  background:   !filters.maxPrice ? 'var(--forest, #1a2e16)' : 'transparent',
                  color:        !filters.maxPrice ? '#fff' : 'var(--stone, #7a7065)',
                  borderRadius: 2,
                  cursor:       'pointer',
                  transition:   'all 0.15s',
                }}
              >
                Any
              </button>
            </div>

            {/* Custom range inputs */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number"
                placeholder="Min £"
                value={minPriceInput}
                onChange={e => onMinPriceInput(e.target.value)}
                onBlur={onPriceBlur}
                min={0}
                style={{ width: 76, padding: '5px 8px', fontSize: 12, border: '1px solid var(--light-line, #e0ddd7)', borderRadius: 2, background: '#fff' }}
              />
              <span style={{ fontSize: 11, color: 'var(--stone, #7a7065)' }}>–</span>
              <input
                type="number"
                placeholder="Max £"
                value={maxPriceInput}
                onChange={e => onMaxPriceInput(e.target.value)}
                onBlur={onPriceBlur}
                min={0}
                style={{ width: 76, padding: '5px 8px', fontSize: 12, border: '1px solid var(--light-line, #e0ddd7)', borderRadius: 2, background: '#fff' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── ARTISAN / STUDIO ────────────────────────────────── */}
      {filterOptions.artisans.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionHeader title="Artisan / Studio" collapsed={collapse.artisan} onToggle={() => toggle('artisan')} />
          {!collapse.artisan && (
            <div>
              {filterOptions.artisans.map(a => (
                <CheckRow
                  key={a.id}
                  label={a.name}
                  checked={filters.artisan === a.id}
                  onChange={() => onFilter('artisan', filters.artisan === a.id ? '' : a.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── AUDIENCE (trade only) ───────────────────────────── */}
      {isTradeUser && (
        <div style={{ marginBottom: 28 }}>
          <SectionHeader title="Audience" collapsed={false} onToggle={() => {}} />
          {[
            { value: '',       label: 'All pieces' },
            { value: 'retail', label: 'Retail pieces' },
            { value: 'trade',  label: 'Trade pieces' },
          ].map(opt => (
            <CheckRow
              key={opt.value}
              label={opt.label}
              checked={filters.audience === opt.value}
              onChange={() => onFilter('audience', opt.value)}
            />
          ))}
        </div>
      )}

      {/* ── TRADE CTA ───────────────────────────────────────── */}
      {!session && (
        <div style={{
          padding:    '16px',
          background: 'var(--cream, #faf8f4)',
          border:     '1px solid var(--light-line, #e0ddd7)',
          fontSize:   12,
          lineHeight: 1.6,
          color:      'var(--stone, #7a7065)',
        }}>
          <strong style={{ color: 'var(--forest, #1a2e16)', display: 'block', marginBottom: 6 }}>
            Are you a trade professional?
          </strong>
          Apply for a trade account to access net trade pricing.
          <a href="/trade/apply" style={{ color: 'var(--caramel, #c9a96e)', marginTop: 6, display: 'inline-block' }}>
            Apply for trade access →
          </a>
        </div>
      )}

    </aside>
  )
}
