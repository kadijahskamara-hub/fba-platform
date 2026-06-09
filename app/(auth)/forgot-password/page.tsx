'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'

type State = 'idle' | 'pending' | 'success'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [error, setError]     = useState('')
  const [state, setState]     = useState<State>('idle')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmed = email.trim()
    if (!trimmed) {
      setError('Please enter your email address.')
      return
    }

    startTransition(async () => {
      try {
        const res  = await fetch('/api/auth/forgot-password', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email: trimmed }),
        })
        const data = await res.json()

        if (!data.success) {
          setError(data.error ?? 'Something went wrong. Please try again.')
          return
        }

        setState('success')
      } catch {
        setError('Network error. Please check your connection and try again.')
      }
    })
  }

  return (
    <div className="page-body" style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '80px 24px' }}>

        {state === 'success' ? (
          /* ── Success state ── */
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 64,
              height: 64,
              background: 'var(--sage-light, #E4EAE3)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              fontSize: 28,
            }}>
              ✓
            </div>
            <div className="label label-sage" style={{ marginBottom: 12 }}>Check your inbox</div>
            <h1 className="h1" style={{ marginBottom: 16 }}>Email sent</h1>
            <p className="body-sm" style={{ color: 'var(--stone)', marginBottom: 8, lineHeight: 1.7 }}>
              If an account exists for <strong>{email}</strong>, we&rsquo;ve sent a
              password reset link. It expires in 1 hour.
            </p>
            <p className="body-sm" style={{ color: 'var(--stone)', marginBottom: 40, lineHeight: 1.7 }}>
              Can&rsquo;t find it? Check your spam folder or{' '}
              <button
                onClick={() => { setState('idle'); setEmail('') }}
                style={{ color: 'var(--caramel)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}
              >
                try again
              </button>.
            </p>
            <Link href="/login" className="btn btn-secondary">
              Back to login
            </Link>
          </div>
        ) : (
          /* ── Form state ── */
          <>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <div className="label label-sage" style={{ marginBottom: 12 }}>Account recovery</div>
              <h1 className="h1" style={{ marginBottom: 12 }}>Forgot password?</h1>
              <p className="body-sm" style={{ color: 'var(--stone)' }}>
                Enter your email address and we&rsquo;ll send you a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              {error && (
                <div style={{
                  background: '#F8D7DA', color: '#721C24',
                  padding: '12px 16px', marginBottom: 24, fontSize: 14,
                }}>
                  {error}
                </div>
              )}

              <div className="form-group">
                <label htmlFor="email" className="form-label">Email address</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  className="form-input"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@studio.com"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-full btn-lg"
                disabled={isPending}
                style={{ marginTop: 8 }}
              >
                {isPending ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <Link href="/login" style={{ fontSize: 13, color: 'var(--stone)' }}>
                ← Back to login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
