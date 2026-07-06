'use client'

import { useState, useRef } from 'react'

export interface RegionCard {
  label: string
  desc:  string
  url:   string
  alt:   string
  href:  string
}

interface Props {
  initialValue: { cards?: RegionCard[] }
}

const BLANK: RegionCard = { label: '', desc: '', url: '', alt: '', href: '' }

export function NetworkRegionsPanel({ initialValue }: Props) {
  const [cards, setCards]     = useState<RegionCard[]>(
    initialValue?.cards?.length ? initialValue.cards : [{ ...BLANK }]
  )
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const fileRefs = useRef<Array<HTMLInputElement | null>>([])

  function update(idx: number, patch: Partial<RegionCard>) {
    setCards(prev => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
    setSaved(false)
  }

  function move(idx: number, dir: -1 | 1) {
    setCards(prev => {
      const next = [...prev]
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
    setSaved(false)
  }

  function addCard()  { setCards(prev => [...prev, { ...BLANK }]); setSaved(false) }
  function removeCard(idx: number) {
    if (!confirm('Remove this region card?')) return
    setCards(prev => prev.filter((_, i) => i !== idx))
    setSaved(false)
  }

  async function handleFile(idx: number, file: File) {
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return }
    if (file.size > 8 * 1024 * 1024)     { setError('Image must be under 8 MB.'); return }
    setUploadingIdx(idx); setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('bucket', 'site-assets')
      form.append('path', `network/region-${idx}-${Date.now()}.${file.name.split('.').pop()}`)
      const res = await fetch('/api/admin/upload-asset', { method: 'POST', body: form })
      if (!res.ok) { const { error: msg } = await res.json(); throw new Error(msg ?? 'Upload failed') }
      const { url } = await res.json()
      update(idx, { url })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploadingIdx(null)
    }
  }

  async function saveAll() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const cleaned = cards
        .filter(c => c.label.trim() || c.url.trim())
        .map(c => ({
          label: c.label.trim().slice(0, 60),
          desc:  c.desc.trim().slice(0, 80),
          url:   c.url.trim(),
          alt:   (c.alt || c.label).trim().slice(0, 120),
          href:  c.href.trim().slice(0, 200),
        }))
      const res = await fetch('/api/admin/site-settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key: 'network_regions', value: { cards: cleaned } }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="admin-section-title" style={{ marginBottom: 8 }}>Homepage — “Our Network” cards</h2>
      <p style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 24, lineHeight: 1.6, maxWidth: 640 }}>
        The region cards shown in the “A global reach, held to a London standard” section on the homepage.
        Edit the image, region name, sub-caption, and an optional link. Reorder with the arrows, and add or
        remove cards as your network grows. Recommended image: landscape, min 600×400px, JPG/PNG/WebP, max 8 MB.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {cards.map((card, idx) => (
          <div key={idx} style={{
            display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 20,
            padding: 16, border: '1px solid var(--light-line)', borderRadius: 6, background: 'var(--warm-white)',
            alignItems: 'start',
          }}>
            {/* Image + upload */}
            <div>
              <div style={{
                width: '100%', height: 96, borderRadius: 4, marginBottom: 8, overflow: 'hidden',
                background: card.url
                  ? `linear-gradient(rgba(20,38,22,0.35), rgba(20,38,22,0.35)), url(${card.url}) center/cover`
                  : 'var(--sage-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {!card.url && <span style={{ fontSize: 11, color: 'var(--stone)' }}>No image</span>}
              </div>
              <button
                type="button"
                onClick={() => fileRefs.current[idx]?.click()}
                disabled={uploadingIdx === idx}
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', fontSize: 11 }}
              >
                {uploadingIdx === idx ? 'Uploading…' : card.url ? 'Replace image' : 'Upload image'}
              </button>
              <input
                ref={el => { fileRefs.current[idx] = el }}
                type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(idx, f) }}
              />
            </div>

            {/* Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="text" value={card.label} placeholder="Region name (e.g. Southern Europe)"
                onChange={e => update(idx, { label: e.target.value })}
                style={inputStyle}
              />
              <input
                type="text" value={card.desc} placeholder="Sub-caption (e.g. Italy · Portugal · Spain)"
                onChange={e => update(idx, { desc: e.target.value })}
                style={inputStyle}
              />
              <input
                type="text" value={card.href} placeholder="Link (optional, e.g. /products?origin=Italy)"
                onChange={e => update(idx, { href: e.target.value })}
                style={inputStyle}
              />
              <input
                type="text" value={card.alt} placeholder="Image alt text (accessibility)"
                onChange={e => update(idx, { alt: e.target.value })}
                style={{ ...inputStyle, fontSize: 12, color: 'var(--stone)' }}
              />
            </div>

            {/* Card controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0}
                className="btn btn-ghost btn-sm" title="Move up" style={{ padding: '4px 8px' }}>↑</button>
              <button type="button" onClick={() => move(idx, 1)} disabled={idx === cards.length - 1}
                className="btn btn-ghost btn-sm" title="Move down" style={{ padding: '4px 8px' }}>↓</button>
              <button type="button" onClick={() => removeCard(idx)}
                className="btn btn-ghost btn-sm" title="Remove" style={{ padding: '4px 8px', color: 'var(--caramel)' }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20, flexWrap: 'wrap' }}>
        <button type="button" onClick={addCard} className="btn btn-ghost btn-sm">+ Add region card</button>
        <button type="button" onClick={saveAll} disabled={saving} className="btn btn-primary btn-sm">
          {saving ? 'Saving…' : 'Save network cards'}
        </button>
        {saved && <span style={{ fontSize: 12, color: 'var(--forest)' }}>✓ Saved</span>}
        {error && <span style={{ fontSize: 12, color: '#c0392b' }}>{error}</span>}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 13,
  border: '1px solid var(--light-line)', borderRadius: 2,
}
