'use client'

// CUSTOM MATCH launcher (Sprint 13) — full-width outlined action per the
// reference. Used standalone on products without curated finish groups;
// CuratedFinishes embeds the modal directly to pass live selections.

import { useState } from 'react'
import CustomMatchModal, { type CustomMatchProductSummary } from './CustomMatchModal'

export default function CustomMatchLauncher({ product, materialTypes, defaultEmail }: {
  product: CustomMatchProductSummary
  materialTypes: Array<{ id: string; name: string; slug: string }>
  defaultEmail?: string | null
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ margin: '14px 0 24px' }}>
      <button className="btn btn-secondary btn-full" onClick={() => setOpen(true)} style={{ minHeight: 48 }}>
        <span style={{ display: 'block' }}>Custom Match</span>
        <span style={{ display: 'block', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'none', opacity: 0.75 }}>
          Bring your own marble, timber or fabric — we&apos;ll match it
        </span>
      </button>
      {open && (
        <CustomMatchModal
          product={product}
          materialTypes={materialTypes}
          selections={[]}
          quantity={1}
          defaultEmail={defaultEmail}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
