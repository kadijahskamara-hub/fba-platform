'use client'

import { useState, useRef } from 'react'
import MediaPickerDialog from '@/components/admin/media/MediaPickerDialog'
import type { MediaLibraryFile } from '@/lib/mediaShared'

interface HeroSetting {
  url: string
  alt: string
}

interface Props {
  pageKey:     string
  label:       string
  initialValue: HeroSetting
}

export function HeroImageUploader({ pageKey, label, initialValue }: Props) {
  const [current,   setCurrent]   = useState<HeroSetting>(initialValue)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [saved,     setSaved]     = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Media Library picker (Phase 2): choose an existing image instead
  // of uploading a new one. The assign API validates the slot key.
  async function chooseFromLibrary(files: MediaLibraryFile[]) {
    const file = files[0]
    if (!file) return
    setUploading(true); setError(null); setSaved(false)
    try {
      const res = await fetch('/api/admin/media/assign', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ bucket: file.bucket, path: file.path, target: { type: 'site_setting', key: pageKey } }),
      }).then(r => r.json())
      if (!res.success) throw new Error(res.error ?? 'Could not assign the image')
      setCurrent(prev => ({ ...prev, url: file.url }))
      setSaved(true)
      setPickerOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setUploading(false)
    }
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Image must be under 8 MB.')
      return
    }

    setUploading(true)
    setError(null)
    setSaved(false)

    try {
      // Upload to Supabase Storage via multipart form
      const form = new FormData()
      form.append('file', file)
      form.append('bucket', 'site-assets')
      form.append('path', `hero/${pageKey}-${Date.now()}.${file.name.split('.').pop()}`)

      const uploadRes = await fetch('/api/admin/upload-asset', { method: 'POST', body: form })
      if (!uploadRes.ok) {
        const { error: msg } = await uploadRes.json()
        throw new Error(msg ?? 'Upload failed')
      }
      const { url } = await uploadRes.json()

      // Save URL to site_settings
      const settingRes = await fetch('/api/admin/site-settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key: pageKey, value: { url, alt: current.alt } }),
      })
      if (!settingRes.ok) throw new Error('Failed to save setting')

      setCurrent(prev => ({ ...prev, url }))
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    setUploading(true)
    setError(null)
    try {
      await fetch('/api/admin/site-settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key: pageKey, value: { url: '', alt: current.alt } }),
      })
      setCurrent(prev => ({ ...prev, url: '' }))
      setSaved(false)
    } catch {
      setError('Failed to remove image')
    } finally {
      setUploading(false)
    }
  }

  async function handleAltChange(alt: string) {
    setCurrent(prev => ({ ...prev, alt }))
    // Debounce is intentionally skipped — saved on blur
  }

  async function saveAlt() {
    try {
      await fetch('/api/admin/site-settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key: pageKey, value: { url: current.url, alt: current.alt } }),
      })
    } catch { /* non-critical */ }
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--forest)', marginBottom: 16 }}>
        {label}
      </h3>

      {/* Preview */}
      <div style={{
        width:           '100%',
        height:          200,
        background:      current.url
          ? `linear-gradient(rgba(20,38,22,0.6), rgba(20,38,22,0.6)), url(${current.url}) center/cover`
          : 'var(--forest)',
        borderRadius:    4,
        marginBottom:    16,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        position:        'relative',
        overflow:        'hidden',
      }}>
        {!current.url && (
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No hero image set — flat colour will be used</p>
        )}
        {current.url && (
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Preview (with tint overlay)</p>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          onClick={() => setPickerOpen(true)}
          disabled={uploading}
          className="btn btn-primary btn-sm"
        >
          Choose from library
        </button>

        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="btn btn-secondary btn-sm"
        >
          {uploading ? 'Uploading…' : current.url ? 'Replace by upload' : 'Upload image'}
        </button>

        {current.url && (
          <button
            onClick={handleRemove}
            disabled={uploading}
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--caramel)' }}
          >
            Remove
          </button>
        )}

        {saved && (
          <span style={{ fontSize: 12, color: 'var(--forest)', display: 'flex', alignItems: 'center', gap: 4 }}>
            ✓ Saved
          </span>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />

      {pickerOpen && (
        <MediaPickerDialog
          startBucket="site-assets"
          onClose={() => setPickerOpen(false)}
          onSelect={chooseFromLibrary}
        />
      )}

      {/* Alt text */}
      <div>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--stone)', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Alt text (for accessibility)
        </label>
        <input
          type="text"
          value={current.alt}
          onChange={e => handleAltChange(e.target.value)}
          onBlur={saveAlt}
          placeholder="Describe the image…"
          style={{ width: '100%', maxWidth: 400, padding: '7px 10px', fontSize: 13, border: '1px solid var(--light-line)', borderRadius: 2 }}
        />
      </div>

      {/* Guidance */}
      <p style={{ fontSize: 11, color: 'var(--stone)', marginTop: 8, lineHeight: 1.5 }}>
        Recommended: landscape image, min 1600×600px. A dark green tint is applied automatically.
        Formats: JPG, PNG, WebP. Max 8 MB.
      </p>

      {error && (
        <p style={{ fontSize: 12, color: '#c0392b', marginTop: 8 }}>{error}</p>
      )}
    </div>
  )
}
