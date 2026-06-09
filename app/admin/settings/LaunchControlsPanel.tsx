'use client'

import { useState } from 'react'
import type { LaunchFlags } from '@/lib/flags'

interface FlagConfig {
  key: keyof LaunchFlags
  label: string
  description: string
  href: string
}

const FLAG_CONFIG: FlagConfig[] = [
  {
    key:         'show_collection',
    label:       'The FBA Collection',
    description: 'Curated bespoke pieces page (/collection)',
    href:        '/collection',
  },
  {
    key:         'show_home',
    label:       'Home Interiors',
    description: 'The Home section landing page (/home)',
    href:        '/home',
  },
  {
    key:         'show_artisans',
    label:       'Artisans',
    description: 'Maker profiles and individual artisan pages (/artisans)',
    href:        '/artisans',
  },
  {
    key:         'show_journal',
    label:       'The Journal',
    description: 'Editorial posts and articles (/journal)',
    href:        '/journal',
  },
  {
    key:         'show_trade_cta',
    label:       'Trade Access CTA',
    description: 'The "Trade Access" button in the navigation bar',
    href:        '/trade/apply',
  },
]

interface Props {
  initialFlags: LaunchFlags
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function LaunchControlsPanel({ initialFlags }: Props) {
  const [flags, setFlags]       = useState<LaunchFlags>(initialFlags)
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({})

  const toggle = async (key: keyof LaunchFlags) => {
    const newValue = !flags[key]

    // Optimistic update
    setFlags(prev => ({ ...prev, [key]: newValue }))
    setSaveState(prev => ({ ...prev, [key]: 'saving' }))

    try {
      const res = await fetch('/api/admin/settings/flags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: newValue }),
      })

      if (!res.ok) throw new Error('Save failed')

      setSaveState(prev => ({ ...prev, [key]: 'saved' }))
      setTimeout(() => setSaveState(prev => ({ ...prev, [key]: 'idle' })), 2000)
    } catch {
      // Rollback
      setFlags(prev => ({ ...prev, [key]: !newValue }))
      setSaveState(prev => ({ ...prev, [key]: 'error' }))
      setTimeout(() => setSaveState(prev => ({ ...prev, [key]: 'idle' })), 3000)
    }
  }

  return (
    <div style={{
      background: 'var(--warm-white)',
      border: '1px solid var(--light-line)',
      padding: 32,
      marginBottom: 24,
    }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 22,
          fontWeight: 300,
          color: 'var(--forest)',
          marginBottom: 8,
        }}>
          Launch Controls
        </h2>
        <p style={{ fontSize: 13, color: 'var(--stone)', lineHeight: 1.6 }}>
          Toggle site sections on or off. Disabled sections show a Coming Soon page to visitors
          and are hidden from the navigation. Changes take effect immediately.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {FLAG_CONFIG.map(({ key, label, description, href }, idx) => {
          const enabled = flags[key]
          const state   = saveState[key] ?? 'idle'

          return (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 0',
                borderBottom: idx < FLAG_CONFIG.length - 1 ? '1px solid var(--light-line)' : 'none',
              }}
            >
              {/* Left — label */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 3,
                }}>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: enabled ? 'var(--forest)' : 'var(--stone)',
                    transition: 'color 0.2s',
                  }}>
                    {label}
                  </span>
                  <span style={{
                    fontSize: 11,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: 3,
                    background: enabled ? 'rgba(26,43,24,0.08)' : 'rgba(0,0,0,0.05)',
                    color: enabled ? 'var(--forest)' : 'var(--stone)',
                    fontWeight: 500,
                  }}>
                    {enabled ? 'Live' : 'Hidden'}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--stone)', margin: 0 }}>
                  {description}
                  {' · '}
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--caramel)', textDecoration: 'none', fontSize: 12 }}
                  >
                    Preview ↗
                  </a>
                </p>
              </div>

              {/* Right — toggle + status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 24 }}>
                {state === 'saving' && (
                  <span style={{ fontSize: 11, color: 'var(--stone)' }}>Saving…</span>
                )}
                {state === 'saved' && (
                  <span style={{ fontSize: 11, color: '#2d7a4f' }}>Saved ✓</span>
                )}
                {state === 'error' && (
                  <span style={{ fontSize: 11, color: '#c0392b' }}>Error — reverted</span>
                )}

                {/* Toggle switch */}
                <button
                  onClick={() => toggle(key)}
                  disabled={state === 'saving'}
                  aria-checked={enabled}
                  role="switch"
                  aria-label={`Toggle ${label}`}
                  style={{
                    position: 'relative',
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    background: enabled ? 'var(--forest)' : '#d0d0d0',
                    border: 'none',
                    cursor: state === 'saving' ? 'wait' : 'pointer',
                    transition: 'background 0.2s',
                    flexShrink: 0,
                    padding: 0,
                    outline: 'none',
                  }}
                >
                  <span style={{
                    position: 'absolute',
                    top: 3,
                    left: enabled ? 23 : 3,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
