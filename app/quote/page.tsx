'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

export default function QuotePage() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center', color: 'var(--stone)' }}>Loading…</div>}>
      <QuoteForm />
    </Suspense>
  )
}

function QuoteForm() {
  const params  = useSearchParams()
  const router  = useRouter()
  const productId = params.get('product')
  const selQty    = Math.min(999, Math.max(1, parseInt(params.get('qty') ?? '1', 10) || 1))
  const selFinish = params.get('finish')
  const selFabric = params.get('fabric')
  const selSize   = params.get('size')

  const [form, setForm] = useState({
    projectName:     '',
    projectLocation: '',
    budget:          '',
    requiredBy:      '',
    notes:           '',
  })
  const [status,  setStatus]  = useState<'idle' | 'submitting' | 'success' | 'error' | 'unauth'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    // Quick auth check — if 401 we'll catch it on submit; no pre-redirect needed
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')

    const payload: Record<string, unknown> = {
      items: productId ? [{
        productId,
        quantity:       selQty,
        selectedFinish: selFinish ?? undefined,
        selectedFabric: selFabric ?? undefined,
        selectedSize:   selSize ?? undefined,
      }] : [],
      projectName:     form.projectName.trim() || undefined,
      projectLocation: form.projectLocation.trim() || undefined,
      budget:          form.budget ? Number(form.budget) : undefined,
      requiredBy:      form.requiredBy || undefined,
      notes:           form.notes.trim() || undefined,
    }

    const res = await fetch('/api/quote-requests', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const data = await res.json()

    if (res.status === 401) {
      setStatus('unauth')
      return
    }
    if (!data.success) {
      setStatus('error')
      setErrorMsg(data.error ?? 'Something went wrong. Please try again.')
      return
    }
    setStatus('success')
  }

  if (status === 'unauth') {
    return (
      <div className="page-body" style={{ background: 'var(--cream)', minHeight: '100vh' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <div className="label label-sage" style={{ marginBottom: 16 }}>Sign in required</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 300, marginBottom: 16 }}>
            Please log in to request a quote
          </h1>
          <p style={{ color: 'var(--stone)', marginBottom: 32, lineHeight: 1.7 }}>
            Quote requests are available to registered accounts. Create a free account or sign in to continue.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href={`/login?next=/quote${productId ? '?product=' + productId : ''}`} className="btn btn-primary">
              Sign In
            </Link>
            <Link href={`/register?next=/quote${productId ? '?product=' + productId : ''}`} className="btn btn-secondary">
              Create Account
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="page-body" style={{ background: 'var(--cream)', minHeight: '100vh' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 24 }}>✓</div>
          <div className="label label-sage" style={{ marginBottom: 16 }}>Quote submitted</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 300, color: 'var(--forest)', marginBottom: 16 }}>
            We&rsquo;ll be in touch soon
          </h1>
          <p style={{ color: 'var(--stone)', lineHeight: 1.75, marginBottom: 40 }}>
            Your quote request has been received. A member of our team will respond within 2 business days
            with pricing, availability, and lead time details.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/products" className="btn btn-primary">Continue Browsing</Link>
            <Link href="/account" className="btn btn-secondary">My Account</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-body" style={{ background: 'var(--cream)', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{ background: 'var(--forest)', padding: '64px 24px 56px', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div className="label label-sage" style={{ marginBottom: 14 }}>Quote Request</div>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontSize: 'clamp(32px, 5vw, 48px)',
            fontWeight: 300, color: 'var(--cream)', margin: '0 0 16px',
          }}>
            Request Pricing
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(247,243,238,0.65)', lineHeight: 1.75 }}>
            Tell us about your project and we&rsquo;ll come back with tailored pricing,
            lead times, and finish options.
          </p>
        </div>
      </section>

      {/* Form */}
      <section style={{ maxWidth: 640, margin: '0 auto', padding: '64px 24px 96px' }}>

        {status === 'error' && (
          <div style={{
            background: '#F8D7DA', color: '#721C24', padding: '12px 16px',
            marginBottom: 28, fontSize: 14,
          }}>
            {errorMsg}
          </div>
        )}

        {productId && (
          <div style={{
            background: 'var(--warm-white)', border: '1px solid var(--light-line)',
            padding: '14px 18px', marginBottom: 28, fontSize: 13, color: 'var(--forest)',
          }}>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 6 }}>
              Your selection
            </div>
            {[
              `Quantity: ${selQty}`,
              selFinish ? `Finish: ${selFinish}` : null,
              selFabric ? `Upholstery: ${selFabric}` : null,
              selSize ? `Size: ${selSize}` : null,
            ].filter(Boolean).join(' · ')}
            <div style={{ fontSize: 11, color: 'var(--stone)', marginTop: 6 }}>
              These details will be included with your quote request.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Project name</label>
            <input
              className="form-input"
              placeholder="e.g. Shoreditch Hotel — Lobby Refresh"
              value={form.projectName}
              onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Project location</label>
            <input
              className="form-input"
              placeholder="e.g. London, UK"
              value={form.projectLocation}
              onChange={e => setForm(f => ({ ...f, projectLocation: e.target.value }))}
            />
          </div>

          <div className="fba-form-row" style={{ gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Estimated budget (£)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                placeholder="e.g. 15000"
                value={form.budget}
                onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Required by</label>
              <input
                className="form-input"
                type="date"
                value={form.requiredBy}
                onChange={e => setForm(f => ({ ...f, requiredBy: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Additional notes</label>
            <textarea
              className="form-input"
              rows={4}
              placeholder="Finish preferences, quantity, COM requirements, or any other details…"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              style={{ resize: 'vertical' }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={status === 'submitting'}
            style={{ marginTop: 8 }}
          >
            {status === 'submitting' ? 'Sending…' : 'Submit Quote Request'}
          </button>
        </form>

        <p style={{ marginTop: 24, fontSize: 12, color: 'var(--stone)', textAlign: 'center', lineHeight: 1.7 }}>
          Prefer to speak directly?{' '}
          <Link href="/contact" style={{ color: 'var(--caramel)' }}>Contact our studio</Link>
          {' '}or email{' '}
          <a href="mailto:info@fullbloom.uk.com" style={{ color: 'var(--caramel)' }}>info@fullbloom.uk.com</a>
        </p>
      </section>
    </div>
  )
}
