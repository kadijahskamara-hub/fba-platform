'use client'

// ============================================================
// Product-page primary action pair (spec §1).
//
// ONE source of truth for the Request Quote / Save to Project row so the
// approved layout cannot drift between product types. Previously the
// curated-finish path rendered the side-by-side pair while products
// without curated finishes fell back to two stacked full-width buttons —
// visibly different pages for the same action set.
//
// Layout (desktop): the two buttons share one row as equal halves inside
// the configuration column; Custom Match spans their combined width
// directly below (rendered by the caller so it can carry live finish
// selections), and Add to Bag — where the piece is purchasable — spans
// the full column beneath that.
//
// Responsive: `.pdp-action-pair` collapses to a single column on narrow
// screens with Request Quote first and Save to Project second; both
// buttons are >=44px tall via `.btn`, so touch targets hold up. Grid
// only — no absolute positioning, no negative margins.
// ============================================================

import Link from 'next/link'

interface Props {
  /** Click handler for Request Quote (client-side navigation / router). */
  onQuote?: () => void
  /** Href for Request Quote when it is a plain link instead. */
  quoteHref?: string
  isLoggedIn: boolean
  /** Click handler for Save to Project (opens the save modal). */
  onSave?: () => void
  /** Href for Save to Project when it navigates instead of opening a modal. */
  saveHref?: string
  /** Where to send a signed-out visitor who wants to save. */
  signInHref: string
}

export default function PdpActionPair({
  onQuote, quoteHref, isLoggedIn, onSave, saveHref, signInHref,
}: Props) {
  return (
    <div className="pdp-action-pair">
      {quoteHref ? (
        <Link href={quoteHref} className="btn btn-primary">
          Request Quote
        </Link>
      ) : (
        <button type="button" className="btn btn-primary" onClick={onQuote}>
          Request Quote
        </button>
      )}

      {!isLoggedIn ? (
        <Link href={signInHref} className="btn btn-secondary">
          Sign in to Save
        </Link>
      ) : onSave ? (
        <button type="button" className="btn btn-secondary" onClick={onSave}>
          Save to Project <span aria-hidden>♡</span>
        </button>
      ) : (
        <Link href={saveHref ?? signInHref} className="btn btn-secondary">
          Save to Project <span aria-hidden>♡</span>
        </Link>
      )}
    </div>
  )
}
