'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { appConfirm } from '@/lib/appConfirm'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ProductRowActions from './ProductRowActions'
import HScrollFrame from '@/components/admin/HScrollFrame'
import { completenessBreakdown, type ProductHealthChecks } from '@/lib/productCompleteness'

// ============================================================
// Client table: checkbox selection + bulk action toolbar.
// Rows are fetched server-side (page.tsx) and passed as props.
//
// Sprints 20–22 (Wix-dashboard-inspired, July 2026):
//  · ⓘ header hints
//  · inline editing of Retail / Trade / Lead time (click → edit,
//    Enter/blur saves, Escape cancels, revert on failure)
//  · Customize columns (show/hide, persisted per browser)
//  · Saved views: current filters + columns under a name, with
//    set-default / rename / delete — default applies once per tab
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
  thumb: string | null
  category_name: string | null
  artisan_name: string | null
  created_at: string
  completeness?: number | null
  health?: ProductHealthChecks | null
}

// ── Column model (Sprint 22) ─────────────────────────────────

type ColKey = 'category' | 'artisan' | 'retail' | 'trade' | 'lead' | 'imgs' | 'complete'

const TOGGLEABLE_COLUMNS: Array<{ key: ColKey; label: string; hint: string }> = [
  { key: 'category', label: 'Category',  hint: 'Product category' },
  { key: 'artisan',  label: 'Artisan',   hint: 'Maker / studio (never shown publicly unless enabled per product)' },
  { key: 'retail',   label: 'Retail',    hint: 'Retail price shown to guests and retail customers. Click a value to edit it here.' },
  { key: 'trade',    label: 'Trade',     hint: 'Trade price (trade accounts and admin only). Click a value to edit it here.' },
  { key: 'lead',     label: 'Lead time', hint: 'Displayed lead time. Click a value to edit it here.' },
  { key: 'imgs',     label: 'Imgs',      hint: 'Number of images on the product' },
  { key: 'complete', label: 'Complete',  hint: 'Completeness across the 11 product-health checks — click a % for the breakdown' },
]

const ALL_COLS: ColKey[] = TOGGLEABLE_COLUMNS.map(c => c.key)

const COLS_STORAGE_KEY  = 'fba.adminProducts.columns'
const VIEWS_STORAGE_KEY = 'fba.adminProducts.views'
const DEFAULT_APPLIED_KEY = 'fba.adminProducts.defaultApplied'

interface SavedView { id: string; name: string; query: string; cols: ColKey[] }
interface ViewStore { views: SavedView[]; defaultId: string | null }

function loadCols(): ColKey[] {
  try {
    const raw = localStorage.getItem(COLS_STORAGE_KEY)
    if (!raw) return ALL_COLS
    const parsed = JSON.parse(raw) as ColKey[]
    const valid = parsed.filter(k => ALL_COLS.includes(k))
    return valid.length > 0 ? valid : ALL_COLS
  } catch { return ALL_COLS }
}

function loadViews(): ViewStore {
  try {
    const raw = localStorage.getItem(VIEWS_STORAGE_KEY)
    if (!raw) return { views: [], defaultId: null }
    const parsed = JSON.parse(raw) as ViewStore
    return { views: Array.isArray(parsed.views) ? parsed.views : [], defaultId: parsed.defaultId ?? null }
  } catch { return { views: [], defaultId: null } }
}

function persistViews(store: ViewStore) {
  try { localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(store)) } catch { /* storage full/blocked */ }
}

function currentQuery(): string {
  const p = new URLSearchParams(window.location.search)
  p.delete('page')
  return p.toString()
}

// ── Small shared bits ────────────────────────────────────────

const hintStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--stone)', cursor: 'help',
  verticalAlign: 'super', marginLeft: 3, fontWeight: 400,
}

function Th({ label, hint, className }: { label: string; hint?: string; className?: string }) {
  return (
    <th className={className}>
      {label}
      {hint && <span style={hintStyle} title={hint} aria-label={hint}>ⓘ</span>}
    </th>
  )
}

