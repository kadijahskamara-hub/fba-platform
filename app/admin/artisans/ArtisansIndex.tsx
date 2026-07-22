'use client'

// Artisan / manufacturer management index (final amendments §3).
//  · table view (default) + optional card view
//  · checkbox selection, select-page vs select-all-matching
//  · bulk publish / unpublish / archive / restore / delete
//  · search, status + has-products filters, sortable columns
// Destructive actions are confirmed, dependency-protected
// server-side, and audited.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { appConfirm } from '@/lib/appConfirm'

export interface ArtisanRow {
  id: string
  name: string
  slug: string
  location: string | null
  craft_category: string | null
  profile_image: string | null
  is_active: boolean
  archived_at: string | null
  created_at: string
  product_count: number
}

type Status = 'published' | 'hidden' | 'archived'
type SortKey = 'name' | 'created' | 'status' | 'products'

const PER_PAGE = 50
const VIEW_KEY = 'fba.adminArtisans.view'

function statusOf(a: ArtisanRow): Status {
  if (a.archived_at) return 'archived'
  return a.is_active ? 'published' : 'hidden'
}

const STATUS_META: Record<Status, { label: string; bg: string; fg: string; hint: string }> = {
  published: { label: 'Published', bg: '#DCFCE7', fg: '#166534', hint: 'Visible on the public website' },
  hidden:    { label: 'Hidden',    bg: '#FEF3C7', fg: '#92400E', hint: 'Not shown on the public website' },
  archived:  { label: 'Archived',  bg: '#E5E7EB', fg: '#4B5563', hint: 'Hidden and archived — restore to work with it again' },
}

const BULK = [
  { action: 'publish',   label: 'Publish' },
  { action: 'unpublish', label: 'Hide from site' },
  { action: 'archive',   label: 'Archive' },
  { action: 'restore',   label: 'Restore' },
] as const

