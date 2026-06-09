'use client'

import { useState, useRef } from 'react'

interface HeroImage {
  url: string
  alt: string
}

interface HomeHeroSettings {
  images:             HeroImage[]
  headline_1:         string
  headline_2:         string
  headline_3:         string
  subtitle:           string
  cta_primary:        string
  cta_primary_href:   string
  cta_secondary:      string
  cta_secondary_href: string
  overlay_opacity:    number
}

interface Props {
  initialValue: Partial<HomeHeroSettings>
}

const DEFAULTS: HomeHeroSettings = {
  images: [{
    url: 'https://images.pexels.com/photos/29649745/pexels-photo-29649745.jpeg?auto=compress&cs=tinysrgb&w=1920',
    alt: 'Full Bloom Artelier — curated interiors',
  }],
  headline_1:         'Global Craft.',
  headline_2:         'Delivered',
  headline_3:         'Precisely.',
  subtitle:           "Full Bloom Artelier connects interior designers, architects, and hospitality developers with the world's finest makers — hand-vetted, technically compliant, and ready for your most demanding projects.",
  cta_primary:        'Request Trade Access',
  cta_primary_href:   '/trade/apply',
  cta_secondary:      'Browse the Edit',
  cta_secondary_href: '/products',
  overlay_opacity:    0.80,
}

