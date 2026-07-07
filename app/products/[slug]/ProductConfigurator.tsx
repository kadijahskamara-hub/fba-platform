'use client'

import { useState } from 'react'
import Link from 'next/link'

// ============================================================
// Product configurator (site brief §8.7–8.11):
// Hard finish options / Upholstery options / Size / Quantity.
// Selections carry through to the quote request and project
// board via URL params — no retyping product details.
// ============================================================

export interface FinishOption {
  id: string
  finishName: string
  finishCode?: string | null
  material?: string | null
  colour?: string | null
  swatchUrl?: string | null
  comAccepted?: boolean | null
  rubCount?: number | null
  fireTreatment?: string | null
  available: boolean
}

export interface SizeOption {
  id: string
  variantName: string
  available: boolean
  leadTimeOverride?: string | null
}

interface Props {
  productId: string
  slug: string
  hardFinishes: FinishOption[]
  upholstery: FinishOption[]
  sizes: SizeOption[]
  isLoggedIn: boolean
}

// Map free-text colour/finish names to a display colour for the swatch
// circle. Conservative: only well-known material/colour words resolve;
// anything else falls back to an initials circle rather than guessing.
const COLOUR_TOKENS: [RegExp, string][] = [
  [/\bblack\b|\bnoir\b|\bcharcoal\b|\banthracite\b/i, '#26241F'],
  [/\bwhite\b|\bivory\b|\bchalk\b/i,                  '#F4F1EA'],
  [/\bcream\b|\becru\b|\boff[- ]white\b/i,            '#EFE7D6'],
  [/\bgrey\b|\bgray\b|\bstone\b|\bcement\b/i,         '#9C978D'],
  [/\bnatural\b|\brattan\b|\bcane\b|\bwicker\b/i,     '#C9A86A'],
  [/\boak\b|\bbeech\b|\bash\b|\bbirch\b/i,            '#B98F5C'],
  [/\bwalnut\b|\bwenge\b|\bespresso\b/i,              '#5C4330'],
  [/\bteak\b|\biroko\b|\bchestnut\b/i,                '#8A5F3C'],
  [/\bbrass\b|\bgold\b|\bochre\b|\bmustard\b/i,       '#B08D3F'],
  [/\bbronze\b|\bcopper\b|\brust\b|\bterracotta\b/i,  '#96562F'],
  [/\bgreen\b|\bolive\b|\bsage\b|\bforest\b/i,        '#5A6B4F'],
  [/\bblue\b|\bnavy\b|\bindigo\b|\bpetrol\b/i,        '#3E5468'],
  [/\bred\b|\bburgundy\b|\bwine\b|\bbordeaux\b/i,     '#7A2E2A'],
  [/\bpink\b|\bblush\b|\brose\b/i,                    '#C79A93'],
  [/\bbeige\b|\bsand\b|\btaupe\b|\blinen\b|\bcamel\b/i, '#C7B299'],
  [/\bbrown\b|\btan\b|\bcognac\b|\btobacco\b/i,       '#7E5A3C'],
  [/\baluminium\b|\bsteel\b|\bchrome\b|\bsilver\b|\bnickel\b/i, '#B5B7B8'],
  [/\bmarble\b|\btravertine\b/i,                      '#DDD6C8'],
]

function resolveSwatchColour(text: string | null | undefined): string | null {
  if (!text) return null
  for (const [re, hex] of COLOUR_TOKENS) if (re.test(text)) return hex
  return null
}

