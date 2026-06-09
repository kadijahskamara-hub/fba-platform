'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'

export type CollectionTab = 'all' | 'retail-pieces' | 'trade-pieces' | 'limited-edition'

interface Tab {
  id: CollectionTab
  label: string
  locked?: boolean
}

interface CollectionFiltersProps {
  isTradeUser: boolean
  tabs: Tab[]
}

const ALL_TABS: Tab[] = [
  { id: 'all',              label: 'All Pieces' },
  { id: 'retail-pieces',   label: 'Retail Pieces' },
  { id: 'trade-pieces',    label: 'Trade Pieces',          locked: true },
  { id: 'limited-edition', label: 'Full Bloom Exclusives' },
]

export function CollectionFilters({ isTradeUser }: CollectionFiltersProps) {
  const router      = useRouter()
  const pathname    = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const activeTab = (searchParams.get('tab') as CollectionTab) ?? 'all'

  function handleTab(tab: CollectionTab) {
    if (tab === activeTab) return
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (tab === 'all') {
        params.delete('tab')
      } else {
        params.set('tab', tab)
      }
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <div style={{
      display: 'flex',
      gap: 4,
      flexWrap: 'wrap',
      marginBottom: 48,
      padding: '4px',
      background: 'var(--sage-light)',
      width: 'fit-content',
      maxWidth: '100%',
    }}>
      {ALL_TABS.map(tab => {
        const locked   = tab.locked && !isTradeUser
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            onClick={() => !locked && handleTab(tab.id)}
            disabled={isPending}
            style={{
              padding: '10px 20px',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-body)',
              cursor: locked ? 'default' : 'pointer',
              border: 'none',
              transition: 'all 0.2s ease',
              background: isActive ? 'var(--forest)' : 'transparent',
              color: locked
                ? 'var(--stone)'
                : isActive
                  ? 'var(--cream)'
                  : 'var(--forest)',
              opacity: isPending ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {tab.label}
            {locked && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}
