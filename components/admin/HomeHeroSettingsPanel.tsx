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
  // Typography & layout (July 2026 — full hero control)
  text_align:         'center' | 'left'
  headline_font:      'serif' | 'logo' | 'sans'
  headline_scale:     number
  headline_italic_2:  boolean
  headline_colour:    string
  subtitle_size:      number
  subtitle_colour:    string
}

const FONT_OPTIONS = [
  { value: 'serif', label: 'Serif — Cormorant Garamond (default)', css: "'Cormorant Garamond', Georgia, serif" },
  { value: 'logo',  label: 'Logo — Brown Sugar',                   css: "'Brown Sugar', 'Cormorant Garamond', serif" },
  { value: 'sans',  label: 'Sans — DM Sans',                       css: "'DM Sans', sans-serif" },
] as const

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
  text_align:         'center',
  headline_font:      'serif',
  headline_scale:     1,
  headline_italic_2:  true,
  headline_colour:    '',
  subtitle_size:      16,
  subtitle_colour:    '',
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

      {/* ── Typography & layout (full hero control) ── */}
      <div style={{ marginBottom: 28, border: '1px solid var(--light-line)', padding: '16px 20px', background: '#fff' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 14 }}>
          Typography &amp; layout
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label className="form-label">Text alignment</label>
            <select className="form-select" value={settings.text_align} onChange={e => set('text_align', e.target.value as 'center' | 'left')}>
              <option value="center">Centred (default)</option>
              <option value="left">Left-aligned</option>
            </select>
          </div>
          <div>
            <label className="form-label">Headline font</label>
            <select className="form-select" value={settings.headline_font} onChange={e => set('headline_font', e.target.value as HomeHeroSettings['headline_font'])}>
              {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label">
            Headline size — <span style={{ fontWeight: 600, color: 'var(--forest)' }}>{Math.round(settings.headline_scale * 100)}%</span>
            <span style={{ fontWeight: 400, color: 'var(--stone)' }}> (≈{Math.round(88 * settings.headline_scale)}px on desktop)</span>
          </label>
          <input
            type="range" min={0.6} max={1.4} step={0.05}
            value={settings.headline_scale}
            onChange={e => set('headline_scale', parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--forest)' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label className="form-label">Headline colour</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color"
                value={settings.headline_colour || '#F7F3EE'}
                onChange={e => set('headline_colour', e.target.value)}
                aria-label="Headline colour"
                style={{ width: 44, height: 32, padding: 2, border: '1px solid var(--light-line)', background: '#fff', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 12, color: 'var(--stone)' }}>{settings.headline_colour || 'Theme cream (default)'}</span>
              {settings.headline_colour && (
                <button className="btn btn-ghost btn-sm" onClick={() => set('headline_colour', '')}>Reset</button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
            <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={settings.headline_italic_2} onChange={e => set('headline_italic_2', e.target.checked)} />
              Render line 2 in italic
            </label>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label className="form-label">
              Subtitle size — <span style={{ fontWeight: 600, color: 'var(--forest)' }}>{settings.subtitle_size}px</span>
            </label>
            <input
              type="range" min={13} max={22} step={1}
              value={settings.subtitle_size}
              onChange={e => set('subtitle_size', parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: 'var(--forest)' }}
            />
          </div>
          <div>
            <label className="form-label">Subtitle colour</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color"
                value={settings.subtitle_colour || '#D9D4CB'}
                onChange={e => set('subtitle_colour', e.target.value)}
                aria-label="Subtitle colour"
                style={{ width: 44, height: 32, padding: 2, border: '1px solid var(--light-line)', background: '#fff', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 12, color: 'var(--stone)' }}>{settings.subtitle_colour || 'Theme default'}</span>
              {settings.subtitle_colour && (
                <button className="btn btn-ghost btn-sm" onClick={() => set('subtitle_colour', '')}>Reset</button>
              )}
            </div>
          </div>
        </div>

        {/* Live preview — same maths as the homepage, scaled down */}
        <div>
          <label className="form-label">Preview</label>
          <div style={{
            background: 'linear-gradient(to top, rgba(26,43,24,0.92), rgba(26,43,24,0.55))',
            padding: '28px 24px',
            textAlign: settings.text_align,
          }}>
            <div style={{
              fontFamily: FONT_OPTIONS.find(f => f.value === settings.headline_font)?.css,
              fontSize: Math.round(48 * settings.headline_scale),
              fontWeight: 300, lineHeight: 1.06, letterSpacing: '-0.01em',
              color: settings.headline_colour || '#F7F3EE',
            }}>
              {settings.headline_1 || 'Global Craft.'}<br />
              {settings.headline_italic_2
                ? <em>{settings.headline_2 || 'Delivered'}</em>
                : <span>{settings.headline_2 || 'Delivered'}</span>}<br />
              {settings.headline_3 || 'Precisely.'}
            </div>
            <p style={{
              fontSize: Math.max(11, settings.subtitle_size - 3), lineHeight: 1.7, maxWidth: 420, marginTop: 14,
              marginLeft: settings.text_align === 'center' ? 'auto' : 0,
              marginRight: settings.text_align === 'center' ? 'auto' : 0,
              color: settings.subtitle_colour || 'rgba(247,243,238,0.70)',
            }}>
              {settings.subtitle || DEFAULTS.subtitle}
            </p>
          </div>
          <p style={{ fontSize: 11, color: 'var(--stone)', marginTop: 6 }}>
            Scaled-down preview — exact sizes respond to screen width on the live page.
          </p>
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