function initialsOf(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

export default function ProductConfigurator({ productId, slug, hardFinishes, upholstery, sizes, isLoggedIn }: Props) {
  const [finish, setFinish] = useState<FinishOption | null>(hardFinishes.find(f => f.available) ?? null)
  const [fabric, setFabric] = useState<FinishOption | null>(null)
  const [size, setSize]     = useState<SizeOption | null>(sizes.find(s => s.available) ?? null)
  const [qty, setQty]       = useState(1)

  const selectionParams = new URLSearchParams({ product: productId })
  if (qty > 1)  selectionParams.set('qty', String(qty))
  if (finish)   selectionParams.set('finish', finish.finishCode ? `${finish.finishName} (${finish.finishCode})` : finish.finishName)
  if (fabric)   selectionParams.set('fabric', fabric.finishCode ? `${fabric.finishName} (${fabric.finishCode})` : fabric.finishName)
  if (size)     selectionParams.set('size', size.variantName)

  const quoteHref = `/quote?${selectionParams.toString()}`
  const projectParams = new URLSearchParams(selectionParams)
  projectParams.delete('product')
  projectParams.set('add', productId)
  const projectHref = `/account/projects?${projectParams.toString()}`

  const sectionLabel: React.CSSProperties = {
    fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
    color: 'var(--forest)', fontWeight: 600, marginBottom: 10, display: 'block',
  }

  // ── Circular swatches (product card design reference, July 2026) ──
  // Finish and colour options render as plain circles — swatch image if
  // provided, otherwise a colour derived from the finish text, otherwise
  // a neutral circle with the finish initials. Selected = ring offset.

  function swatchButton(opt: FinishOption, selected: boolean, onClick: () => void) {
    const fill = opt.swatchUrl ? null : resolveSwatchColour(opt.colour ?? opt.finishName)
    const label = opt.finishCode ? `${opt.finishName} (${opt.finishCode})` : opt.finishName
    return (
      <button
        key={opt.id}
        type="button"
        onClick={onClick}
        disabled={!opt.available}
        aria-pressed={selected}
        aria-label={label}
        title={opt.available ? label : `${label} — currently unavailable`}
        style={{
          width: 34, height: 34, borderRadius: '50%', padding: 0, flexShrink: 0,
          cursor: opt.available ? 'pointer' : 'not-allowed',
          background: fill ?? 'var(--warm-white)',
          border: '1px solid rgba(0,0,0,0.18)',
          outline: selected ? '2px solid var(--forest)' : 'none',
          outlineOffset: 2,
          opacity: opt.available ? 1 : 0.35,
          overflow: 'hidden', position: 'relative',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {opt.swatchUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={opt.swatchUrl} alt="" width={34} height={34} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
        ) : !fill ? (
          <span aria-hidden style={{ fontSize: 9, letterSpacing: '0.05em', color: 'var(--stone)', fontWeight: 600 }}>
            {initialsOf(opt.finishName)}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Hard finish options — circular material swatches */}
      {hardFinishes.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <span style={sectionLabel}>
            Hard finish option{finish ? <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--stone)' }}>: {finish.finishCode ? `${finish.finishName} (${finish.finishCode})` : finish.finishName}</span> : null}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '4px 2px' }}>
            {hardFinishes.map(o => swatchButton(o, finish?.id === o.id, () => setFinish(finish?.id === o.id ? null : o)))}
          </div>
        </div>
      )}

      {/* Upholstery / colour options — circular colour swatches */}
      {upholstery.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <span style={sectionLabel}>
            Colour / Fabric{fabric ? <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--stone)' }}>: {fabric.finishCode ? `${fabric.finishName} (${fabric.finishCode})` : fabric.finishName}</span> : null}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '4px 2px' }}>
            {upholstery.map(o => swatchButton(o, fabric?.id === o.id, () => setFabric(fabric?.id === o.id ? null : o)))}
          </div>
          {fabric && (fabric.comAccepted || fabric.rubCount || fabric.fireTreatment) && (
            <p style={{ fontSize: 11, color: 'var(--stone)', marginTop: 8 }}>
              {[
                fabric.comAccepted ? 'COM accepted' : null,
                fabric.rubCount ? `${fabric.rubCount.toLocaleString()} Martindale rubs` : null,
                fabric.fireTreatment ?? null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* Size options */}
      {sizes.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <span style={sectionLabel}>Size</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {sizes.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSize(s)}
                disabled={!s.available}
                aria-pressed={size?.id === s.id}
                style={{
                  padding: '8px 14px', fontSize: 12, cursor: s.available ? 'pointer' : 'not-allowed',
                  background: size?.id === s.id ? 'var(--forest)' : 'var(--warm-white)',
                  color: size?.id === s.id ? 'var(--cream)' : s.available ? 'var(--forest)' : 'var(--stone)',
                  border: size?.id === s.id ? '1px solid var(--forest)' : '1px solid var(--light-line)',
                  opacity: s.available ? 1 : 0.45,
                }}
              >
                {s.variantName}
              </button>
            ))}
          </div>
          {size?.leadTimeOverride && (
            <p style={{ fontSize: 11, color: 'var(--stone)', marginTop: 8 }}>Lead time for this size: {size.leadTimeOverride}</p>
          )}
        </div>
      )}

      {/* Quantity */}
      <div style={{ marginBottom: 24 }}>
        <span style={sectionLabel}>Quantity</span>
        <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--light-line)', background: 'var(--warm-white)' }}>
          <button
            type="button"
            onClick={() => setQty(Math.max(1, qty - 1))}
            aria-label="Decrease quantity"
            style={{ padding: '8px 14px', fontSize: 15, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--forest)' }}
          >
            −
          </button>
          <input
            type="number"
            min={1}
            max={999}
            value={qty}
            onChange={e => setQty(Math.min(999, Math.max(1, parseInt(e.target.value, 10) || 1)))}
            aria-label="Quantity"
            style={{ width: 54, textAlign: 'center', border: 'none', background: 'none', fontSize: 14, color: 'var(--forest)', outline: 'none' }}
          />
          <button
            type="button"
            onClick={() => setQty(Math.min(999, qty + 1))}
            aria-label="Increase quantity"
            style={{ padding: '8px 14px', fontSize: 15, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--forest)' }}
          >
            +
          </button>
        </div>
      </div>

      {/* CTAs — selections carried in the URL */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link href={quoteHref} className="btn btn-primary btn-full btn-lg">
          Request Quote
        </Link>
        {isLoggedIn ? (
          <Link href={projectHref} className="btn btn-secondary btn-full">
            Save to Project
          </Link>
        ) : (
          <Link href={`/login?next=/products/${slug}`} className="btn btn-secondary btn-full">
            Sign in to Save to Project
          </Link>
        )}
      </div>
    </div>
  )
}
