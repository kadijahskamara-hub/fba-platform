'use client'

// ============================================================
// Media Library shell (Phase 2 rebuild — Wix "Choose media files"
// inspired, FBA design fundamentals).
//
// Three panes: sidebar (upload, Home/recents, buckets & folders,
// trash, storage bar) · content (search, breadcrumb, toolbar,
// gallery/list) · context panel (folder info or file details with
// assign/edit/move/trash actions).
//
// Two modes from one component:
//   mode="page"    → /admin/media
//   mode="picker"  → inside MediaPickerDialog, multi-select +
//                    Add Media handled by the dialog footer.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import MediaSidebar from './MediaSidebar'
import MediaGrid from './MediaGrid'
import MediaList from './MediaList'
import MediaContextPanel from './MediaContextPanel'
import MediaEditorModal from '@/components/admin/MediaEditorModal'
import {
  MEDIA_SORTS, MEDIA_TYPE_FILTERS,
  type MediaLibraryFile, type MediaSortKey, type MediaTypeFilter, type MediaUsedFilter,
} from '@/lib/mediaShared'

export type MediaView = 'recents' | 'browse' | 'trash'
export type MediaLayout = 'gallery' | 'list'

const LAYOUT_STORE = 'fba-media-layout'

type Props = {
  mode: 'page' | 'picker'
  pickMultiple?: boolean
  selection?: MediaLibraryFile[]
  onSelectionChange?: (files: MediaLibraryFile[]) => void
  startBucket?: string
  startFolder?: string
}

