'use client'

// Category management (final amendments §5).
//  · inline publish / hide toggle, archive / restore
//  · reorder (↑ / ↓ swap sort_order — public navigation follows)
//  · dependency-protected permanent deletion with reassignment
//  · shows slug, visibility, product count, order, last updated

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { appConfirm } from '@/lib/appConfirm'

export interface CategoryRow {
  id: string
  name: string
  slug: string
  is_visible: boolean
  archived_at: string | null
  sort_order: number
  updated_at: string | null
  product_count: number
}

type Status = 'published' | 'hidden' | 'archived'

function statusOf(c: CategoryRow): Status {
  if (c.archived_at) return 'archived'
  return c.is_visible ? 'published' : 'hidden'
}

// Colour is never the only signal: each pill carries its own word label
// ("Visible online" / "Hidden" / "Archived") plus a title hint.
const STATUS_META: Record<Status, { label: string; bg: string; fg: string; hint: string }> = {
  published: { label: 'Visible online', bg: '#DCFCE7', fg: '#166534', hint: 'Category and its published products appear across the public site' },
  hidden:    { label: 'Hidden',         bg: '#FEF3C7', fg: '#92400E', hint: 'Category and its products leave the public site completely — including their direct product URLs. Records stay editable here.' },
  archived:  { label: 'Archived',       bg: '#E5E7EB', fg: '#4B5563', hint: 'Off the public site and out of active category pickers — restore to work with it again' },
}