// QA item 1: click the % to see exactly which of the 11 checks are
// outstanding, with a hint for where each one lives.
function CompletenessBadge({ percent, health }: { percent: number; health: ProductHealthChecks | null }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  // Spec §4: the table container is now a horizontal scroll container so
  // the identity column can stick. An absolutely positioned popover inside
  // it would be clipped, so this renders in a portal with fixed
  // coordinates — same pattern as the row action menu.
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setCoords({ top: r.bottom + 6, right: window.innerWidth - r.right })
  }

  // QA follow-up: dismiss on outside click or Escape — a second click
  // on the badge shouldn't be the only way to close the popover.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() } }
    // Close rather than float in a stale position once the page or the
    // table scrolls away underneath it.
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  const b = completenessBreakdown(health)
  const colour = percent >= 80 ? '#166534' : percent >= 50 ? '#B45309' : '#B91C1C'
  const summary = health
    ? (b.missing.length === 0 ? 'All 11 checks complete' : `Missing: ${b.missing.map(m => m.label).join(', ')}`)
    : undefined

  const popover = open && health && coords ? (
    <div
      ref={popRef}
      style={{
        position: 'fixed', zIndex: 1000, top: coords.top, right: coords.right, width: 250,
        background: 'var(--warm-white)', border: '1px solid var(--light-line)', borderRadius: 6,
        boxShadow: '0 6px 18px rgba(24,32,26,0.14)', padding: '10px 12px', textAlign: 'left',
      }}
    >
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
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 11 }} onClick={() => { setOpen(false); btnRef.current?.focus() }}>
        Close
      </button>
    </div>
  ) : null

  return (
    <span ref={rootRef} style={{ display: 'inline-block' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => { if (!open) place(); setOpen(o => !o) }}
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
      {mounted && popover ? createPortal(popover, document.body) : null}
    </span>
  )
}

// ── Inline editing (Sprint 21) ───────────────────────────────

function InlineCell({ raw, display, kind, colour, ariaLabel, onSave }: {
  raw: string                       // editable source value ('' for empty)
  display: React.ReactNode          // formatted read view
  kind: 'money' | 'text'
  colour?: string
  ariaLabel: string
  onSave: (newRaw: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(raw)
  const [busy, setBusy] = useState(false)

  async function commit() {
    if (val.trim() === raw.trim()) { setEditing(false); return }
    setBusy(true)
    const ok = await onSave(val.trim())
    setBusy(false)
    if (ok) setEditing(false)
    else { setVal(raw); setEditing(false) }  // revert on failure
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setVal(raw); setEditing(true) }}
        aria-label={`Edit ${ariaLabel}`}
        title={`Click to edit ${ariaLabel}`}
        style={{
          background: 'none', border: 'none', padding: '2px 0', cursor: 'text',
          font: 'inherit', color: colour ?? 'inherit',
          borderBottom: '1px dashed transparent',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderBottomColor = 'var(--light-line)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderBottomColor = 'transparent' }}
      >
        {display}
      </button>
    )
  }

  return (
    <input
      autoFocus
      type={kind === 'money' ? 'number' : 'text'}
      step={kind === 'money' ? '0.01' : undefined}
      value={val}
      disabled={busy}
      aria-label={ariaLabel}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') { setVal(raw); setEditing(false) }
      }}
      style={{
        width: kind === 'money' ? 96 : 130, padding: '4px 8px', fontSize: 13,
        border: '1px solid var(--caramel, #a05a2c)', borderRadius: 4,
        background: 'var(--warm-white)', color: 'var(--forest)',
      }}
    />
  )
}

// ── Bulk actions ─────────────────────────────────────────────

const BULK_ACTIONS = [
  { value: 'publish',   label: 'Publish' },
  { value: 'unpublish', label: 'Unpublish' },
  { value: 'archive',   label: 'Archive' },
  { value: 'restore',   label: 'Restore' },
] as const