export default function ArtisansIndex({ artisans, isAdmin }: { artisans: ArtisanRow[]; isAdmin: boolean }) {
  const router = useRouter()
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'' | Status>('')
  const [products, setProducts] = useState<'' | 'with' | 'without'>('')
  const [sort, setSort] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')

  useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === 'cards') setView('cards') } catch { /* blocked */ }
  }, [])

  function switchView(v: 'table' | 'cards') {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* blocked */ }
  }

  // ── Filter + sort ──
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = artisans.filter(a => {
      if (needle && !`${a.name} ${a.location ?? ''} ${a.craft_category ?? ''}`.toLowerCase().includes(needle)) return false
      if (status && statusOf(a) !== status) return false
      if (products === 'with' && a.product_count === 0) return false
      if (products === 'without' && a.product_count > 0) return false
      return true
    })
    const dir = sortAsc ? 1 : -1
    const rank: Record<Status, number> = { published: 0, hidden: 1, archived: 2 }
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'created':  return dir * a.created_at.localeCompare(b.created_at)
        case 'status':   return dir * (rank[statusOf(a)] - rank[statusOf(b)])
        case 'products': return dir * (a.product_count - b.product_count)
        default:         return dir * a.name.localeCompare(b.name)
      }
    })
    return list
  }, [artisans, q, status, products, sort, sortAsc])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)

  useEffect(() => { setPage(1) }, [q, status, products])

  // ── Selection ──
  const pageIds = pageRows.map(r => r.id)
  const pageAllSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id))
  const allMatchingSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id))

  function togglePage() {
    const next = new Set(selected)
    if (pageAllSelected) pageIds.forEach(id => next.delete(id))
    else pageIds.forEach(id => next.add(id))
    setSelected(next)
  }
  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  function flashMsg(text: string) {
    setFlash(text)
    window.setTimeout(() => setFlash(f => (f === text ? '' : f)), 5000)
  }

  // ── Bulk actions ──
  async function runBulk(action: string) {
    const ids = [...selected]
    if (ids.length === 0) return
    const names = artisans.filter(a => selected.has(a.id)).map(a => a.name)
    const preview = names.slice(0, 8).join(', ') + (names.length > 8 ? ` … and ${names.length - 8} more` : '')

    const prompts: Record<string, string> = {
      publish:   `Publish ${ids.length} artisan(s)? They will be visible on the public website.\n\n${preview}`,
      unpublish: `Hide ${ids.length} artisan(s) from the public website?\n\n${preview}`,
      archive:   `Archive ${ids.length} artisan(s)? They will be hidden from the public website and moved to the archive.\n\n${preview}`,
      restore:   `Restore ${ids.length} artisan(s) from the archive? They stay hidden until you publish them.\n\n${preview}`,
      delete:    `PERMANENTLY delete ${ids.length} artisan(s)?\n\n${preview}\n\nThis cannot be undone. Artisans still referenced by products, quotes, purchase orders or deliveries are kept automatically — use Archive for those.`,
    }
    if (!await appConfirm(prompts[action])) return

    setBusy(true)
    try {
      const res = await fetch('/api/admin/artisans/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids }),
      })
      const json = await res.json()
      if (!json.success) { alert(json.error ?? 'Bulk action failed.'); return }
      flashMsg(json.message ?? `${json.data?.affected ?? ids.length} record(s) updated.`)
      setSelected(new Set())
      router.refresh()
    } catch {
      alert('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  function headerSort(key: SortKey, label: string) {
    const active = sort === key
    return (
      <button type="button" onClick={() => { if (active) setSortAsc(a => !a); else { setSort(key); setSortAsc(true) } }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', padding: 0 }}
        aria-label={`Sort by ${label}`}>
        {label}{active ? (sortAsc ? ' ↑' : ' ↓') : ''}
      </button>
    )
  }

  const ctl: React.CSSProperties = {
    padding: '7px 10px', border: '1px solid var(--light-line)', borderRadius: 6,
    fontSize: 12, background: 'var(--warm-white)', color: 'var(--forest)',
  }

  return (
    <>
      {/* ── Filters / view toggle ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input type="search" placeholder="Search name, location, craft…" value={q} onChange={e => setQ(e.target.value)}
          aria-label="Search artisans" style={{ ...ctl, minWidth: 220, flex: '1 1 220px' }} />
        <select value={status} onChange={e => setStatus(e.target.value as '' | Status)} aria-label="Filter by status" style={ctl}>
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="hidden">Hidden</option>
          <option value="archived">Archived</option>
        </select>
        <select value={products} onChange={e => setProducts(e.target.value as '' | 'with' | 'without')} aria-label="Filter by products" style={ctl}>
          <option value="">Any products</option>
          <option value="with">Has products</option>
          <option value="without">No products</option>
        </select>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 2, border: '1px solid var(--light-line)', borderRadius: 6, overflow: 'hidden' }}>
          {(['table', 'cards'] as const).map(v => (
            <button key={v} type="button" onClick={() => switchView(v)} aria-pressed={view === v}
              style={{
                padding: '6px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                background: view === v ? 'var(--forest)' : 'var(--warm-white)',
                color: view === v ? 'var(--cream, #fff)' : 'var(--forest)',
              }}>
              {v === 'table' ? 'Table' : 'Cards'}
            </button>
          ))}
        </span>
      </div>

      {flash && (
        <div role="status" style={{ marginBottom: 10, padding: '8px 12px', background: '#DCFCE7', color: '#166534', fontSize: 13, borderRadius: 4 }}>
          ✓ {flash}
        </div>
      )}

      {/* ── Selection / bulk bar ── */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 14px',
          marginBottom: 10, background: 'var(--cream, #f7f3ec)',
          border: '1px solid var(--light-line)', borderRadius: 6, fontSize: 13,
        }}>
          <strong>{selected.size} selected</strong>
          {!allMatchingSelected && filtered.length > pageIds.length && (
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(filtered.map(r => r.id)))}>
              Select all {filtered.length} matching
            </button>
          )}
          {BULK.map(b => (
            <button key={b.action} className="btn btn-ghost btn-sm" disabled={busy} onClick={() => runBulk(b.action)}>
              {b.label}
            </button>
          ))}
          {isAdmin && (
            <button className="btn btn-ghost btn-sm" disabled={busy} style={{ color: '#a03030' }} onClick={() => runBulk('delete')}>
              Delete permanently
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}>
            Clear selection
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state"><h3>No artisans match this filter.</h3><p>Clear the search or filters above.</p></div>
      ) : view === 'table' ? (
        <div className="admin-table-wrap">
          <table className="data-table admin-fit-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input type="checkbox" checked={pageAllSelected} onChange={togglePage}
                    aria-label="Select all artisans on this page" />
                </th>
                <th>{headerSort('name', 'Name')}</th>
                <th className="col-p2">Location</th>
                <th className="col-p3">Craft</th>
                <th>{headerSort('products', 'Products')}</th>
                <th>{headerSort('status', 'Status')}</th>
                <th className="col-p3">{headerSort('created', 'Created')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(a => {
                const st = statusOf(a)
                const meta = STATUS_META[st]
                return (
                  <tr key={a.id} style={st === 'archived' ? { opacity: 0.65 } : undefined}>
                    <td>
                      <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)}
                        aria-label={`Select ${a.name}`} />
                    </td>
                    <td>
                      <Link href={`/admin/artisans/${a.slug}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                        {a.profile_image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.profile_image} alt="" width={40} height={40} loading="lazy"
                            style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--light-line)', flexShrink: 0, background: 'var(--sage-light)' }} />
                        ) : (
                          <span aria-hidden style={{
                            width: 40, height: 40, borderRadius: 4, flexShrink: 0, background: 'var(--sage-light)',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--stone)',
                          }}>—</span>
                        )}
                        <span className="cell-truncate" title={a.name} style={{ fontWeight: 500 }}>{a.name}</span>
                      </Link>
                    </td>
                    <td className="col-p2"><span className="cell-truncate" title={a.location ?? ''} style={{ fontSize: 13, color: 'var(--stone)' }}>{a.location ?? '—'}</span></td>
                    <td className="col-p3"><span className="cell-truncate" title={a.craft_category ?? ''} style={{ fontSize: 13, color: 'var(--stone)' }}>{a.craft_category ?? '—'}</span></td>
                    <td style={{ fontSize: 13 }}>{a.product_count}</td>
                    <td>
                      <span className="status-pill" title={meta.hint} style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span>
                    </td>
                    <td className="col-p3" style={{ fontSize: 12, color: 'var(--stone)', whiteSpace: 'nowrap' }}>
                      {new Date(a.created_at).toLocaleDateString('en-GB')}
                    </td>
                    <td>
                      <Link href={`/admin/artisans/${a.slug}`} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Edit</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
          {pageRows.map(a => {
            const st = statusOf(a)
            const meta = STATUS_META[st]
            return (
              <div key={a.id} style={{ background: 'var(--warm-white)', border: selected.has(a.id) ? '1px solid var(--forest)' : '1px solid var(--light-line)', overflow: 'hidden', position: 'relative' }}>
                <label style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, background: 'rgba(255,255,255,0.85)', padding: 4, borderRadius: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} aria-label={`Select ${a.name}`} />
                </label>
                <div style={{ height: 140, position: 'relative', background: 'var(--sage-light)' }}>
                  {a.profile_image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.profile_image} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  )}
                  <span className="status-pill" title={meta.hint}
                    style={{ position: 'absolute', top: 8, right: 8, background: meta.bg, color: meta.fg }}>
                    {meta.label}
                  </span>
                </div>
                <div style={{ padding: '14px 16px 18px' }}>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 10 }}>
                    {[a.location, `${a.product_count} product${a.product_count === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                  </div>
                  <Link href={`/admin/artisans/${a.slug}`} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Edit profile</Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 16, fontSize: 13 }}>
          <button className="btn btn-ghost btn-sm" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>← Previous</button>
          <span style={{ color: 'var(--stone)' }}>Page {safePage} of {totalPages} · {filtered.length} matching</span>
          <button className="btn btn-ghost btn-sm" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </>
  )
}
