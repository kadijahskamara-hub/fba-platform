'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewProjectPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '',
    location: '',
    budget: '',
    currency: 'GBP',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const update = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Project name is required.')
      return
    }
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:     form.name.trim(),
        location: form.location.trim() || null,
        budget:   form.budget ? parseFloat(form.budget) : null,
        currency: form.currency,
        notes:    form.notes.trim() || null,
      }),
    })
    const json = await res.json()

    if (json.success) {
      router.push(`/account/projects/${json.data.id}`)
    } else {
      setError(json.error ?? 'Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <div className="page-body">
      <div className="page-hero" style={{ paddingTop: 'calc(var(--nav-h) + 60px)', paddingBottom: 60 }}>
        <div className="page-hero-inner">
          <div style={{ marginBottom: 12 }}>
            <Link href="/account/projects" style={{
              fontSize: 12, color: 'rgba(196,168,130,0.7)',
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              ← My Projects
            </Link>
          </div>
          <h1 className="page-hero-title">New Project</h1>
          <p className="page-hero-desc">Create a folder to save and organise pieces for a project.</p>
        </div>
      </div>

      <div className="section">
        <div className="container" style={{ maxWidth: 560 }}>
          <form
            onSubmit={handleSubmit}
            style={{
              background: 'var(--warm-white)',
              border: '1px solid var(--light-line)',
              padding: 40,
            }}
          >
            <div className="form-group">
              <label className="form-label">Project name *</label>
              <input
                type="text"
                className="form-input"
                value={form.name}
                onChange={e => update('name', e.target.value)}
                placeholder="e.g. Mayfair Residence — Living Room"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Location</label>
              <input
                type="text"
                className="form-input"
                value={form.location}
                onChange={e => update('location', e.target.value)}
                placeholder="e.g. London, UK"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Budget estimate</label>
                <input
                  type="number"
                  className="form-input"
                  value={form.budget}
                  onChange={e => update('budget', e.target.value)}
                  placeholder="0"
                  min="0"
                  step="500"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Currency</label>
                <select
                  className="form-select"
                  value={form.currency}
                  onChange={e => update('currency', e.target.value)}
                >
                  <option value="GBP">GBP £</option>
                  <option value="EUR">EUR €</option>
                  <option value="USD">USD $</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                value={form.notes}
                onChange={e => update('notes', e.target.value)}
                placeholder="Brief, mood, key requirements…"
                style={{ minHeight: 100 }}
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(184,92,56,0.08)',
                border: '1px solid rgba(184,92,56,0.3)',
                color: 'var(--terracotta)',
                padding: '12px 16px',
                fontSize: 13,
                marginBottom: 20,
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
                style={{ opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? 'Creating…' : 'Create project'}
              </button>
              <Link href="/account/projects" className="btn btn-secondary">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
