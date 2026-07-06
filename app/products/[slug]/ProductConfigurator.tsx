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

  function swatchButton(opt: FinishOption, selected: boolean, onClick: () => void) {
    return (
      <button
        key={opt.id}
        type="button"
        onClick={onClick}
        disabled={!opt.available}
        aria-pressed={selected}
        title={opt.available ? opt.finishName : `${opt.finishName} — currently unavailable`}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', fontSize: 12, cursor: opt.available ? 'pointer' : 'not-allowed',
          background: selected ? 'var(--forest)' : 'var(--warm-white)',
          color: selected ? 'var(--cream)' : opt.available ? 'var(--forest)' : 'var(--stone)',
          border: selected ? '1px solid var(--forest)' : '1px solid var(--light-line)',
          opacity: opt.available ? 1 : 0.45,
        }}
      >
        {opt.swatchUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={opt.swatchUrl} alt="" width={18} height={18} style={{ objectFit: 'cover', borderRadius: 2 }} />
        ) : opt.colour ? (
          <span aria-hidden style={{ width: 14, height: 14, borderRadius: 2, background: opt.colour, border: '1px solid rgba(0,0,0,0.15)' }} />
        ) : null}
        <span>
          {opt.finishName}
          {opt.finishCode && <span style={{ opacity: 0.7 }}> · {opt.finishCode}</span>}
        </span>
      </button>
    )
  }

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Hard finish options */}
      {hardFinishes.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <span style={sectionLabel}>
            Hard finish options{finish ? <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--stone)' }}> — {finish.finishName}</span> : null}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {hardFinishes.map(o => swatchButton(o, finish?.id === o.id, () => setFinish(finish?.id === o.id ? null : o)))}
          </div>
        </div>
      )}

      {/* Upholstery options */}
      {upholstery.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <span style={sectionLabel}>
            Upholstery options{fabric ? <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--stone)' }}> — {fabric.finishName}</span> : null}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
