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
    // Spec §1: sits directly beneath the Request Quote / Save to Project
    // row and spans their combined width. The 10px gap matches the gap
    // inside .pdp-action-pair so the three actions read as one block.
    <div style={{ marginTop: 10 }}>
      <button type="button" className="btn-custom-match" onClick={() => setOpen(true)}>
        <span className="cm-title">Custom Match</span>
        <span className="cm-sub">Bring your own marble, timber or fabric — we&apos;ll match it</span>
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