export default function MediaLibrary({
  mode, pickMultiple = false, selection = [], onSelectionChange,
  startBucket, startFolder,
}: Props) {
  const [view, setView] = useState<MediaView>('browse')
  const [bucket, setBucket] = useState(startBucket ?? 'product-media')
  const [buckets, setBuckets] = useState<string[]>(['product-media', 'site-assets'])
  const [folder, setFolder] = useState(startFolder ?? '')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<MediaSortKey>('newest')
  const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>('')
  const [usedFilter, setUsedFilter] = useState<MediaUsedFilter>('')
  const [layout, setLayoutState] = useState<MediaLayout>('gallery')
  const [files, setFiles] = useState<MediaLibraryFile[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<{ usedBytes: number; capMb: number } | null>(null)
  const [active, setActive] = useState<MediaLibraryFile | null>(null)   // context-panel file
  const [editing, setEditing] = useState<MediaLibraryFile | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [openMenu, setOpenMenu] = useState<'' | 'filter' | 'sort' | 'layout' | 'newfolder'>('')
  const [newFolderName, setNewFolderName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const statsWanted = useRef(true)

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(LAYOUT_STORE) : null
    if (saved === 'list' || saved === 'gallery') setLayoutState(saved)
  }, [])
  const setLayout = (l: MediaLayout) => {
    setLayoutState(l)
    try { window.localStorage.setItem(LAYOUT_STORE, l) } catch { /* ignore */ }
  }

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 3500) }

  const fetchListing = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (view === 'recents') params.set('view', 'recents')
    else {
      params.set('bucket', bucket)
      if (view === 'trash') params.set('trash', '1')
      else if (search.trim()) params.set('search', search.trim())
      else if (folder) params.set('folder', folder)
    }
    if (sort !== 'newest') params.set('sort', sort)
    if (typeFilter) params.set('type', typeFilter)
    if (usedFilter) params.set('used', usedFilter)
    if (statsWanted.current) params.set('stats', '1')
    const res = await fetch(`/api/admin/media?${params}`).then(r => r.json()).catch(() => null)
    if (res?.success) {
      setFiles(res.data)
      setFolders(res.folders ?? [])
      if (Array.isArray(res.buckets)) setBuckets(res.buckets)
      if (res.stats) { setStats(res.stats); statsWanted.current = false }
    }
    setLoading(false)
  }, [view, bucket, folder, search, sort, typeFilter, usedFilter])

  useEffect(() => { fetchListing() }, [fetchListing])

  const refreshWithStats = useCallback(() => {
    statsWanted.current = true
    fetchListing()
  }, [fetchListing])

  // ---------- navigation ----------
  const goBucket = (b: string) => { setBucket(b); setFolder(''); setView('browse'); setSearch(''); setActive(null) }
  const goFolder = (f: string) => { setFolder(f); setView('browse'); setSearch(''); setActive(null) }
  const goView = (v: MediaView) => { setView(v); setActive(null); if (v !== 'browse') setSearch('') }

  // ---------- selection ----------
  const keyOf = (f: MediaLibraryFile) => `${f.bucket}/${f.path}`
  const isPicked = (f: MediaLibraryFile) => selection.some(s => keyOf(s) === keyOf(f))
  const handleFileClick = (f: MediaLibraryFile) => {
    setActive(f)
    if (mode !== 'picker' || !onSelectionChange) return
    if (isPicked(f)) onSelectionChange(selection.filter(s => keyOf(s) !== keyOf(f)))
    else onSelectionChange(pickMultiple ? [...selection, f] : [f])
  }

  // ---------- actions ----------
  const doUpload = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    setUploading(true)
    let ok = 0
    let lastUploaded: MediaLibraryFile | null = null
    for (const file of Array.from(list)) {
      const form = new FormData()
      form.append('file', file)
      form.append('bucket', view === 'recents' ? 'site-assets' : bucket)
      if (view === 'browse' && folder) form.append('folder', folder)
      const res = await fetch('/api/admin/media/upload', { method: 'POST', body: form })
        .then(r => r.json()).catch(() => ({ success: false, error: 'Network error' }))
      if (res.success) {
        ok++
        lastUploaded = { ...res.data, name: res.data.path.split('/').pop(), size: res.data.bytes, updatedAt: new Date().toISOString(), mimetype: file.type, usedIn: [] }
      } else alert(`${file.name}: ${res.error ?? 'Upload failed'}`)
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (ok > 0) {
      flash(`${ok} image${ok > 1 ? 's' : ''} uploaded.`)
      // Uploading mid-pick selects the newest file automatically.
      if (mode === 'picker' && onSelectionChange && lastUploaded) {
        onSelectionChange(pickMultiple ? [...selection, lastUploaded] : [lastUploaded])
        setActive(lastUploaded)
      }
      refreshWithStats()
    }
  }

  const createFolder = async () => {
    const name = newFolderName.trim().toLowerCase()
    if (!name) return
    const res = await fetch('/api/admin/media/folder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket, parent: folder, name }),
    }).then(r => r.json()).catch(() => ({ success: false, error: 'Network error' }))
    if (!res.success) { alert(res.error ?? 'Could not create the folder'); return }
    setNewFolderName(''); setOpenMenu('')
    flash(`Folder “${name}” created.`)
    fetchListing()
  }

  const crumbs = folder ? folder.split('/') : []
  const heading =
    view === 'recents' ? 'Recent uploads' :
    view === 'trash' ? 'Trash' :
    search.trim() ? `Search in ${bucket}` : bucket

  const menuBtn = (activeBtn: boolean): React.CSSProperties => ({
    background: activeBtn ? 'var(--cream)' : 'none', border: '1px solid ' + (activeBtn ? 'var(--caramel)' : 'transparent'),
    borderRadius: 4, padding: '6px 9px', cursor: 'pointer', fontSize: 13, color: 'var(--forest)',
  })
  const pop: React.CSSProperties = {
    position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 30,
    background: 'var(--warm-white)', border: '1px solid var(--light-line)', borderRadius: 6,
    boxShadow: '0 8px 24px rgba(26,43,24,0.12)', minWidth: 180, padding: 6,
  }
  const popItem = (sel: boolean): React.CSSProperties => ({
    display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 13,
    background: sel ? 'var(--cream)' : 'none', border: 'none', borderRadius: 4, cursor: 'pointer',
    color: 'var(--forest)', fontWeight: sel ? 600 : 400,
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 280px', gap: 0, minHeight: mode === 'picker' ? 520 : '70vh', background: 'var(--warm-white)', border: '1px solid var(--light-line)' }}>
      <MediaSidebar
        view={view} bucket={bucket} buckets={buckets} stats={stats}
        uploading={uploading}
        onUploadClick={() => fileInputRef.current?.click()}
        onHome={() => goView('recents')}
        onBucket={goBucket}
        onTrash={() => goView('trash')}
      />
      <input
        ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        multiple style={{ display: 'none' }} onChange={e => doUpload(e.target.files)}
      />

      {/* Content pane */}
      <div style={{ padding: '18px 20px', borderRight: '1px solid var(--light-line)', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <input
          type="search" className="form-input"
          placeholder="Search for Product, Hero images, Promo & more…"
          value={search}
          onChange={e => { setSearch(e.target.value); if (view !== 'browse') setView('browse') }}
          style={{ width: '100%', marginBottom: 14 }}
        />

        {notice && <div style={{ background: '#eef6ee', color: '#155724', padding: '7px 11px', borderRadius: 4, fontSize: 13, marginBottom: 10 }}>{notice}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--forest)', minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => goFolder('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, color: 'var(--forest)', padding: 0 }}>
              {heading}
            </button>
            {view === 'browse' && !search.trim() && crumbs.map((seg, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--stone)' }}>/</span>
                <button
                  onClick={() => goFolder(crumbs.slice(0, i + 1).join('/'))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: i === crumbs.length - 1 ? 'var(--forest)' : 'var(--caramel)', padding: 0 }}
                >
                  {seg}
                </button>
              </span>
            ))}
          </div>

          {/* Toolbar */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, position: 'relative' }}>
            {view === 'browse' && !search.trim() && (
              <div style={{ position: 'relative' }}>
                <button title="New folder" style={menuBtn(openMenu === 'newfolder')} onClick={() => setOpenMenu(openMenu === 'newfolder' ? '' : 'newfolder')}>＋⛁</button>
                {openMenu === 'newfolder' && (
                  <div style={pop}>
                    <div className="form-label">New folder in {folder || bucket}</div>
                    <input
                      className="form-input" autoFocus placeholder="e.g. lounge-chairs" value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') createFolder() }}
                      style={{ width: '100%', marginBottom: 8 }}
                    />
                    <button className="btn btn-primary btn-sm" onClick={createFolder} disabled={!newFolderName.trim()}>Create</button>
                  </div>
                )}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <button title="Filter" style={menuBtn(openMenu === 'filter' || !!typeFilter || !!usedFilter)} onClick={() => setOpenMenu(openMenu === 'filter' ? '' : 'filter')}>⚟</button>
              {openMenu === 'filter' && (
                <div style={pop}>
                  <div className="form-label">File type</div>
                  {MEDIA_TYPE_FILTERS.map(t => (
                    <button key={t.key} style={popItem(typeFilter === t.key)} onClick={() => { setTypeFilter(t.key); setOpenMenu('') }}>{t.label}</button>
                  ))}
                  <div className="form-label" style={{ marginTop: 8 }}>Usage</div>
                  {([['', 'All files'], ['used', 'Used on the site'], ['unused', 'Not used anywhere']] as const).map(([k, l]) => (
                    <button key={k} style={popItem(usedFilter === k)} onClick={() => { setUsedFilter(k); setOpenMenu('') }}>{l}</button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button title="Sort" style={menuBtn(openMenu === 'sort')} onClick={() => setOpenMenu(openMenu === 'sort' ? '' : 'sort')}>⇅</button>
              {openMenu === 'sort' && (
                <div style={pop}>
                  <div className="form-label">Sort by</div>
                  {MEDIA_SORTS.map(s => (
                    <button key={s.key} style={popItem(sort === s.key)} onClick={() => { setSort(s.key); setOpenMenu('') }}>{s.label}</button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button title="Change layout" style={menuBtn(openMenu === 'layout')} onClick={() => setOpenMenu(openMenu === 'layout' ? '' : 'layout')}>▦</button>
              {openMenu === 'layout' && (
                <div style={pop}>
                  <div className="form-label">Layout</div>
                  <button style={popItem(layout === 'gallery')} onClick={() => { setLayout('gallery'); setOpenMenu('') }}>▦ Gallery</button>
                  <button style={popItem(layout === 'list')} onClick={() => { setLayout('list'); setOpenMenu('') }}>☰ List</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Listing */}
        <div style={{ flex: 1, overflowY: 'auto' }} onClick={() => { if (openMenu) setOpenMenu('') }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--stone)', fontSize: 14 }}>Loading media…</div>
          ) : layout === 'list' ? (
            <MediaList
              files={files} folders={view === 'browse' && !search.trim() ? folders : []}
              activePath={active ? keyOf(active) : null}
              picked={mode === 'picker' ? selection.map(keyOf) : []}
              onFolder={f => goFolder(folder ? `${folder}/${f}` : f)}
              onFile={handleFileClick}
            />
          ) : (
            <MediaGrid
              files={files} folders={view === 'browse' && !search.trim() ? folders : []}
              activePath={active ? keyOf(active) : null}
              picked={mode === 'picker' ? selection.map(keyOf) : []}
              onFolder={f => goFolder(folder ? `${folder}/${f}` : f)}
              onFile={handleFileClick}
            />
          )}
          {!loading && files.length === 0 && (view !== 'browse' || search.trim() || folders.length === 0) && (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--stone)', fontSize: 14 }}>
              {view === 'trash' ? 'The trash is empty.' : search.trim() ? 'Nothing matches your search.' : 'No files here yet — upload some images.'}
            </div>
          )}
        </div>
      </div>

      <MediaContextPanel
        mode={mode}
        view={view}
        bucket={bucket}
        folder={folder}
        file={active}
        fileCount={files.length}
        folderCount={folders.length}
        onEdit={f => setEditing(f)}
        onChanged={() => { setActive(null); refreshWithStats() }}
        onNewFolder={() => setOpenMenu('newfolder')}
        onUploadHere={() => fileInputRef.current?.click()}
        flash={flash}
      />

      {editing && (
        <MediaEditorModal
          bucket={editing.bucket}
          path={editing.path}
          url={editing.url}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); flash('Edited copy saved.'); refreshWithStats() }}
        />
      )}
    </div>
  )
}