export default function CategoriesManager({ categories, isAdmin }: { categories: CategoryRow[]; isAdmin: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)   // category id being mutated
  const [flash, setFlash] = useState('')
  const [deleting, setDeleting] = useState<CategoryRow | null>(null)
  const [reassignTo, setReassignTo] = useState('')

  function flashMsg(text: string) {
    setFlash(text)
    window.setTimeout(() => setFlash(f => (f === text ? '' : f)), 5000)
  }

  async function patch(cat: CategoryRow, body: Record<string, unknown>, doneMsg: string) {
    setBusy(cat.id)
    try {
      const res = await fetch(`/api/admin/categories/${cat.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) { alert(json.error ?? 'Update failed.'); return }
      flashMsg(doneMsg)
      router.refresh()
    } catch {
      alert('Network error — please try again.')
    } finally {
      setBusy(null)
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= categories.length) return
    const a = categories[index], b = categories[j]
    // Swap sort orders (two PATCHes; the second failing is recoverable
    // by pressing the arrow again).
    setBusy(a.id)
    try {
      const r1 = await fetch(`/api/admin/categories/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: b.sort_order === a.sort_order ? b.sort_order + dir : b.sort_order }),
      }).then(r => r.json())
      const r2 = await fetch(`/api/admin/categories/${b.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: a.sort_order }),
      }).then(r => r.json())
      if (!r1.success || !r2.success) alert(r1.error ?? r2.error ?? 'Reorder failed.')
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function archive(cat: CategoryRow) {
    const productNote = cat.product_count > 0
      ? ` Its ${cat.product_count} product(s) also leave the public site, including their direct URLs — records and data are kept.`
      : ' Products keep their data.'
    if (!await appConfirm(`Archive “${cat.name}”? It disappears from the public site and this list moves it to Archived.${productNote}`)) return
    await patch(cat, { archived: true }, `“${cat.name}” archived.`)
  }

  // Hiding is as consequential as archiving now that products follow the
  // category off the public site — confirm it when products are attached.
  async function toggleVisible(cat: CategoryRow) {
    if (cat.is_visible && cat.product_count > 0) {
      const ok = await appConfirm(
        `Hide “${cat.name}” from the public site?\n\nIts ${cat.product_count} product(s) will also disappear from every public page, search, feed and their direct product URLs. Nothing is deleted — publishing the category again brings them all back.`,
      )
      if (!ok) return
    }
    await patch(
      cat,
      { isVisible: !cat.is_visible },
      cat.is_visible
        ? `“${cat.name}” hidden — its ${cat.product_count} product(s) are off the public site.`
        : `“${cat.name}” is now visible online.`,
    )
  }

  async function runDelete() {
    if (!deleting) return
    const needsReassign = deleting.product_count > 0
    if (needsReassign && !reassignTo) { alert('Choose a category to move the products to first.'); return }
    const target = categories.find(c => c.id === reassignTo)
    const msg = needsReassign
      ? `PERMANENTLY delete “${deleting.name}” and move its ${deleting.product_count} product(s) to “${target?.name}”?\n\nProduct records and URLs are preserved; their subcategory is cleared. This cannot be undone.`
      : `PERMANENTLY delete “${deleting.name}”? This cannot be undone.`
    if (!await appConfirm(msg)) return

    setBusy(deleting.id)
    try {
      const res = await fetch(`/api/admin/categories/${deleting.id}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(needsReassign ? { reassignTo } : {}),
      })
      const json = await res.json()
      if (!json.success) { alert(json.error ?? 'Delete failed.'); return }
      flashMsg(needsReassign
        ? `“${deleting.name}” deleted — ${json.data?.moved ?? deleting.product_count} product(s) moved to “${target?.name}”.`
        : `“${deleting.name}” deleted.`)
      setDeleting(null)
      setReassignTo('')
      router.refresh()
    } catch {
      alert('Network error — please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {flash && (
        <div role="status" style={{ marginBottom: 10, padding: '8px 12px', background: '#DCFCE7', color: '#166534', fontSize: 13, borderRadius: 4 }}>
          ✓ {flash}
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="data-table admin-fit-table">
          <thead>
            <tr>
              <th style={{ width: 70 }}>Order</th>
              <th>Category</th>
              <th className="col-p2">Slug</th>
              <th className="col-fit">Status</th>
              <th className="col-fit">Products</th>
              <th className="col-p3 col-fit">Last updated</th>
              <th className="col-fit"></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c, i) => {
              const st = statusOf(c)
              const meta = STATUS_META[st]
              const rowBusy = busy === c.id
              return (
                <tr key={c.id} style={st === 'archived' ? { opacity: 0.65 } : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }}
                      disabled={rowBusy || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${c.name} earlier`}>↑</button>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }}
                      disabled={rowBusy || i === categories.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${c.name} later`}>↓</button>
                  </td>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td className="col-p2" style={{ fontSize: 12, color: 'var(--stone)' }}>{c.slug}</td>
                  <td>
                    <span className="status-pill" title={meta.hint} style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span>
                  </td>
                  <td style={{ fontSize: 13 }}>{c.product_count}</td>
                  <td className="col-p3" style={{ fontSize: 12, color: 'var(--stone)', whiteSpace: 'nowrap' }}>
                    {c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {st !== 'archived' && (
                      <button className="btn btn-ghost btn-sm" disabled={rowBusy}
                        title={c.is_visible
                          ? `Hide “${c.name}” and its ${c.product_count} product(s) from the public site`
                          : `Publish “${c.name}” and its eligible products`}
                        onClick={() => toggleVisible(c)}>
                        {c.is_visible ? 'Hide' : 'Publish'}
                      </button>
                    )}
                    {st === 'archived' ? (
                      <button className="btn btn-ghost btn-sm" disabled={rowBusy}
                        onClick={() => patch(c, { archived: false }, `“${c.name}” restored from the archive (still hidden — publish to show it online).`)}>
                        Restore
                      </button>
                    ) : (
                      <button className="btn btn-ghost btn-sm" disabled={rowBusy} onClick={() => archive(c)}>
                        Archive
                      </button>
                    )}
                    {isAdmin && (
                      <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} disabled={rowBusy}
                        onClick={() => { setDeleting(c); setReassignTo('') }}>
                        Delete…
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Delete flow (dependency-protected, with reassignment) ── */}
      {deleting && (
        <div style={{
          marginTop: 14, padding: '16px 18px', background: '#FDF0F0',
          border: '1px solid #E5B4B4', borderRadius: 6, fontSize: 13,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            Delete “{deleting.name}” permanently
          </div>
          {deleting.product_count > 0 ? (
            <>
              <p style={{ marginBottom: 10 }}>
                {deleting.product_count} product(s) are assigned to this category. Choose where to move them —
                product records and URLs are preserved (their subcategory is cleared because it belongs to this
                category’s tree). Prefer <strong>Hide</strong> or <strong>Archive</strong> if you only want it off the website.
              </p>
              <select value={reassignTo} onChange={e => setReassignTo(e.target.value)}
                aria-label="Move products to category"
                style={{ padding: '7px 10px', border: '1px solid var(--light-line)', borderRadius: 6, fontSize: 12, background: 'var(--warm-white)', marginRight: 10 }}>
                <option value="">— move products to… —</option>
                {categories.filter(c => c.id !== deleting.id && !c.archived_at).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </>
          ) : (
            <p style={{ marginBottom: 10 }}>No products are assigned — this category can be deleted safely.</p>
          )}
          <button className="btn btn-primary btn-sm" style={{ background: '#a03030', borderColor: '#a03030' }}
            disabled={busy === deleting.id || (deleting.product_count > 0 && !reassignTo)}
            onClick={runDelete}>
            {busy === deleting.id ? 'Deleting…' : 'Delete permanently'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setDeleting(null)}>
            Cancel
          </button>
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--stone)', marginTop: 16, maxWidth: 760, lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--forest)' }}>Hiding or archiving a category also hides its products.</strong>{' '}
        They leave navigation, category pages, The Edit, Collection, FBA Home, search, recommended and
        recently viewed modules, the public catalogue API, product feeds and the sitemap — and their direct
        product URLs return “not found” while the category is hidden. Every product record stays here in
        admin, fully editable, and re-publishing the category restores public visibility without data loss.
      </p>
    </>
  )
}
