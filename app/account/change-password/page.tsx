'use client'

import { PasswordInput } from '@/components/PasswordInput'

import { useState, useTransition, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

type State = 'idle' | 'success'

function ChangePasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  // forced=1 -> user signed in with a temporary password and must set a new one
  const forced = params.get('forced') === '1'

  const [current,   setCurrent]   = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [error,     setError]     = useState('')
  const [state,     setState]     = useState<State>('idle')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password === current) {
      setError('New password must be different from the current one.')
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/auth/change-password', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ currentPassword: current, newPassword: password }),
        })

        if (res.status === 401) {
          router.push('/login?next=/account/change-password')
          return
        }

        const data = await res.json()

        if (!data.success) {
          setError(data.error ?? 'Something went wrong. Please try again.')
          return
        }

        setState('success')
        setTimeout(() => router.push('/account'), 2000)
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
          Your password has been changed. Taking you back to your account…
        </p>
        <Link href="/account" className="btn btn-secondary">
          Back to account
        </Link>
      </div>
    )
  }

  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div className="label label-sage" style={{ marginBottom: 12 }}>Account security</div>
        <h1 className="h1" style={{ marginBottom: 12 }}>Change password</h1>
        <p className="body-sm" style={{ color: 'var(--stone)' }}>
          {forced
            ? 'You signed in with a temporary password. Please set a new one to continue.'
            : 'Confirm your current password, then choose a new one.'}
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
          <label htmlFor="current" className="form-label">Current password</label>
          <PasswordInput
            id="current"
            required
            autoFocus
            autoComplete="current-password"
            value={current}
            onChange={e => setCurrent(e.target.value)}
            placeholder={forced ? 'Your temporary password' : 'Your current password'}
          />
        </div>

        <div className="form-group">
          <label htmlFor="password" className="form-label">New password</label>
          <PasswordInput
            id="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>

        <div className="form-group">
          <label htmlFor="confirm" className="form-label">Confirm new password</label>
          <PasswordInput
            id="confirm"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat new password"
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

      {!forced && (
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <Link href="/account" style={{ fontSize: 13, color: 'var(--stone)' }}>
            ← Back to account
          </Link>
        </div>
      )}
    </>
  )
}

export default function ChangePasswordPage() {
  return (
    <div className="page-body" style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '80px 24px' }}>
        <Suspense fallback={
          <div style={{ textAlign: 'center', color: 'var(--stone)' }}>Loading…</div>
        }>
          <ChangePasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
