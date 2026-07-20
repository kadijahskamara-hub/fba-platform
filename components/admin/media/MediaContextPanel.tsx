'use client'

// Right-hand context panel (Phase 2). No file selected → folder
// info + actions (Create New Folder, Upload here) + collaborator
// note. File selected → preview, metadata, used-in links, assign
// to product / site slot, Edit / Copy URL / Move / Trash-Restore.

import { useCallback, useEffect, useState } from 'react'
import { appConfirm } from '@/lib/appConfirm'
import { formatBytes, parentFolder, type MediaLibraryFile } from '@/lib/mediaShared'
import type { MediaView } from './MediaLibrary'

const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif)$/i

type Targets = {
  products: Array<{ id: string; name: string; sku?: string | null }>
  heroSlots: Array<{ key: string; label: string; currentUrl: string }>
}

type Props = {
  mode: 'page' | 'picker'
  view: MediaView
  bucket: string
  folder: string
  file: MediaLibraryFile | null
  fileCount: number
  folderCount: number
  onEdit: (f: MediaLibraryFile) => void
  onChanged: () => void
  onNewFolder: () => void
  onUploadHere: () => void
  flash: (msg: string) => void
}

export default function MediaContextPanel({
  mode, view, bucket, folder, file, fileCount, folderCount,
  onEdit, onChanged, onNewFolder, onUploadHere, flash,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [targets, setTargets] = useState<Targets | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [heroChoice, setHeroChoice] = useState('')
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveFolders, setMoveFolders] = useState<string[] | null>(null)

  // Assign targets — lazy, page mode only.
  const loadTargets = useCallback(async () => {
    if (targets || mode !== 'page') return
    const res = await fetch('/api/admin/media/assign').then(r => r.json()).catch(() => null)
    if (res?.success) setTargets(res.data)
  }, [targets, mode])
  useEffect(() => { if (file) loadTargets() }, [file, loadTargets])
  useEffect(() => { setProductSearch(''); setHeroChoice(''); setMoveOpen(false) }, [file?.path])

  const label: React.CSSProperties = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 8 }
  const inp: React.CSSProperties = { width: '100%', border: '1px solid var(--light-line)', borderRadius: 4, padding: '7px 9px', fontSize: 13, background: 'var(--warm-white)' }

  // ---------- empty state ----------
  if (!file) {
    return (
      <div style={{ padding: 18, background: 'var(--warm-white)' }}>
        <div style={{ textAlign: 'center', padding: '26px 0 18px' }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--caramel)" strokeWidth="1.1" style={{ opacity: 0.8 }}>
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
            <circle cx="12" cy="13" r="2.4" />
            <path d="m8 17 2.2-2.2a1 1 0 0 1 1.4 0L14 17" />
          </svg>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--forest)', marginBottom: 4 }}>
          {view === 'recents' ? 'Recent uploads' : view === 'trash' ? 'Trash' : folder ? folder.split('/').pop() : bucket}
        </div>
        <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 18 }}>
          {fileCount} file{fileCount !== 1 ? 's' : ''}{view === 'browse' ? ` · ${folderCount} folder${folderCount !== 1 ? 's' : ''}` : ''}
        </p>

        {view === 'browse' && (
          <>
            <div style={label}>Actions</div>
            <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginBottom: 8 }} onClick={onNewFolder}>Create New Folder</button>
            <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginBottom: 18 }} onClick={onUploadHere}>Upload here</button>
          </>
        )}

        <div style={label}>Information</div>
        <p style={{ fontSize: 12, color: 'var(--stone)', lineHeight: 1.5 }}>
          {view === 'trash'
            ? 'Trashed files still count toward storage. Select one to restore it.'
            : 'Organise site files and folders added by you and other staff. Select a file to see where it is used and assign it to products or site pages.'}
        </p>
      </div>
    )
  }

  // ---------- file selected ----------
  const inTrash = file.path.startsWith('trash/')

  const trashOrRestore = async (restore: boolean) => {
    if (!restore) {
      const q = file.usedIn.length > 0
        ? `This image is used in ${file.usedIn.length} place${file.usedIn.length > 1 ? 's' : ''} — moving it to the trash will break those references. Continue?`
        : 'Move this file to the trash? You can restore it later.'
      if (!await appConfirm(q)) return
    }
    setBusy(true)
    const res = await fetch('/api/admin/media/trash', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket: file.bucket, path: file.path, restore }),
    }).then(r => r.json()).catch(() => ({ success: false }))
    setBusy(false)
    if (!res.success) { alert(res.error ?? 'Operation failed'); return }
    flash(restore ? 'File restored.' : 'Moved to trash.')
    onChanged()
  }

  const assign = async (target: { type: 'product'; productId: string } | { type: 'site_setting'; key: string }) => {
    setBusy(true)
    const res = await fetch('/api/admin/media/assign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket: file.bucket, path: file.path, target }),
    }).then(r => r.json()).catch(() => ({ success: false, error: 'Network error' }))
    setBusy(false)
    if (!res.success) { alert(res.error ?? 'Assignment failed'); return }
    setTargets(null)
    flash(`Image assigned to ${res.data.assigned}.`)
    onChanged()
  }

  const openMove = async () => {
    setMoveOpen(v => !v)
    if (moveFolders) return
    const res = await fetch(`/api/admin/media?bucket=${encodeURIComponent(file.bucket)}`).then(r => r.json()).catch(() => null)
    if (res?.success) setMoveFolders(res.folders ?? [])
  }

  const moveTo = async (toFolder: string) => {
    setBusy(true)
    const res = await fetch('/api/admin/media/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket: file.bucket, path: file.path, toFolder }),
    }).then(r => r.json()).catch(() => ({ success: false, error: 'Network error' }))
    setBusy(false)
    if (!res.success) { alert(res.error ?? 'Move failed'); return }
    flash(`Moved to ${toFolder || 'the bucket root'}.`)
    onChanged()
  }

  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(file.url); flash('URL copied.') } catch { /* ignore */ }
  }

  const currentFolder = parentFolder(file.path)
  const filteredProducts = targets
    ? targets.products.filter(p => `${p.name} ${p.sku ?? ''}`.toLowerCase().includes(productSearch.trim().toLowerCase())).slice(0, 12)
    : []

  return (
    <div style={{ padding: 18, background: 'var(--warm-white)', overflowY: 'auto' }}>
      {IMAGE_RE.test(file.name) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt="" style={{ width: '100%', maxHeight: 170, objectFit: 'contain', background: 'var(--cream)', borderRadius: 4, marginBottom: 12 }} />
      )}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--forest)', wordBreak: 'break-all', marginBottom: 4 }}>{file.name}</div>
      <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 12 }}>
        {file.bucket}/{currentFolder || '(root)'} · {formatBytes(file.size)}
        {file.updatedAt ? ` · ${new Date(file.updatedAt).toLocaleDateString('en-GB')}` : ''}
      </p>

      <div style={label}>Used in ({file.usedIn.length})</div>
      {file.usedIn.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 12 }}>Not referenced anywhere yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          {file.usedIn.map((u, i) => (
            <a key={i} href={u.href} style={{ fontSize: 12, padding: '5px 8px', background: 'var(--cream)', borderRadius: 4, textDecoration: 'none', color: 'var(--forest)' }}>
              {u.label} →
            </a>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={label}>Actions</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {!inTrash && IMAGE_RE.test(file.name) && (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onEdit(file)}>Edit image</button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={copyUrl}>Copy URL</button>
        {!inTrash && (
          <button className="btn btn-secondary btn-sm" disabled={busy || file.usedIn.length > 0} onClick={openMove}
            title={file.usedIn.length > 0 ? 'Files in use cannot be moved — it would break their references.' : undefined}>
            Move to folder…
          </button>
        )}
        {moveOpen && !inTrash && (
          <div style={{ border: '1px solid var(--light-line)', borderRadius: 4, padding: 8 }}>
            {!moveFolders ? (
              <p style={{ fontSize: 12, color: 'var(--stone)' }}>Loading folders…</p>
            ) : (
              <>
                {currentFolder !== '' && (
                  <button className="btn btn-ghost btn-sm" style={{ width: '100%', textAlign: 'left' }} disabled={busy} onClick={() => moveTo('')}>(bucket root)</button>
                )}
                {moveFolders.filter(f => f !== currentFolder).map(f => (
                  <button key={f} className="btn btn-ghost btn-sm" style={{ width: '100%', textAlign: 'left' }} disabled={busy} onClick={() => moveTo(f)}>{f}</button>
                ))}
                {moveFolders.length === 0 && <p style={{ fontSize: 12, color: 'var(--stone)' }}>No folders yet — create one from the toolbar.</p>}
              </>
            )}
          </div>
        )}
        {inTrash ? (
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => trashOrRestore(true)}>Restore</button>
        ) : (
          <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} disabled={busy} onClick={() => trashOrRestore(false)}>Move to trash</button>
        )}
      </div>

      {/* Assign — page mode only (pickers hand the file back instead) */}
      {mode === 'page' && !inTrash && IMAGE_RE.test(file.name) && (
        <>
          <div style={label}>Assign this image</div>
          {!targets ? (
            <p style={{ fontSize: 12, color: 'var(--stone)' }}>Loading products and site slots…</p>
          ) : (
            <>
              <div className="form-label">Add to a product</div>
              <input style={{ ...inp, marginBottom: 6 }} placeholder="Search products by name or SKU…" value={productSearch} onChange={e => setProductSearch(e.target.value)} />
              {productSearch.trim() && (
                <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--light-line)', borderRadius: 4, marginBottom: 10 }}>
                  {filteredProducts.map(p => (
                    <button key={p.id} disabled={busy} onClick={() => assign({ type: 'product', productId: p.id })}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 9px', fontSize: 12, background: 'none', border: 'none', borderBottom: '1px solid var(--light-line)', cursor: 'pointer', color: 'var(--forest)' }}>
                      {p.name}{p.sku ? <span style={{ color: 'var(--stone)' }}> · {p.sku}</span> : null}
                    </button>
                  ))}
                  {filteredProducts.length === 0 && <div style={{ padding: '6px 9px', fontSize: 12, color: 'var(--stone)' }}>No products match.</div>}
                </div>
              )}
              <div className="form-label">Use as a site image</div>
              <div style={{ display: 'flex', gap: 6 }}>
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
        </>
      )}
    </div>
  )
}
