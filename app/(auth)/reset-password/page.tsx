'use client'

import { useState, useTransition, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

type State = 'idle' | 'success'

function ResetPasswordForm() {
  const router        = useRouter()
  const params        = useSearchParams()
  const token         = params.get('token') ?? ''
  const email         = params.get('email') ?? ''

  const [password,    setPassword]    = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [error,       setError]       = useState('')
  const [state,       setState]       = useState<State>('idle')
  const [isPending,   startTransition] = useTransition()

  // If the link is missing required params, show an error immediately
  if (!token || !email) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div className="label label-sage" style={{ marginBottom: 12 }}>Invalid link</div>
        <h1 className="h1" style={{ marginBottom: 16 }}>Reset link invalid</h1>
        <p className="body-sm" style={{ color: 'var(--stone)', marginBottom: 32, lineHeight: 1.7 }}>
          This password reset link is missing required information. Please request a new one.
        </p>
        <Link href="/forgot-password" className="btn btn-primary">
          Request new link
        </Link>
      </div>
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    startTransition(async () => {
      try {
        const res  = await fetch('/api/auth/reset-password', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ token, email, password }),
        })
        const data = await res.json()

        if (!data.success) {
          setError(data.error ?? 'Something went wrong. Please try again.')
          return
        }

        setState('success')
        // Redirect to login after a short delay
        setTimeout(() => router.push('/login'), 2500)
      } catch {
        setError('Network error. Please check your connection and try again.')
      }
    })
  }

  if (state === 'success') {
    return (
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
        <div className="label label-sage" style={{ marginBottom: 12 }}>All done</div>
        <h1 className="h1" style={{ marginBottom: 16 }}>Password updated</h1>
        <p className="body-sm" style={{ color: 'var(--stone)', marginBottom: 32, lineHeight: 1.7 }}>
          Your password has been changed. Redirecting you to login…
        </p>
        <Link href="/login" className="btn btn-secondary">
          Go to login
        </Link>
      </div>
    )
  }

  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div className="label label-sage" style={{ marginBottom: 12 }}>Account recovery</div>
        <h1 className="h1" style={{ marginBottom: 12 }}>Set new password</h1>
        <p className="body-sm" style={{ color: 'var(--stone)' }}>
          Choose a strong password for <strong>{email}</strong>.
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
          <label htmlFor="password" className="form-label">New password</label>
          <input
            id="password"
            type="password"
            required
            autoFocus
            className="form-input"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>

        <div className="form-group">
          <label htmlFor="confirm" className="form-label">Confirm new password</label>
          <input
            id="confirm"
            type="password"
            required
            className="form-input"
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat password"
          />
        </div>

        {/* Simple strength hint */}
        {password.length > 0 && (
          <div style={{
            fontSize: 12,
            color: password.length >= 12 ? '#2D6A2D' : password.length >= 8 ? '#7A6000' : '#A00',
            marginBottom: 20,
            marginTop: -8,
          }}>
            {password.length >= 12
              ? '✓ Strong password'
              : password.length >= 8
              ? '⚠ Acceptable — consider making it longer'
              : '✗ Too short'}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-full btn-lg"
          disabled={isPending}
          style={{ marginTop: 8 }}
        >
          {isPending ? 'Updating…' : 'Update password'}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 32 }}>
        <Link href="/login" style={{ fontSize: 13, color: 'var(--stone)' }}>
          ← Back to login
        </Link>
      </div>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="page-body" style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '80px 24px' }}>
        <Suspense fallback={
          <div style={{ textAlign: 'center', color: 'var(--stone)' }}>Loading…</div>
        }>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
