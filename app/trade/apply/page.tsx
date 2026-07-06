'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Step = 'intro' | 'form' | 'submitted'

export default function TradeApplyPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('intro')
  const [isPending, startTransition] = useTransition()
  const [apiError, setApiError] = useState('')

  const [form, setForm] = useState({
    hp: '',  // honeypot — bots fill it, humans never see it
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    companyName: '',
    businessType: '',
    website: '',
    location: '',
    projectType: '',
    estimatedBudget: '',
    howDidYouHear: '',
    consentMarketing: false,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({
        ...f,
        [key]: (e.target as HTMLInputElement).type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : e.target.value
      }))

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.firstName.trim()) errs.firstName = 'Required'
    if (!form.lastName.trim())  errs.lastName  = 'Required'
    if (!form.email.includes('@')) errs.email  = 'Valid email required'
    if (!form.companyName.trim())  errs.companyName = 'Required'
    if (!form.businessType)        errs.businessType = 'Please select your business type'
    return errs
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError('')
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    startTransition(async () => {
      const res = await fetch('/api/trade-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!data.success) {
        setApiError(data.error ?? 'Submission failed. Please try again.')
        return
      }
      setStep('submitted')
    })
  }

  if (step === 'submitted') {
    return (
      <div className="page-body" style={{ background: 'var(--cream)', minHeight: '100vh' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '100px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 24 }}>✦</div>
          <div className="label label-sage" style={{ marginBottom: 16 }}>Application received</div>
          <h1 className="h1" style={{ marginBottom: 20 }}>Thank you, {form.firstName}</h1>
          <p className="body" style={{ color: 'var(--stone)', marginBottom: 12, maxWidth: 480, margin: '0 auto 20px' }}>
            We've received your trade application and will be in touch within 3–5 business days.
          </p>
          <p className="body-sm" style={{ maxWidth: 440, margin: '0 auto 40px' }}>
            In some cases we may send you a detailed application form to gather further information before approval.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <Link href="/products" className="btn btn-primary">Browse the Edit</Link>
            <Link href="/" className="btn btn-secondary">Return Home</Link>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'intro') {
    return (
      <div className="page-body">
        {/* Hero */}
        <div className="page-hero">
          <div className="page-hero-inner">
            <div className="label page-hero-label">Trade accounts</div>
            <h1 className="page-hero-title">Apply for Trade Access</h1>
            <p className="page-hero-desc">
              Interior designers, architects, hospitality developers and procurement professionals
              are welcome to apply for a Full Bloom Artelier trade account.
            </p>
          </div>
        </div>

        {/* Benefits */}
        <div className="section">
          <div className="container">
            <div className="grid-3" style={{ marginBottom: 64 }}>
              {[
                { title: 'Trade Pricing',   body: 'Access net trade pricing across the full Edit and FBA Collection, exclusive to approved trade accounts.' },
                { title: 'FF&E Sourcing',   body: 'Request bespoke sourcing, specifications and detailed quote packages for residential and hospitality projects.' },
                { title: 'Project Folders', body: 'Save products to project folders, request quotes and manage your FF&E schedules in one place.' },
              ].map(b => (
                <div key={b.title} style={{ padding: 40, background: 'var(--cream)', border: '1px solid var(--light-line)' }}>
                  <div className="divider" />
                  <h3 className="h3" style={{ marginBottom: 12 }}>{b.title}</h3>
                  <p className="body-sm">{b.body}</p>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-lg" onClick={() => setStep('form')}>
                Begin Application
              </button>
              <a
                href="/api/trade/application-form.pdf"
                className="btn btn-secondary btn-lg"
                download="FBA-Trade-Programme.pdf"
              >
                ↓ Download Trade Pack
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Form step
  return (
    <div className="page-body" style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '80px 24px' }}>

        <div style={{ marginBottom: 48 }}>
          <div className="label label-sage" style={{ marginBottom: 12 }}>Trade Account Application</div>
          <h1 className="h1" style={{ marginBottom: 12 }}>Tell us about your practice</h1>
          <p className="body-sm">
            All fields marked * are required. We'll review your application and respond within 3–5 working days.
          </p>
        </div>

        {apiError && (
          <div style={{ background: '#F8D7DA', color: '#721C24', padding: '12px 16px', marginBottom: 24, fontSize: 14 }}>
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
            {/* Honeypot — invisible to humans, catches bots */}
            <input type="text" name="website" value={form.hp} onChange={e => setForm(f => ({ ...f, hp: e.target.value }))} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }} />

          {/* Personal details */}
          <div style={{ marginBottom: 32 }}>
            <h4 className="h4" style={{ marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--light-line)' }}>Your Details</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName" className="form-label">First name *</label>
                <input id="firstName" type="text" required className={`form-input${errors.firstName ? ' error' : ''}`}
                  value={form.firstName} onChange={set('firstName')} />
                {errors.firstName && <p className="form-error">{errors.firstName}</p>}
              </div>
              <div className="form-group">
                <label htmlFor="lastName" className="form-label">Last name *</label>
                <input id="lastName" type="text" required className={`form-input${errors.lastName ? ' error' : ''}`}
                  value={form.lastName} onChange={set('lastName')} />
                {errors.lastName && <p className="form-error">{errors.lastName}</p>}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="email" className="form-label">Email address *</label>
                <input id="email" type="email" required className={`form-input${errors.email ? ' error' : ''}`}
                  value={form.email} onChange={set('email')} />
                {errors.email && <p className="form-error">{errors.email}</p>}
              </div>
              <div className="form-group">
                <label htmlFor="phone" className="form-label">Phone</label>
                <input id="phone" type="tel" className="form-input"
                  value={form.phone} onChange={set('phone')} />
              </div>
            </div>
          </div>

          {/* Business details */}
          <div style={{ marginBottom: 32 }}>
            <h4 className="h4" style={{ marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--light-line)' }}>Business Details</h4>
            <div className="form-group">
              <label htmlFor="companyName" className="form-label">Company / Studio name *</label>
              <input id="companyName" type="text" required className={`form-input${errors.companyName ? ' error' : ''}`}
                value={form.companyName} onChange={set('companyName')} />
              {errors.companyName && <p className="form-error">{errors.companyName}</p>}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="businessType" className="form-label">Business type *</label>
                <select id="businessType" required className={`form-select${errors.businessType ? ' error' : ''}`}
                  value={form.businessType} onChange={set('businessType')}>
                  <option value="">Select…</option>
                  <option value="interior_design_studio">Interior Design Studio</option>
                  <option value="architecture_practice">Architecture Practice</option>
                  <option value="hospitality_developer">Hospitality Developer</option>
                  <option value="property_developer">Property Developer</option>
                  <option value="procurement_consultant">Procurement Consultant</option>
                  <option value="fit_out_contractor">Fit-Out Contractor</option>
                  <option value="other_trade">Other Trade Professional</option>
                </select>
                {errors.businessType && <p className="form-error">{errors.businessType}</p>}
              </div>
              <div className="form-group">
                <label htmlFor="location" className="form-label">Studio location</label>
                <input id="location" type="text" className="form-input" placeholder="London, UK"
                  value={form.location} onChange={set('location')} />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="website" className="form-label">Website / Portfolio</label>
              <input id="website" type="url" className="form-input" placeholder="https://"
                value={form.website} onChange={set('website')} />
            </div>
          </div>

          {/* Project context */}
          <div style={{ marginBottom: 32 }}>
            <h4 className="h4" style={{ marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--light-line)' }}>Project Context</h4>
            <div className="form-group">
              <label htmlFor="projectType" className="form-label">Typical project types</label>
              <select id="projectType" className="form-select"
                value={form.projectType} onChange={set('projectType')}>
                <option value="">Select…</option>
                <option value="high_end_residential">High-End Residential</option>
                <option value="hospitality">Hospitality (Hotels, Restaurants, Spas)</option>
                <option value="superyacht_aviation">Superyacht / Private Aviation</option>
                <option value="commercial">Commercial Office / Workplace</option>
                <option value="mixed">Mixed Residential &amp; Hospitality</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="estimatedBudget" className="form-label">Typical project budget</label>
              <select id="estimatedBudget" className="form-select"
                value={form.estimatedBudget} onChange={set('estimatedBudget')}>
                <option value="">Select…</option>
                <option value="under_50k">Under £50,000</option>
                <option value="50k_250k">£50,000 – £250,000</option>
                <option value="250k_1m">£250,000 – £1,000,000</option>
                <option value="1m_5m">£1M – £5M</option>
                <option value="5m_plus">£5M+</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="howDidYouHear" className="form-label">How did you hear about us?</label>
              <select id="howDidYouHear" className="form-select"
                value={form.howDidYouHear} onChange={set('howDidYouHear')}>
                <option value="">Select…</option>
                <option value="instagram">Instagram</option>
                <option value="linkedin">LinkedIn</option>
                <option value="referral">Referral / Word of mouth</option>
                <option value="google">Google search</option>
                <option value="industry_event">Industry event</option>
                <option value="press">Press / Editorial</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* Consent */}
          <div className="form-group" style={{ marginBottom: 32 }}>
            <label className="form-checkbox">
              <input type="checkbox" checked={form.consentMarketing}
                onChange={set('consentMarketing')} />
              <span style={{ fontSize: 13, color: 'var(--stone)', lineHeight: 1.5 }}>
                I'd like to receive updates on new products, artisan collections and studio news.
              </span>
            </label>
          </div>

          <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 28, lineHeight: 1.6 }}>
            By submitting this form you agree to our{' '}
            <Link href="/privacy" style={{ color: 'var(--caramel)' }}>Privacy Policy</Link>.
            Your information is used solely for the purpose of processing your trade application.
          </p>

          <div style={{ display: 'flex', gap: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep('intro')}>
              Back
            </button>
            <button type="submit" className="btn btn-primary btn-lg" disabled={isPending}
              style={{ flex: 1 }}>
              {isPending ? 'Submitting…' : 'Submit Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