export function HomeHeroSettingsPanel({ initialValue }: Props) {
  const merged = { ...DEFAULTS, ...initialValue, images: initialValue.images?.length ? initialValue.images : DEFAULTS.images }
  const [settings, setSettings] = useState<HomeHeroSettings>(merged)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function set<K extends keyof HomeHeroSettings>(key: K, val: HomeHeroSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: val }))
    setSaved(false)
  }

  function setImageField(idx: number, field: keyof HeroImage, val: string) {
    const imgs = [...settings.images]
    imgs[idx] = { ...imgs[idx], [field]: val }
    set('images', imgs)
  }

  function addImage() {
    set('images', [...settings.images, { url: '', alt: '' }])
  }

  function removeImage(idx: number) {
    if (settings.images.length <= 1) return
    set('images', settings.images.filter((_, i) => i !== idx))
  }

  async function uploadFile(idx: number, file: File) {
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('bucket', 'site-assets')
      fd.append('path', `hero/home-${Date.now()}-${file.name}`)
      const res  = await fetch('/api/admin/upload-asset', { method: 'POST', body: fd })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Upload failed')
      setImageField(idx, 'url', json.url)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const res  = await fetch('/api/admin/site-settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key: 'home_hero_settings', value: settings }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 300, marginBottom: 4 }}>
            Homepage Hero
          </h3>
          <p style={{ fontSize: 13, color: 'var(--stone)' }}>
            Control the main homepage hero — image(s), headline, and call-to-action buttons.
          </p>
        </div>
      </div>

      {/* ── Image(s) ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <label className="form-label" style={{ margin: 0 }}>
            Hero Image(s)
          </label>
          <button
            onClick={addImage}
            style={{
              fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase',
              background: 'none', border: '1px solid var(--light-line)',
              padding: '4px 12px', cursor: 'pointer', color: 'var(--forest)',
            }}
          >
            + Add image
          </button>
        </div>

        <div style={{
          background: 'var(--sage-light)',
          border: '1px solid var(--light-line)',
          padding: '10px 14px',
          fontSize: 12, color: 'var(--stone)',
          marginBottom: 12,
          lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--forest)' }}>Slideshow & GIF ready.</strong> Add multiple images to prepare for a future carousel.
          GIF files are supported — upload directly for animated loops.
          Recommended: 1920×1080px minimum, landscape, max 8 MB per file.
        </div>

        {settings.images.map((img, idx) => (
          <div key={idx} style={{
            border: '1px solid var(--light-line)',
            padding: '16px 20px',
            marginBottom: 10,
            background: '#fff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--stone)' }}>
                Image {idx + 1}{idx === 0 ? ' (active)' : ' (queued)'}
              </span>
              {settings.images.length > 1 && (
                <button
                  onClick={() => removeImage(idx)}
                  style={{ fontSize: 12, color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Remove
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">URL (paste Pexels CDN link, Supabase URL, or GIF URL)</label>
                <input
                  className="form-input"
                  value={img.url}
                  onChange={e => setImageField(idx, 'url', e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div>
                <input
                  ref={idx === 0 ? fileRef : undefined}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(idx, f) }}
                />
                <button
                  onClick={() => {
                    const inp = document.createElement('input')
                    inp.type = 'file'
                    inp.accept = 'image/jpeg,image/png,image/webp,image/gif'
                    inp.onchange = (e) => {
                      const f = (e.target as HTMLInputElement).files?.[0]
                      if (f) uploadFile(idx, f)
                    }
                    inp.click()
                  }}
                  disabled={uploading}
                  className="btn btn-secondary btn-sm"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {uploading ? 'Uploading…' : 'Upload file'}
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Alt text (for accessibility)</label>
              <input
                className="form-input"
                value={img.alt}
                onChange={e => setImageField(idx, 'alt', e.target.value)}
                placeholder="Describe the image for screen readers"
              />
            </div>

            {img.url && (
              <div style={{ marginTop: 12 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.alt}
                  style={{ height: 80, width: 'auto', objectFit: 'cover', border: '1px solid var(--light-line)' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Headline ── */}
      <div style={{ marginBottom: 20 }}>
        <label className="form-label">Headline (3 lines)</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <input
            className="form-input"
            value={settings.headline_1}
            onChange={e => set('headline_1', e.target.value)}
            placeholder="Line 1 — e.g. Global Craft."
          />
          <input
            className="form-input"
            value={settings.headline_2}
            onChange={e => set('headline_2', e.target.value)}
            placeholder="Line 2 (italic) — e.g. Delivered"
            style={{ fontStyle: 'italic' }}
          />
          <input
            className="form-input"
            value={settings.headline_3}
            onChange={e => set('headline_3', e.target.value)}
            placeholder="Line 3 — e.g. Precisely."
          />
        </div>
        <p style={{ fontSize: 11, color: 'var(--stone)', marginTop: 6 }}>
          Line 2 renders in italic. Leave blank to use only 2 lines.
        </p>
      </div>

      {/* ── Subtitle ── */}
      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label">Subtitle paragraph</label>
        <textarea
          className="form-input"
          rows={3}
          value={settings.subtitle}
          onChange={e => set('subtitle', e.target.value)}
          style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 14 }}
        />
      </div>

      {/* ── CTAs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
        <div>
          <label className="form-label">Primary button text</label>
          <input className="form-input" value={settings.cta_primary} onChange={e => set('cta_primary', e.target.value)} />
          <label className="form-label" style={{ marginTop: 8 }}>Primary button link</label>
          <input className="form-input" value={settings.cta_primary_href} onChange={e => set('cta_primary_href', e.target.value)} placeholder="/trade/apply" />
        </div>
        <div>
          <label className="form-label">Secondary button text</label>
          <input className="form-input" value={settings.cta_secondary} onChange={e => set('cta_secondary', e.target.value)} />
          <label className="form-label" style={{ marginTop: 8 }}>Secondary button link</label>
          <input className="form-input" value={settings.cta_secondary_href} onChange={e => set('cta_secondary_href', e.target.value)} placeholder="/products" />
        </div>
      </div>

      {/* ── Overlay opacity ── */}
      <div className="form-group" style={{ marginBottom: 28 }}>
        <label className="form-label">
          Hero overlay darkness —{' '}
          <span style={{ fontWeight: 600, color: 'var(--forest)' }}>
            {Math.round(settings.overlay_opacity * 100)}%
          </span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={settings.overlay_opacity}
            onChange={e => set('overlay_opacity', parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--forest)' }}
          />
          <span style={{ fontSize: 11, color: 'var(--stone)', minWidth: 80 }}>
            0% = no tint · 100% = fully dark
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--stone)', marginTop: 6 }}>
          Controls the dark green gradient that overlays the hero image. Lower values show more of the photo. Default: 80%.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">
          {saving ? 'Saving…' : 'Save Homepage Hero'}
        </button>
        {saved && <span style={{ fontSize: 13, color: 'var(--forest)' }}>✓ Saved</span>}
        {error && <span style={{ fontSize: 13, color: '#c0392b' }}>{error}</span>}
      </div>
    </div>
  )
}
