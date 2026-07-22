'use client'

// Artisan / manufacturer media manager (final amendments §2).
// Replaces the pasted-URL fields with direct uploads into the
// artisan-media Storage bucket:
//   · profile image + ordered gallery
//   · drag-and-drop or file picker, multi-file
//   · per-file progress + error states
//   · reorder, replace, remove, set-as-profile
// Legacy externally-hosted URLs keep rendering and can be removed;
// new imagery is always uploaded.

import { useCallback, useRef, useState } from 'react'

interface Props {
  artisanId: string | null   // null = unsaved record (uploads disabled until saved)
  profileImage: string
  galleryImages: string[]
  onChange: (next: { profileImage: string; galleryImages: string[] }) => void
  // Called when an image reference is removed. The parent queues the
  // URL and performs storage cleanup only AFTER the form is saved, so
  // cancelling the form never leaves a dangling DB reference.
  onRemoved?: (url: string) => void
}

interface UploadState { id: string; name: string; progress: number; error: string | null }

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/gif'

function uploadWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<{ success: boolean; data?: { url: string }; error?: string }> {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      try { resolve(JSON.parse(xhr.responseText)) }
      catch { resolve({ success: false, error: 'Unexpected server response.' }) }
    }
    xhr.onerror = () => resolve({ success: false, error: 'Network error — please try again.' })
    const fd = new FormData()
    fd.append('file', file)
    xhr.send(fd)
  })
}

