'use client'

// ============================================================
// Media Library (Sprint 23) — /admin/media
//
// Browse the public storage buckets with thumbnails, search and
// a usage map (which products / site settings use each image).
// Edit opens the Wix-style crop editor (saves as a new copy).
// Delete = move to trash/ (restorable) — never a hard delete.
// External (Pexels) URLs are imported into storage first.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
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
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

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

  const doImport = async () => {
    if (!importUrl.trim()) return
    setBusy(true)
    const res = await fetch('/api/admin/media/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: importUrl.trim(), bucket }),
    }).then(r => r.json()).catch(() => ({ success: false, error: 'Network error' }))
    setBusy(false)
    if (!res.success) { alert(res.error ?? 'Import failed'); return }
    setShowImport(false); setImportUrl('')
    flash('Image imported to storage — you can edit it now.')
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
          <button className="btn btn-primary btn-sm" onClick={() => setShowImport(true)}>Import from URL</button>
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

      {/* Import modal */}
      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h2 className="h3" style={{ marginBottom: 10 }}>Import image from URL</h2>
            <p style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 12 }}>
              Copies an external image into the <strong>{bucket}</strong> bucket so it can be edited.
              Only <code>images.pexels.com</code> and our own storage are allowed.
            </p>
            <input style={{ ...inp, width: '100%' }} placeholder="https://images.pexels.com/…" value={importUrl} onChange={e => setImportUrl(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn btn-primary btn-sm" disabled={busy || !importUrl.trim()} onClick={doImport}>{busy ? 'Importing…' : 'Import'}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowImport(false)}>Cancel</button>
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
