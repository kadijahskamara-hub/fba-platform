'use client'

import { useState } from 'react'

type FormState = 'idle' | 'submitting' | 'success' | 'error'

const ENQUIRY_TYPES = [
  { value: 'trade_access',        label: 'Trade Access Enquiry' },
  { value: 'product_sourcing',    label: 'Product Sourcing' },
  { value: 'atelier_commission',  label: 'Atelier Commission' },
  { value: 'general_procurement', label: 'General Procurement' },
  { value: 'press',               label: 'Press & Media' },
  { value: 'other',               label: 'Other' },
]

interface Props {
  dark?: boolean
}

export default function HomepageEnquiryForm({ dark = false }: Props) {
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
    website: '',  // honeypot — bots fill it, humans never see it
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

  // Style tokens that swap based on dark/light context
  const labelColor   = dark ? 'rgba(247,243,238,0.7)'           : 'var(--stone)'
  const inputBg      = dark ? 'rgba(255,255,255,0.07)'           : 'var(--warm-white)'
  const inputBorder  = dark ? '1px solid rgba(196,168,130,0.25)' : '1px solid var(--light-line)'
  const inputColor   = dark ? 'var(--cream)'                     : 'var(--forest)'
  const optionBg     = dark ? 'var(--forest)'                    : 'var(--warm-white)'
  const checkColor   = dark ? 'rgba(247,243,238,0.5)'            : 'var(--stone)'
  const noteColor    = dark ? 'rgba(247,243,238,0.35)'           : 'var(--stone)'
  const errorBg      = dark ? 'rgba(184,92,56,0.15)'             : 'rgba(184,92,56,0.08)'
  const errorBorder  = dark ? '1px solid rgba(184,92,56,0.4)'    : '1px solid rgba(184,92,56,0.3)'
  const errorColor   = dark ? '#f0a090'                          : 'var(--terracotta)'
  const successBg    = dark ? 'rgba(255,255,255,0.05)'           : 'var(--sage-light)'
  const successBorder = dark ? '1px solid rgba(196,168,130,0.2)' : '1px solid var(--light-line)'
  const successTitle  = dark ? 'var(--cream)'                    : 'var(--forest)'
  const successBody   = dark ? 'rgba(247,243,238,0.6)'           : 'var(--stone)'
  const btnClass      = dark ? 'btn btn-sand btn-full'           : 'btn btn-primary btn-full'

  const fieldStyle = { background: inputBg, border: inputBorder, color: inputColor }

  if (state === 'success') {
    return (
      <div style={{
        textAlign: 'center',
        padding: '48px 32px',
        background: successBg,
        border: successBorder,
      }}>
        <div style={{ fontSize: 32, marginBottom: 16, color: 'var(--sand)' }}>✓</div>
        <h3 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 26,
          fontWeight: 300,
          color: successTitle,
          marginBottom: 12,
        }}>
          Message received
        </h3>
        <p style={{ fontSize: 14, color: successBody, lineHeight: 1.7 }}>
          Thank you for reaching out. A member of the FBA studio team will be in touch within 2 business days.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Honeypot — invisible to humans, catches bots */}
      <input
        type="text"
        name="website"
        value={form.website}
        onChange={e => update('website', e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }}
      />
      {/* Row 1: Name */}
      <div className="fba-form-row" style={{ marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label" style={{ color: labelColor }}>First name</label>
          <input
            type="text"
            className="form-input"
            style={fieldStyle}
            value={form.firstName}
            onChange={e => update('firstName', e.target.value)}
            placeholder="Amara"
          />
        </div>
        <div className="form-group">
          <label className="form-label" style={{ color: labelColor }}>Last name</label>
          <input
            type="text"
            className="form-input"
            style={fieldStyle}
            value={form.lastName}
            onChange={e => update('lastName', e.target.value)}
            placeholder="Collins"
          />
        </div>
      </div>

      {/* Row 2: Email + Phone */}
      <div className="fba-form-row" style={{ marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label" style={{ color: labelColor }}>Email *</label>
          <input
            type="email"
            className="form-input"
            style={fieldStyle}
            value={form.email}
            onChange={e => update('email', e.target.value)}
            placeholder="amara@studio.com"
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" style={{ color: labelColor }}>Phone</label>
          <input
            type="tel"
            className="form-input"
            style={fieldStyle}
            value={form.phone}
            onChange={e => update('phone', e.target.value)}
            placeholder="+44 7700 000 000"
          />
        </div>
      </div>

      {/* Row 3: Company + Enquiry type */}
      <div className="fba-form-row" style={{ marginBottom: 16 }}>
        <div className="form-group">
          <label className="form-label" style={{ color: labelColor }}>Company / Studio</label>
          <input
            type="text"
            className="form-input"
            style={fieldStyle}
            value={form.companyName}
            onChange={e => update('companyName', e.target.value)}
            placeholder="Studio Name"
          />
        </div>
        <div className="form-group">
          <label className="form-label" style={{ color: labelColor }}>Enquiry type *</label>
          <select
            className="form-select"
            style={fieldStyle}
            value={form.enquiryType}
            onChange={e => update('enquiryType', e.target.value)}
            required
          >
            <option value="" style={{ background: optionBg }}>Select type…</option>
            {ENQUIRY_TYPES.map(t => (
              <option key={t.value} value={t.value} style={{ background: optionBg }}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Project context — only show for procurement types */}
      {['trade_access', 'product_sourcing', 'general_procurement', 'atelier_commission'].includes(form.enquiryType) && (
        <div className="fba-form-row" style={{ marginBottom: 16 }}>
          <div className="form-group">
            <label className="form-label" style={{ color: labelColor }}>Project location</label>
            <input
              type="text"
              className="form-input"
              style={fieldStyle}
              value={form.projectLocation}
              onChange={e => update('projectLocation', e.target.value)}
              placeholder="London, UK"
            />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ color: labelColor }}>Estimated budget</label>
            <select
              className="form-select"
              style={fieldStyle}
              value={form.estimatedBudget}
              onChange={e => update('estimatedBudget', e.target.value)}
            >
              <option value="" style={{ background: optionBg }}>Prefer not to say</option>
              <option value="under_5k"    style={{ background: optionBg }}>Under £5,000</option>
              <option value="5k_20k"      style={{ background: optionBg }}>£5,000 – £20,000</option>
              <option value="20k_50k"     style={{ background: optionBg }}>£20,000 – £50,000</option>
              <option value="50k_100k"    style={{ background: optionBg }}>£50,000 – £100,000</option>
              <option value="over_100k"   style={{ background: optionBg }}>Over £100,000</option>
            </select>
          </div>
        </div>
      )}

      {/* Message */}
      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label" style={{ color: labelColor }}>Message *</label>
        <textarea
          className="form-textarea"
          style={{ ...fieldStyle, minHeight: 120 }}
          value={form.message}
          onChange={e => update('message', e.target.value)}
          placeholder="Tell us about your project or enquiry…"
          required
        />
      </div>

      {/* Marketing consent */}
      <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 28, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={form.consentMarketing}
          onChange={e => update('consentMarketing', e.target.checked)}
          style={{ marginTop: 2, accentColor: 'var(--sand)' }}
        />
        <span style={{ fontSize: 12, color: checkColor, lineHeight: 1.6 }}>
          I&apos;m happy to receive occasional updates from FBA about new collections, artisans and studio news.
        </span>
      </label>

      {error && (
        <div style={{
          background: errorBg,
          border: errorBorder,
          color: errorColor,
          padding: '12px 16px',
          fontSize: 13,
          marginBottom: 20,
        }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        className={btnClass}
        disabled={state === 'submitting'}
        style={{ opacity: state === 'submitting' ? 0.7 : 1 }}
      >
        {state === 'submitting' ? 'Sending…' : 'Send enquiry'}
      </button>

      <p style={{ fontSize: 11, color: noteColor, textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
        Your details are handled in accordance with our privacy policy and will never be shared with third parties.
      </p>
    </form>
  )
}