export function ArtisanMediaManager({ artisanId, profileImage, galleryImages, onChange, onRemoved }: Props) {
  const [uploads, setUploads] = useState<UploadState[]>([])
  const [dragOver, setDragOver] = useState(false)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const profileInputRef = useRef<HTMLInputElement>(null)
  const replaceTarget = useRef<'profile' | number>('profile')

  const endpoint = artisanId ? `/api/admin/artisans/${artisanId}/media` : null

  const doUpload = useCallback(async (files: File[], target: 'profile' | 'gallery' | number) => {
    if (!endpoint) return
    for (const file of files) {
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setUploads(u => [...u, { id: uid, name: file.name, progress: 0, error: null }])
      const res = await uploadWithProgress(endpoint, file, pct =>
        setUploads(u => u.map(x => x.id === uid ? { ...x, progress: pct } : x)))
      if (!res.success || !res.data?.url) {
        setUploads(u => u.map(x => x.id === uid ? { ...x, error: res.error ?? 'Upload failed.' } : x))
        continue
      }
      setUploads(u => u.filter(x => x.id !== uid))
      const url = res.data.url
      if (target === 'profile') {
        onChange({ profileImage: url, galleryImages })
      } else if (typeof target === 'number') {
        const next = [...galleryImages]
        next[target] = url
        onChange({ profileImage, galleryImages: next })
      } else {
        onChange({ profileImage: profileImage || url, galleryImages: [...galleryImages, url] })
      }
      // Only the first file can meaningfully target profile/replace.
      if (target !== 'gallery') break
    }
  }, [endpoint, galleryImages, profileImage, onChange])

  const removeUrl = useCallback((url: string, from: 'profile' | number) => {
    if (from === 'profile') onChange({ profileImage: '', galleryImages })
    else onChange({ profileImage, galleryImages: galleryImages.filter((_, i) => i !== from) })
    // Storage cleanup is deferred to the parent (after a successful
    // save) so cancelling never leaves dangling references.
    onRemoved?.(url)
  }, [galleryImages, profileImage, onChange, onRemoved])

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= galleryImages.length) return
    const next = [...galleryImages]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange({ profileImage, galleryImages: next })
  }

  const setAsProfile = (i: number) => {
    onChange({ profileImage: galleryImages[i], galleryImages })
  }

  if (!endpoint) {
    return (
      <div style={{ padding: '14px 16px', background: 'var(--cream, #f7f3ec)', border: '1px dashed var(--light-line)', fontSize: 13, color: 'var(--stone)' }}>
        Save the artisan first — images can then be uploaded directly to this profile.
      </div>
    )
  }

  const thumb: React.CSSProperties = {
    width: 92, height: 92, objectFit: 'cover', display: 'block',
    background: 'var(--sage-light)', border: '1px solid var(--light-line)',
  }
  const iconBtn: React.CSSProperties = {
    fontSize: 10.5, padding: '2px 6px', background: 'var(--warm-white)',
    border: '1px solid var(--light-line)', cursor: 'pointer', borderRadius: 3,
  }

  return (
    <div>
      {/* ── Profile image ── */}
      <div className="form-label">Profile image</div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
        {profileImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profileImage} alt="Profile" style={{ ...thumb, width: 120, height: 120 }} />
        ) : (
          <div style={{ ...thumb, width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--stone)' }}>
            No image
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="button" className="btn btn-secondary btn-sm"
            onClick={() => { replaceTarget.current = 'profile'; profileInputRef.current?.click() }}>
            {profileImage ? 'Replace image' : 'Upload image'}
          </button>
          {profileImage && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#a03030' }}
              onClick={() => removeUrl(profileImage, 'profile')}>
              Remove
            </button>
          )}
        </div>
      </div>
      <input ref={profileInputRef} type="file" accept={ACCEPT} hidden
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) doUpload([f], replaceTarget.current)
          e.target.value = ''
        }} />

      {/* ── Gallery ── */}
      <div className="form-label">Gallery images (ordered — first appears first on the public profile)</div>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          const files = Array.from(e.dataTransfer.files).filter(f => ACCEPT.includes(f.type))
          if (files.length) doUpload(files, 'gallery')
        }}
        style={{
          border: `2px dashed ${dragOver ? 'var(--forest)' : 'var(--light-line)'}`,
          background: dragOver ? 'var(--sage-light)' : 'var(--cream, #f7f3ec)',
          padding: 14, transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {galleryImages.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            {galleryImages.map((url, i) => (
              <figure key={`${url}-${i}`} style={{ margin: 0, width: 92 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Gallery image ${i + 1}`} style={thumb} />
                <figcaption style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
                  <button type="button" style={iconBtn} title="Move earlier" aria-label={`Move image ${i + 1} earlier`}
                    disabled={i === 0} onClick={() => move(i, -1)}>←</button>
                  <button type="button" style={iconBtn} title="Move later" aria-label={`Move image ${i + 1} later`}
                    disabled={i === galleryImages.length - 1} onClick={() => move(i, 1)}>→</button>
                  <button type="button" style={iconBtn} title="Replace this image"
                    onClick={() => { replaceTarget.current = i; profileInputRef.current?.click() }}>⇄</button>
                  <button type="button" style={{ ...iconBtn, color: profileImage === url ? 'var(--caramel)' : undefined }}
                    title="Use as profile image" onClick={() => setAsProfile(i)}>★</button>
                  <button type="button" style={{ ...iconBtn, color: '#a03030' }} title="Remove"
                    onClick={() => removeUrl(url, i)}>✕</button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => galleryInputRef.current?.click()}>
            + Upload images
          </button>
          <span style={{ fontSize: 12, color: 'var(--stone)' }}>or drag &amp; drop here · JPG, PNG, WEBP, AVIF or GIF · max 15&nbsp;MB each</span>
        </div>
        <input ref={galleryInputRef} type="file" accept={ACCEPT} multiple hidden
          onChange={e => {
            const files = Array.from(e.target.files ?? [])
            if (files.length) doUpload(files, 'gallery')
            e.target.value = ''
          }} />

        {/* Active uploads / errors */}
        {uploads.length > 0 && (
          <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
            {uploads.map(u => (
              <div key={u.id} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                {u.error ? (
                  <>
                    <span role="alert" style={{ color: '#a03030' }}>{u.error}</span>
                    <button type="button" style={iconBtn} onClick={() => setUploads(x => x.filter(y => y.id !== u.id))}>Dismiss</button>
                  </>
                ) : (
                  <span style={{ flex: 1, maxWidth: 180, height: 6, background: 'var(--light-line)', borderRadius: 3, overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${u.progress}%`, height: '100%', background: 'var(--forest)', transition: 'width 0.2s' }} />
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--stone)', marginTop: 6 }}>
        Images upload straight to secure FBA storage — no external links needed. Existing externally-hosted
        images keep working and can be replaced one by one.
      </p>
    </div>
  )
}
