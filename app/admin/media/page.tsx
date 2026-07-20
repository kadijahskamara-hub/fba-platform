'use client'

// ============================================================
// Media Library (Sprint 23) — /admin/media
//
// Browse the public storage buckets with thumbnails, search and
// a usage map (which products / site settings use each image).
// Edit opens the Wix-style crop editor (saves as a new copy).
// Delete = move to trash/ (restorable) — never a hard delete.
// Upload is direct (multipart); images can then be assigned to
// products or to site image slots (heroes) from the drawer.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { appConfirm } from '@/lib/appConfirm'
import MediaEditorModal from '@/components/admin/MediaEditorModal'

type Usage = { kind: string; label: string; href: string }
type MediaObj = {
  bucket: string
  path: string
  name: string
  size: number | null
  updatedAt: string | null
  mimetype: string | null
  url: string
  usedIn: Usage[]
}

const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif)$/i

function fmtBytes(n: number | null): string {
  if (n === null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function AdminMediaPage() {
  const [bucket, setBucket] = useState('product-media')
  const [buckets, setBuckets] = useState<string[]>(['product-media', 'site-assets'])
  const [objects, setObjects] = useState<MediaObj[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showTrash, setShowTrash] = useState(false)
  const [editing, setEditing] = useState<MediaObj | null>(null)
  const [selected, setSelected] = useState<MediaObj | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [targets, setTargets] = useState<{
    products: Array<{ id: string; name: string; sku?: string | null }>
    heroSlots: Array<{ key: string; label: string; currentUrl: string }>
  } | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [heroChoice, setHeroChoice] = useState('')

  const fetchObjects = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ bucket })
    if (search.trim()) params.set('search', search.trim())
    if (showTrash) params.set('trash', '1')
    const res = await fetch(`/api/admin/media?${params}`).then(r => r.json()).catch(() => null)
    if (res?.success) {
      setObjects(res.data)
      if (Array.isArray(res.buckets)) setBuckets(res.buckets)
    }
    setLoading(false)
  }, [bucket, search, showTrash])

  useEffect(() => { fetchObjects() }, [fetchObjects])

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 3500) }

  const trashOrRestore = async (obj: MediaObj, restore: boolean) => {
    if (!restore) {
      const inUse = obj.usedIn.length > 0
      const q = inUse
        ? `This image is used in ${obj.usedIn.length} place${obj.usedIn.length > 1 ? 's' : ''} — moving it to the trash will break those references. Continue?`
        : 'Move this file to the trash? You can restore it later.'
      if (!await appConfirm(q)) return
    }
    setBusy(true)
    const res = await fetch('/api/admin/media/trash', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket: obj.bucket, path: obj.path, restore }),
    }).then(r => r.json()).catch(() => ({ success: false }))
    setBusy(false)
    if (!res.success) { alert(res.error ?? 'Operation failed'); return }
    setSelected(null)
    flash(restore ? 'File restored.' : 'Moved to trash.')
    fetchObjects()
  }

  const doUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    let ok = 0
    for (const file of Array.from(files)) {
      const form = new FormData()
      form.append('file', file)
      form.append('bucket', bucket)
      const res = await fetch('/api/admin/media/upload', { method: 'POST', body: form })
        .then(r => r.json()).catch(() => ({ success: false, error: 'Network error' }))
      if (res.success) ok++
      else alert(`${file.name}: ${res.error ?? 'Upload failed'}`)
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (ok > 0) { flash(`${ok} image${ok > 1 ? 's' : ''} uploaded.`); fetchObjects() }
  }

  // Assignment targets (products + hero slots), fetched once on demand.
  const loadTargets = useCallback(async () => {
    if (targets) return
    const res = await fetch('/api/admin/media/assign').then(r => r.json()).catch(() => null)
    if (res?.success) setTargets(res.data)
  }, [targets])
  useEffect(() => { if (selected) loadTargets() }, [selected, loadTargets])

  const assign = async (target: { type: 'product'; productId: string } | { type: 'site_setting'; key: string }) => {
    if (!selected) return
    setBusy(true)
    const res = await fetch('/api/admin/media/assign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket: selected.bucket, path: selected.path, target }),
    }).then(r => r.json()).catch(() => ({ success: false, error: 'Network error' }))
    setBusy(false)
    if (!res.success) { alert(res.error ?? 'Assignment failed'); return }
    setSelected(null); setProductSearch(''); setHeroChoice(''); setTargets(null)
    flash(`Image assigned to ${res.data.assigned}.`)
    fetchObjects()
  }

  const copyUrl = async (obj: MediaObj) => {
    try { await navigator.clipboard.writeText(obj.url); flash('URL copied.') } catch { /* ignore */ }
  }

  const inp: React.CSSProperties = { border: '1px solid var(--light-line)', borderRadius: 4, padding: '7px 9px', fontSize: 13, background: 'var(--warm-white)' }

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Media Library</h1>
          <p className="admin-subtitle">
            {loading ? 'Loading…' : `${objects.length} file${objects.length !== 1 ? 's' : ''} in ${bucket}${showTrash ? ' (trash)' : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
            multiple style={{ display: 'none' }} onChange={e => doUpload(e.target.files)}
          />
          <button className="btn btn-primary btn-sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Uploading…' : '+ Upload images'}
          </button>
        </div>
      </div>

      {notice && <div style={{ background: '#eef6ee', color: '#155724', padding: '8px 12px', borderRadius: 4, fontSize: 13, marginBottom: 12 }}>{notice}</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={bucket} onChange={e => { setBucket(e.target.value); setSelected(null) }} className="form-select" style={{ width: 200 }}>
          {buckets.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <input type="search" placeholder="Search file names…" value={search} onChange={e => setSearch(e.target.value)} className="form-input" style={{ width: 280 }} />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginLeft: 'auto' }}>
          <input type="checkbox" checked={showTrash} onChange={e => { setShowTrash(e.target.checked); setSelected(null) }} /> Show trash
        </label>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--stone)', fontSize: 14 }}>Loading media…</div>
      ) : !objects.length ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--stone)', fontSize: 14 }}>
          {showTrash ? 'The trash is empty.' : 'No files found in this bucket.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          {objects.map(o => (
            <div
              key={o.path}
              onClick={() => setSelected(o)}
              style={{
                border: selected?.path === o.path ? '2px solid var(--caramel)' : '1px solid var(--light-line)',
                borderRadius: 6, overflow: 'hidden', cursor: 'pointer', background: 'var(--warm-white)',
              }}
            >
              <div style={{ aspectRatio: '1', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {IMAGE_RE.test(o.name) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.url} alt={o.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--stone)' }}>{o.name.split('.').pop()?.toUpperCase() ?? 'FILE'}</span>
                )}
              </div>
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.path}>{o.name}</div>
                <div style={{ fontSize: 11, color: 'var(--stone)', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span>{fmtBytes(o.size)}</span>
                  {o.usedIn.length > 0 && (
                    <span title={o.usedIn.map(u => u.label).join('\n')} style={{ color: 'var(--caramel)' }}>
                      used ×{o.usedIn.length}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <h2 className="h3" style={{ wordBreak: 'break-all', paddingRight: 12 }}>{selected.name}</h2>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--stone)' }}>×</button>
            </div>
            {IMAGE_RE.test(selected.name) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.url} alt="" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', background: 'var(--cream)', borderRadius: 4, marginBottom: 14 }} />
            )}
            <div style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 14 }}>
              <div><strong style={{ color: 'inherit' }}>Path:</strong> {selected.bucket}/{selected.path}</div>
              <div><strong style={{ color: 'inherit' }}>Size:</strong> {fmtBytes(selected.size)}{selected.mimetype ? ` · ${selected.mimetype}` : ''}</div>
              {selected.updatedAt && <div><strong style={{ color: 'inherit' }}>Updated:</strong> {new Date(selected.updatedAt).toLocaleString('en-GB')}</div>}
            </div>

            <div style={{ borderTop: '1px solid var(--light-line)', paddingTop: 12, marginBottom: 14 }}>
              <div className="label" style={{ marginBottom: 8 }}>Used in ({selected.usedIn.length})</div>
              {selected.usedIn.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--stone)' }}>Not referenced by any product or site setting.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selected.usedIn.map((u, i) => (
                    <a key={i} href={u.href} style={{ fontSize: 13, padding: '6px 10px', background: 'var(--cream)', borderRadius: 4, textDecoration: 'none', color: 'inherit' }}>
                      {u.label} →
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Assign to product / site slot */}
            {!showTrash && IMAGE_RE.test(selected.name) && (
              <div style={{ borderTop: '1px solid var(--light-line)', paddingTop: 12, marginBottom: 14 }}>
                <div className="label" style={{ marginBottom: 8 }}>Assign this image</div>
                {!targets ? (
                  <p style={{ fontSize: 13, color: 'var(--stone)' }}>Loading products and site slots…</p>
                ) : (
                  <>
                    <div className="form-label">Add to a product (as gallery image)</div>
                    <input
                      style={{ ...inp, width: '100%', marginBottom: 6 }}
                      placeholder="Search products by name or SKU…"
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                    />
                    {productSearch.trim() && (
                      <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--light-line)', borderRadius: 4, marginBottom: 10 }}>
                        {targets.products
                          .filter(p => `${p.name} ${p.sku ?? ''}`.toLowerCase().includes(productSearch.trim().toLowerCase()))
                          .slice(0, 20)
                          .map(p => (
                            <button
                              key={p.id}
                              disabled={busy}
                              onClick={() => assign({ type: 'product', productId: p.id })}
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 13, background: 'none', border: 'none', borderBottom: '1px solid var(--light-line)', cursor: 'pointer' }}
                            >
                              {p.name}{p.sku ? <span style={{ color: 'var(--stone)' }}> · {p.sku}</span> : null}
                            </button>
                          ))}
                        {targets.products.filter(p => `${p.name} ${p.sku ?? ''}`.toLowerCase().includes(productSearch.trim().toLowerCase())).length === 0 && (
                          <div style={{ padding: '7px 10px', fontSize: 13, color: 'var(--stone)' }}>No products match.</div>
                        )}
                      </div>
                    )}
                    <div className="form-label" style={{ marginTop: 4 }}>Use as a site image</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select style={{ ...inp, flex: 1 }} value={heroChoice} onChange={e => setHeroChoice(e.target.value)}>
                        <option value="">Choose a slot…</option>
                        {targets.heroSlots.map(s => (
                          <option key={s.key} value={s.key}>{s.label}{s.currentUrl ? ' (replaces current)' : ' (empty)'}</option>
                        ))}
                      </select>
                      <button className="btn btn-secondary btn-sm" disabled={busy || !heroChoice} onClick={() => assign({ type: 'site_setting', key: heroChoice })}>Apply</button>
                    </div>
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!showTrash && IMAGE_RE.test(selected.name) && (
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => { setEditing(selected); setSelected(null) }}>Edit image</button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => copyUrl(selected)}>Copy URL</button>
              {showTrash ? (
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => trashOrRestore(selected, true)}>Restore</button>
              ) : (
                <button className="btn btn-ghost btn-sm" style={{ color: '#a03030', marginLeft: 'auto' }} disabled={busy} onClick={() => trashOrRestore(selected, false)}>Move to trash</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Editor */}
      {editing && (
        <MediaEditorModal
          bucket={editing.bucket}
          path={editing.path}
          url={editing.url}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); flash('Edited copy saved.'); fetchObjects() }}
        />
      )}
    </>
  )
}
