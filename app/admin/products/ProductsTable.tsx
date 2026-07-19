'use client'

import { useState } from 'react'
import { appConfirm } from '@/lib/appConfirm'
import { useRouter } from 'next/navigation'
import ProductRowActions from './ProductRowActions'
import { completenessBreakdown, type ProductHealthChecks } from '@/lib/productCompleteness'

// ============================================================
// Client table: checkbox selection + bulk action toolbar.
// Rows are fetched server-side (page.tsx) and passed as props.
// ============================================================

export interface ProductRow {
  id: string
  name: string
  slug: string
  visibility: string
  audience: string
  retail_price: number | null
  trade_price: number | null
  price_type: string
  archived_at: string | null
  lead_time: string | null
  image_count: number
  category_name: string | null
  artisan_name: string | null
  created_at: string
  completeness?: number | null
  health?: ProductHealthChecks | null
}

// QA item 1: click the % to see exactly which of the 11 checks are
// outstanding, with a hint for where each one lives.
function CompletenessBadge({ percent, health }: { percent: number; health: ProductHealthChecks | null }) {
  const [open, setOpen] = useState(false)
  const b = completenessBreakdown(health)
  const colour = percent >= 80 ? '#166534' : percent >= 50 ? '#B45309' : '#B91C1C'
  const summary = health
    ? (b.missing.length === 0 ? 'All 11 checks complete' : `Missing: ${b.missing.map(m => m.label).join(', ')}`)
    : undefined

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={summary}
        aria-expanded={open}
        aria-label={`Completeness ${percent}%${summary ? ` — ${summary}` : ''}`}
        style={{
          fontSize: 12, fontWeight: 600, color: colour, background: 'none', border: 'none',
          cursor: health ? 'pointer' : 'default', padding: 0,
          textDecoration: health ? 'underline dotted' : 'none', textUnderlineOffset: 3,
        }}
      >
        {percent}%
      </button>
      {open && health && (
        <span style={{
          position: 'absolute', zIndex: 60, top: 'calc(100% + 6px)', right: 0, width: 250,
          background: 'var(--warm-white)', border: '1px solid var(--light-line)', borderRadius: 6,
          boxShadow: '0 6px 18px rgba(24,32,26,0.14)', padding: '10px 12px', textAlign: 'left',
        }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--forest)', marginBottom: 6 }}>
            {b.done}/{b.total} checks complete
          </span>
          {b.missing.length === 0 ? (
            <span style={{ display: 'block', fontSize: 12, color: '#166534' }}>Nothing outstanding.</span>
          ) : b.missing.map(m => (
            <span key={m.key} style={{ display: 'block', fontSize: 11.5, color: 'var(--stone)', margin: '3px 0', fontWeight: 400 }}>
              <span style={{ color: '#B91C1C' }}>✗</span> {m.label}
              <span style={{ opacity: 0.7 }}> — {m.hint}</span>
            </span>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 11 }} onClick={() => setOpen(false)}>
            Close
          </button>
        </span>
      )}
    </span>
  )
}

const BULK_ACTIONS = [
  { value: 'publish',   label: 'Publish' },
  { value: 'unpublish', label: 'Unpublish' },
  { value: 'archive',   label: 'Archive' },
  { value: 'restore',   label: 'Restore' },
] as const

export default function ProductsTable({ products, isAdmin }: { products: ProductRow[]; isAdmin: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  const allSelected = products.length > 0 && selected.size === products.length

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(products.map(p => p.id)))
  }

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function runBulk(action: string) {
    if (selected.size === 0) return
    const labels: Record<string, string> = {
      publish: `Publish ${selected.size} selected product(s)?`,
      unpublish: `Unpublish ${selected.size} selected product(s)? They will be hidden from the public catalogue.`,
      archive: `Archive ${selected.size} selected product(s)?\n\nThey will be hidden from the public catalogue but retained in admin history.`,
      restore: `Restore ${selected.size} selected product(s)?`,
      delete: `Permanently delete ${selected.size} selected product(s)?\n\nThis cannot be undone. Products referenced by projects, quotes or orders are kept automatically. Use Archive unless these are test or duplicate records.`,
    }
    if (!await appConfirm(labels[action])) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: [...selected] }),
      })
      const json = await res.json()
      if (!json.success) alert(json.error ?? 'Bulk action failed')
      else {
        if (action === 'delete' && json.message) alert(json.message)
        setSelected(new Set())
        router.refresh()
      }
    } catch {
      alert('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
          marginBottom: 10, background: 'var(--cream, #f7f3ec)',
          border: '1px solid var(--light-line)', borderRadius: 6, fontSize: 13,
        }}>
          <strong>{selected.size} selected</strong>
          {BULK_ACTIONS.map(a => (
            <button key={a.value} className="btn btn-ghost btn-sm" disabled={busy} onClick={() => runBulk(a.value)}>
              {a.label}
            </button>
          ))}
          {isAdmin && (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => runBulk('delete')} style={{ color: '#a03030' }}>
              Delete
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}>
            Clear
          </button>
        </div>
      )}

      <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all products" />
              </th>
              <th>Name</th>
              <th>Category</th>
              <th>Artisan</th>
              <th>Retail</th>
              <th>Trade</th>
              <th>Lead time</th>
              <th>Imgs</th>
              <th>Complete</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => {
              const archived = Boolean(p.archived_at)
              return (
                <tr key={p.id} style={archived ? { opacity: 0.6 } : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      aria-label={`Select ${p.name}`}
                    />
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--stone)' }}>{p.slug}</div>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--stone)' }}>{p.category_name ?? '—'}</td>
                  <td style={{ fontSize: 13, color: 'var(--stone)' }}>{p.artisan_name ?? '—'}</td>
                  <td>
                    {p.price_type === 'price_on_request' ? (
                      <span style={{ fontStyle: 'italic', color: 'var(--stone)', fontSize: 12 }}>POR</span>
                    ) : p.retail_price ? (
                      <span>£{Number(p.retail_price).toLocaleString()}</span>
                    ) : '—'}
                  </td>
                  <td>
                    {p.trade_price ? (
                      <span style={{ color: 'var(--caramel)' }}>£{Number(p.trade_price).toLocaleString()}</span>
                    ) : '—'}
                  </td>
                  <td style={{ fontSize: 12, color: p.lead_time ? 'inherit' : '#B45309' }}>
                    {p.lead_time ?? 'missing'}
                  </td>
                  <td style={{ fontSize: 12, color: p.image_count === 0 ? '#B45309' : 'inherit' }}>
                    {p.image_count}
                  </td>
                  <td>
                    {typeof p.completeness === 'number' ? (
                      <CompletenessBadge percent={p.completeness} health={p.health ?? null} />
                    ) : '—'}
                  </td>
                  <td>
                    {archived ? (
                      <span className="status-pill" style={{ background: '#eee', color: '#666' }}>archived</span>
                    ) : (
                      <span className={`status-pill status-${p.visibility}`}>
                        {p.visibility === 'hidden' ? 'unpublished' : p.visibility}
                      </span>
                    )}
                  </td>
                  <td>
                    <ProductRowActions
                      productId={p.id}
                      slug={p.slug}
                      name={p.name}
                      visibility={p.visibility}
                      isArchived={archived}
                      isAdmin={isAdmin}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
