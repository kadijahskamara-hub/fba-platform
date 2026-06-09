'use client'

import { useState } from 'react'

type FormState = 'idle' | 'submitting' | 'success' | 'error'

const ENQUIRY_TYPES = [
  { value: 'trade_access',        label: 'Trade Access Enquiry' },
  { value: 'product_sourcing',    label: 'Product Sourcing' },
  { value: 'atelier_commission',  label: 'Atelier Commission' },
  { value: 'general_procurement', label: 'General Procurement' },
  { value: 'press',               label: 'Press &amp; Media' },
  { value: 'other',               label: 'Other' },
]

export default function HomepageEnquiryForm() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    companyName: '',
    enquiryType: '',
    message: '',
    projectLocation: '',
    estimatedBudget: '',
    consentMarketing: false,
  })
  const [state, setState] = useState<FormState>('idle')
  const [error, setError] = useState('')

  const update = (field: string, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email || !form.enquiryType || !form.message) {
      setError('Please fill in email, enquiry type and message.')
      return
    }
    setState('submitting')
    setError('')

    const res = await fetch('/api/service-enquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()

    if (json.success) {
      setState('success')
    } else {
      setError(json.error ?? 'Something went wrong. Please try again.')
      setState('error')
    }
  }

  if (state === 'success') {
    return (
      <div style={{
        textAlign: 'center',
        padding: '48px 32px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(196,168,130,0.2)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>✓</div>
        <h3 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 26,
          fontWeight: 300,
          color: 'var(--cream)',
          marginBottom: 12,
        }}>
          Message received
        </h3>
        <p style={{ fontSize: 14, color: 'rgba(247,243,238,0.6)', lineHeight: 1.7 }}>
          Thank you for reaching out. A member of the FBA studio team will be in touch within 2 business days.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label" style={{ color: 'rgba(247,243,238,0.7)' }}>First name</label>
          <input
            type="text"
            className="form-input"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(196,168,130,0.25)', color: 'var(--cream)' }}
            value={form.firstName}
            onChange={e => update('firstName', e.target.value)}
            placeholder="Amara"
          />
        </div>
        <div className="form-group">
          <label className="form-label" style={{ color: 'rgba(247,243,238,0.7)' }}>Last name</label>
          <input
            type="text"
            className="form-input"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(196,168,130,0.25)', color: 'var(--cream)' }}
            value={form.lastName}
            onChange={e => update('lastName', e.target.value)}
            placeholder="Collins"
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label" style={{ color: 'rgba(247,243,238,0.7)' }}>Email *</label>
          <input
            type="email"
            className="form-input"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(196,168,130,0.25)', color: 'var(--cream)' }}
            value={form.email}
            onChange={e => update('email', e.target.value)}
            placeholder="amara@studio.com"
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" style={{ color: 'rgba(247,243,238,0.7)' }}>Phone</label>
          <input
            type="tel"
            className="form-input"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(196,168,130,0.25)', color: 'var(--cream)' }}
            value={form.phone}
            onChange={e => update('phone', e.target.value)}
            placeholder="+44 7700 000 000"
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label" style={{ color: 'rgba(247,243,238,0.7)' }}>Company / Studio</label>
          <input
            type="text"
            className="form-input"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(196,168,130,0.25)', color: 'var(--cream)' }}
            value={form.companyName}
            onChange={e => update('companyName', e.target.value)}
            placeholder="Studio Name"
          />
        </div>
        <div className="form-group">
          <label className="form-label" style={{ color: 'rgba(247,243,238,0.7)' }}>Enquiry type *</label>
          <select
            className="form-select"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(196,168,130,0.25)', color: 'var(--cream)' }}
            value={form.enquiryType}
            onChange={e => update('enquiryType', e.target.value)}
            required
          >
            <option value="" style={{ background: 'var(--forest)' }}>Select type…</option>
            {ENQUIRY_TYPES.map(t => (
              <option key={t.value} value={t.value} style={{ background: 'var(--forest)' }}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Project context — only show for procurement types */}
      {['trade_access', 'product_sourcing', 'general_procurement', 'atelier_commission'].includes(form.enquiryType) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className="form-group">
            <label className="form-label" style={{ color: 'rgba(247,243,238,0.7)' }}>Project location</label>
            <input
              type="text"
              className="form-input"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(196,168,130,0.25)', color: 'var(--cream)' }}
              value={form.projectLocation}
              onChange={e => update('projectLocation', e.target.value)}
              placeholder="London, UK"
            />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ color: 'rgba(247,243,238,0.7)' }}>Estimated budget</label>
            <select
              className="form-select"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(196,168,130,0.25)', color: 'var(--cream)' }}
              value={form.estimatedBudget}
              onChange={e => update('estimatedBudget', e.target.value)}
            >
              <option value="" style={{ background: 'var(--forest)' }}>Prefer not to say</option>
              <option value="under_5k"    style={{ background: 'var(--forest)' }}>Under £5,000</option>
              <option value="5k_20k"      style={{ background: 'var(--forest)' }}>£5,000 – £20,000</option>
              <option value="20k_50k"     style={{ background: 'var(--forest)' }}>£20,000 – £50,000</option>
              <option value="50k_100k"    style={{ background: 'var(--forest)' }}>£50,000 – £100,000</option>
              <option value="over_100k"   style={{ background: 'var(--forest)' }}>Over £100,000</option>
            </select>
          </div>
        </div>
      )}

      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label" style={{ color: 'rgba(247,243,238,0.7)' }}>Message *</label>
        <textarea
          className="form-textarea"
          style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(196,168,130,0.25)',
            color: 'var(--cream)',
            minHeight: 120,
          }}
          value={form.message}
          onChange={e => update('message', e.target.value)}
          placeholder="Tell us about your project or enquiry…"
          required
        />
      </div>

      <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 28, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={form.consentMarketing}
          onChange={e => update('consentMarketing', e.target.checked)}
          style={{ marginTop: 2, accentColor: 'var(--sand)' }}
        />
        <span style={{ fontSize: 12, color: 'rgba(247,243,238,0.5)', lineHeight: 1.6 }}>
          I'm happy to receive occasional updates from FBA about new collections, artisans and studio news.
        </span>
      </label>

      {error && (
        <div style={{
          background: 'rgba(184,92,56,0.15)',
          border: '1px solid rgba(184,92,56,0.4)',
          color: '#f0a090',
          padding: '12px 16px',
          fontSize: 13,
          marginBottom: 20,
        }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary btn-full"
        disabled={state === 'submitting'}
        style={{ opacity: state === 'submitting' ? 0.7 : 1 }}
      >
        {state === 'submitting' ? 'Sending…' : 'Send enquiry'}
      </button>

      <p style={{ fontSize: 11, color: 'rgba(247,243,238,0.35)', textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
        Your details are handled in accordance with our privacy policy and will never be shared with third parties.
      </p>
    </form>
  )
}
