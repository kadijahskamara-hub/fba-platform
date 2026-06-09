'use client'

import { useState } from 'react'

interface FounderSettings {
  show_on_about: boolean
  show_on_home:  boolean
  show_image:    boolean
  name:          string
  title:         string
  bio:           string
  bio_2:         string
  tags:          string
  previously:    string
}

interface Props {
  initialValue: FounderSettings
}

const DEFAULTS: FounderSettings = {
  show_on_about: true,
  show_on_home:  true,
  show_image:    true,
  name:          'Kadijahta Kamara',
  title:         'Founder & Creative Director',
  bio:           'A luxury FF&E specialist with over a decade of experience across high-end residential, hospitality, and cruise line interiors. Kadijahta has delivered projects from £2M to £20M across the UK, Europe, Asia, and West Africa — building a deeply personal network of global makers that is the foundation of everything Full Bloom Artelier does.',
  bio_2:         'She brings a rare combination of creative vision, technical precision, and the kind of relationships with manufacturers that take years to build properly.',
  tags:          'FF&E Specialist,Global Sourcing,Hospitality,Interior Architecture,Bespoke Design',
  previously:    'KCA International · SMC Design · GA Group · Russell Sage Studio',
}

export function FounderSettingsPanel({ initialValue }: Props) {
  const [settings, setSettings] = useState<FounderSettings>({ ...DEFAULTS, ...initialValue })
  const [saving, setSaving]     = useState(false)
  const [saved,  setSaved]      = useState(false)
  const [error,  setError]      = useState('')

  function set<K extends keyof FounderSettings>(key: K, val: FounderSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: val }))
    setSaved(false)
  }

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch('/api/admin/site-settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key: 'founder_settings', value: settings }),
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

  const toggle = (
    key: 'show_on_about' | 'show_on_home' | 'show_image',
    label: string,
  ) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
      <div
        onClick={() => set(key, !settings[key])}
        style={{
          width: 44, height: 24, borderRadius: 12,
          background: settings[key] ? 'var(--forest)' : 'var(--light-line)',
          position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: settings[key] ? 23 : 3,
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
      <span style={{ fontSize: 14, color: 'var(--forest)', userSelect: 'none' }}>{label}</span>
    </label>
  )

  return (
    <div>
      <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 300, marginBottom: 6 }}>
        Founder Section
      </h3>
      <p style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 24 }}>
        Control where the founder section appears and edit its content.
      </p>

      {/* Visibility toggles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '4px 32px', marginBottom: 28, justifyContent: 'start' }}>
        {toggle('show_on_about', 'Show on About page')}
        {toggle('show_on_home',  'Show on Home page')}
        {toggle('show_image',    'Show founder photo')}
      </div>

      {/* Content fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Name</label>
          <input
            className="form-input"
            value={settings.name}
            onChange={e => set('name', e.target.value)}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Title</label>
          <input
            className="form-input"
            value={settings.title}
            onChange={e => set('title', e.target.value)}
          />
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 16 }}>
        <label className="form-label">Bio (main paragraph)</label>
        <textarea
          className="form-input"
          rows={4}
          value={settings.bio}
          onChange={e => set('bio', e.target.value)}
          style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 14 }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 16 }}>
        <label className="form-label">Bio (second paragraph — About page only)</label>
        <textarea
          className="form-input"
          rows={3}
          value={settings.bio_2}
          onChange={e => set('bio_2', e.target.value)}
          style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 14 }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Tags (comma-separated)</label>
          <input
            className="form-input"
            value={settings.tags}
            onChange={e => set('tags', e.target.value)}
            placeholder="FF&E Specialist,Global Sourcing,Hospitality"
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Previously</label>
          <input
            className="form-input"
            value={settings.previously}
            onChange={e => set('previously', e.target.value)}
            placeholder="Studio A · Studio B · Studio C"
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={save}
          disabled={saving}
          className="btn btn-primary btn-sm"
        >
          {saving ? 'Saving…' : 'Save Founder Settings'}
        </button>
        {saved  && <span style={{ fontSize: 13, color: 'var(--forest)' }}>✓ Saved</span>}
        {error  && <span style={{ fontSize: 13, color: '#c0392b' }}>{error}</span>}
      </div>
    </div>
  )
}