export default function ProductsTable({ products, isAdmin }: { products: ProductRow[]; isAdmin: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const router = useRouter()

  // Column visibility + saved views (Sprint 22) — hydrated from
  // localStorage after mount to avoid SSR mismatch.
  const [cols, setCols] = useState<ColKey[]>(ALL_COLS)
  const [store, setStore] = useState<ViewStore>({ views: [], defaultId: null })
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [colsOpen, setColsOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCols(loadCols())
    const s = loadViews()
    setStore(s)
    // Default view applies once per tab session, and only on a bare URL —
    // explicit filters in the address bar always win.
    try {
      if (!sessionStorage.getItem(DEFAULT_APPLIED_KEY)) {
        sessionStorage.setItem(DEFAULT_APPLIED_KEY, '1')
        const def = s.views.find(v => v.id === s.defaultId)
        if (def && window.location.search === '') {
          setCols(def.cols.length ? def.cols : ALL_COLS)
          setActiveViewId(def.id)
          if (def.query) router.replace(`/admin/products?${def.query}`)
        }
      }
    } catch { /* sessionStorage blocked */ }
  }, [router])

  // Close toolbar popovers on outside click / Escape
  useEffect(() => {
    if (!colsOpen && !manageOpen) return
    const onDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setColsOpen(false); setManageOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setColsOpen(false); setManageOpen(false) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [colsOpen, manageOpen])

  function flashMsg(text: string) {
    setFlash(text)
    window.setTimeout(() => setFlash(f => (f === text ? '' : f)), 3000)
  }

  function setColsPersist(next: ColKey[]) {
    setCols(next)
    try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  function toggleCol(key: ColKey) {
    setColsPersist(cols.includes(key) ? cols.filter(k => k !== key) : [...ALL_COLS.filter(k => cols.includes(k) || k === key)])
  }

  const show = (key: ColKey) => cols.includes(key)
  const activeView = store.views.find(v => v.id === activeViewId) ?? null

  // ── View operations ────────────────────────────────────────

  function applyView(view: SavedView) {
    setActiveViewId(view.id)
    setCols(view.cols.length ? view.cols : ALL_COLS)
    setManageOpen(false)
    router.push(view.query ? `/admin/products?${view.query}` : '/admin/products')
  }

  function saveAsNewView() {
    const name = prompt('Name this view (current filters + visible columns will be saved):')
    if (!name?.trim()) return
    const view: SavedView = {
      id: `v${Date.now().toString(36)}`,
      name: name.trim().slice(0, 60),
      query: currentQuery(),
      cols,
    }
    const next = { ...store, views: [...store.views, view] }
    setStore(next); persistViews(next)
    setActiveViewId(view.id)
    setManageOpen(false)
    flashMsg(`View "${view.name}" saved.`)
  }

  function updateCurrentView() {
    if (!activeView) return
    const next = {
      ...store,
      views: store.views.map(v => v.id === activeView.id ? { ...v, query: currentQuery(), cols } : v),
    }
    setStore(next); persistViews(next)
    setManageOpen(false)
    flashMsg(`View "${activeView.name}" updated with the current filters and columns.`)
  }

  function renameCurrentView() {
    if (!activeView) return
    const name = prompt('New name for this view:', activeView.name)
    if (!name?.trim()) return
    const next = { ...store, views: store.views.map(v => v.id === activeView.id ? { ...v, name: name.trim().slice(0, 60) } : v) }
    setStore(next); persistViews(next)
    setManageOpen(false)
  }

  function setDefaultView(id: string | null) {
    const next = { ...store, defaultId: id }
    setStore(next); persistViews(next)
    setManageOpen(false)
    flashMsg(id ? 'Default view set — it will load when you open Products.' : 'Default view cleared.')
  }

  async function deleteCurrentView() {
    if (!activeView) return
    if (!await appConfirm(`Delete the view "${activeView.name}"?\n\nThis only removes the saved view — no products are affected.`)) return
    const next = {
      views: store.views.filter(v => v.id !== activeView.id),
      defaultId: store.defaultId === activeView.id ? null : store.defaultId,
    }
    setStore(next); persistViews(next)
    setActiveViewId(null)
    setManageOpen(false)
  }

  // ── Inline field saves (Sprint 21) ─────────────────────────

  async function patchProduct(slug: string, patch: Record<string, unknown>, label: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/products/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!json.success) { alert(json.error ?? 'Save failed'); return false }
      flashMsg(`${label} saved.`)
      router.refresh()
      return true
    } catch {
      alert('Network error — please try again.')
      return false
    }
  }

  function moneySaver(slug: string, field: 'retailPrice' | 'tradePrice', label: string) {
    return async (newRaw: string): Promise<boolean> => {
      if (newRaw === '') return patchProduct(slug, { [field]: null }, label)
      const n = parseFloat(newRaw)
      if (!Number.isFinite(n) || n < 0) { alert('Enter a valid price (or clear the field to remove it).'); return false }
      return patchProduct(slug, { [field]: n }, label)
    }
  }

  // ── Selection / bulk ───────────────────────────────────────

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

  const menuItem: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px',
    fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--forest)',
  }
  const popover: React.CSSProperties = {
    position: 'absolute', zIndex: 80, top: 'calc(100% + 6px)', minWidth: 210,
    background: 'var(--warm-white)', border: '1px solid var(--light-line)', borderRadius: 6,
    boxShadow: '0 6px 18px rgba(24,32,26,0.14)', padding: '6px 0',
  }

  return (
    <>
      {/* ── Views & columns toolbar (Sprint 22) ── */}
      <div ref={toolbarRef} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, fontSize: 13 }}>
        <select
          aria-label="Saved view"
          value={activeViewId ?? ''}
          onChange={e => {
            const v = store.views.find(x => x.id === e.target.value)
            if (v) applyView(v)
            else { setActiveViewId(null); router.push('/admin/products') }
          }}
          style={{ padding: '7px 10px', border: '1px solid var(--light-line)', borderRadius: 6, fontSize: 12, background: 'var(--warm-white)', color: 'var(--forest)' }}
        >
          <option value="">All products{store.views.length === 0 ? '' : ' (no view)'}</option>
          {store.views.map(v => (
            <option key={v.id} value={v.id}>
              {v.name}{store.defaultId === v.id ? ' ★' : ''}
            </option>
          ))}
        </select>

        <span style={{ position: 'relative' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setManageOpen(o => !o); setColsOpen(false) }} aria-expanded={manageOpen}>
            Manage view ▾
          </button>
          {manageOpen && (
            <span style={{ ...popover, left: 0 }}>
              <button style={menuItem} onClick={saveAsNewView}>Save as new view…</button>
              {activeView && <button style={menuItem} onClick={updateCurrentView}>Update “{activeView.name}” with current filters</button>}
              {activeView && <button style={menuItem} onClick={renameCurrentView}>Rename…</button>}
              {activeView && store.defaultId !== activeView.id && (
                <button style={menuItem} onClick={() => setDefaultView(activeView.id)}>Set as default view</button>
              )}
              {activeView && store.defaultId === activeView.id && (
                <button style={menuItem} onClick={() => setDefaultView(null)}>Clear default</button>
              )}
              {activeView && (
                <button style={{ ...menuItem, color: '#a03030', borderTop: '1px solid var(--light-line)' }} onClick={deleteCurrentView}>
                  Delete view…
                </button>
              )}
              {!activeView && store.views.length === 0 && (
                <span style={{ ...menuItem, cursor: 'default', color: 'var(--stone)', fontSize: 12 }}>
                  Save the current filters and columns as a reusable view.
                </span>
              )}
            </span>
          )}
        </span>

        <span style={{ position: 'relative', marginLeft: 'auto' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setColsOpen(o => !o); setManageOpen(false) }} aria-expanded={colsOpen}>
            ⚙ Customize columns
          </button>
          {colsOpen && (
            <span style={{ ...popover, right: 0 }}>
              {TOGGLEABLE_COLUMNS.map(c => (
                <label key={c.key} style={{ ...menuItem, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} title={c.hint}>
                  <input type="checkbox" checked={show(c.key)} onChange={() => toggleCol(c.key)} />
                  {c.label}
                </label>
              ))}
              <span style={{ display: 'block', padding: '6px 14px 4px', fontSize: 11, color: 'var(--stone)', borderTop: '1px solid var(--light-line)' }}>
                Remembered on this browser.
              </span>
            </span>
          )}
        </span>
      </div>

      {flash && (
        <div role="status" style={{ marginBottom: 10, padding: '8px 12px', background: '#DCFCE7', color: '#166534', fontSize: 13, borderRadius: 4 }}>
          ✓ {flash}
        </div>
      )}

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

      {/* Spec §4: the whole component stays inside the white admin panel and
          the PAGE never scrolls sideways — any horizontal movement happens
          inside the scroll region only. The checkbox + thumbnail + name +
          slug form one protected identity group pinned to the left
          (.col-select / .col-identity) so the product being reviewed is
          always named, whatever else is scrolled into view.

          Columns are NOT dropped by width here: every column ticked in
          "Customize columns" stays reachable by scrolling, because
          silently hiding a column the user explicitly enabled contradicts
          their own choice. HScrollFrame adds a mirrored scrollbar above
          the table so that control is findable without scrolling past
          every row first. */}
      <HScrollFrame className="admin-table-stickyid" label="Products table — scroll sideways for more columns">
        <table className="data-table admin-fit-table">
          <thead>
            <tr>
              <th className="col-select">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all products" />
              </th>
              <Th label="Name" className="col-identity" />
              {show('category') && <Th label="Category" hint={TOGGLEABLE_COLUMNS[0].hint} className="col-wrap" />}
              {show('artisan')  && <Th label="Artisan"  hint={TOGGLEABLE_COLUMNS[1].hint} className="col-wrap" />}
              {show('retail')   && <Th label="Retail"   hint={TOGGLEABLE_COLUMNS[2].hint} className="col-p2 col-fit" />}
              {show('trade')    && <Th label="Trade"    hint={TOGGLEABLE_COLUMNS[3].hint} className="col-fit" />}
              {show('lead')     && <Th label="Lead time" hint={TOGGLEABLE_COLUMNS[4].hint} className="col-p3 col-fit" />}
              {show('imgs')     && <Th label="Imgs"     hint={TOGGLEABLE_COLUMNS[5].hint} className="col-p3 col-fit" />}
              {show('complete') && <Th label="Complete" hint={TOGGLEABLE_COLUMNS[6].hint} className="col-fit" />}
              <Th label="Status" className="col-fit" />
              <th className="col-fit"></th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => {
              const archived = Boolean(p.archived_at)
              const por = p.price_type === 'price_on_request'
              return (
                // Archived rows are muted with colour + the "archived" pill
                // rather than row opacity: an opacity group would make the
                // pinned identity cells semi-transparent and let the
                // scrolling columns show through them.
                <tr key={p.id} className={archived ? 'row-archived' : undefined}>
                  <td className="col-select">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      aria-label={`Select ${p.name}`}
                    />
                  </td>
                  <td className="col-identity">
                    {/* Wix-inspired: thumbnail + name link straight to the
                        editor — the image makes rows scannable at a glance. */}
                    <Link href={`/admin/products/${p.slug}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                      {p.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.thumb}
                          alt=""
                          width={44}
                          height={44}
                          loading="lazy"
                          style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--light-line)', flexShrink: 0, background: '#F0EDE7' }}
                        />
                      ) : (
                        <span aria-hidden style={{
                          width: 44, height: 44, borderRadius: 4, flexShrink: 0,
                          border: '1px dashed var(--light-line)', background: '#F5F2EC',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, letterSpacing: '0.06em', color: '#B45309', textAlign: 'center', lineHeight: 1.2,
                        }}>
                          no image
                        </span>
                      )}
                      <span style={{ minWidth: 0 }}>
                        {/* Name wraps to at most two lines then ellipses, with
                            the full value on the title attribute — it never
                            widens the table and is never fully hidden. */}
                        <span className="cell-clamp-2" title={p.name} style={{ fontWeight: 500 }}>{p.name}</span>
                        <span className="cell-clamp-1 cell-sub" title={p.slug}>{p.slug}</span>
                      </span>
                    </Link>
                  </td>
                  {show('category') && (
                    <td className="col-wrap" style={{ fontSize: 13, color: 'var(--stone)' }}>
                      <span className="cell-clamp-2" title={p.category_name ?? ''}>{p.category_name ?? '—'}</span>
                    </td>
                  )}
                  {show('artisan') && (
                    // Spec §4: artisan names wrap onto a second line inside a
                    // capped column instead of forcing the table past the
                    // panel. No white-space: nowrap; the full name stays
                    // available via the title attribute.
                    <td className="col-wrap" style={{ fontSize: 13, color: 'var(--stone)' }}>
                      <span className="cell-clamp-2" title={p.artisan_name ?? ''}>{p.artisan_name ?? '—'}</span>
                    </td>
                  )}
                  {show('retail') && (
                    <td className="col-p2">
                      {por ? (
                        <span style={{ fontStyle: 'italic', color: 'var(--stone)', fontSize: 12 }} title="Price on request — edit on the product page">POR</span>
                      ) : isAdmin ? (
                        <InlineCell
                          key={`r-${p.retail_price ?? ''}`}
                          raw={p.retail_price != null ? String(p.retail_price) : ''}
                          display={p.retail_price != null ? `£${Number(p.retail_price).toLocaleString()}` : '—'}
                          kind="money"
                          ariaLabel={`retail price for ${p.name}`}
                          onSave={moneySaver(p.slug, 'retailPrice', 'Retail price')}
                        />
                      ) : (
                        p.retail_price != null ? <span>£{Number(p.retail_price).toLocaleString()}</span> : '—'
                      )}
                    </td>
                  )}
                  {show('trade') && (
                    <td>
                      {por ? (
                        <span style={{ fontStyle: 'italic', color: 'var(--stone)', fontSize: 12 }}>POR</span>
                      ) : isAdmin ? (
                        <InlineCell
                          key={`t-${p.trade_price ?? ''}`}
                          raw={p.trade_price != null ? String(p.trade_price) : ''}
                          display={p.trade_price != null ? `£${Number(p.trade_price).toLocaleString()}` : '—'}
                          kind="money"
                          colour="var(--caramel)"
                          ariaLabel={`trade price for ${p.name}`}
                          onSave={moneySaver(p.slug, 'tradePrice', 'Trade price')}
                        />
                      ) : (
                        p.trade_price != null ? <span style={{ color: 'var(--caramel)' }}>£{Number(p.trade_price).toLocaleString()}</span> : '—'
                      )}
                    </td>
                  )}
                  {show('lead') && (
                    <td className="col-p3" style={{ fontSize: 12 }}>
                      {isAdmin ? (
                        <InlineCell
                          key={`l-${p.lead_time ?? ''}`}
                          raw={p.lead_time ?? ''}
                          display={p.lead_time ?? <span style={{ color: '#B45309' }}>missing</span>}
                          kind="text"
                          ariaLabel={`lead time for ${p.name}`}
                          onSave={(v) => patchProduct(p.slug, { leadTime: v || null }, 'Lead time')}
                        />
                      ) : (
                        <span style={{ color: p.lead_time ? 'inherit' : '#B45309' }}>{p.lead_time ?? 'missing'}</span>
                      )}
                    </td>
                  )}
                  {show('imgs') && (
                    <td className="col-p3" style={{ fontSize: 12, color: p.image_count === 0 ? '#B45309' : 'inherit' }}>
                      {p.image_count}
                    </td>
                  )}
                  {show('complete') && (
                    <td>
                      {typeof p.completeness === 'number' ? (
                        <CompletenessBadge percent={p.completeness} health={p.health ?? null} />
                      ) : '—'}
                    </td>
                  )}
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
      </HScrollFrame>
    </>
  )
}
