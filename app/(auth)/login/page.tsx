'use client'

import { useState, useTransition, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginPageContent() {
  const router  = useRouter()
  const params  = useSearchParams()
  const next    = params.get('next') ?? '/account'

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    startTransition(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (!data.success) {
        setError(data.error ?? 'Login failed. Please check your credentials.')
        return
      }

      // Staff/admin with OTP enabled: go to verification step
      if (data.requiresOtp && data.tempToken) {
        const name = encodeURIComponent(data.data?.firstName ?? '')
        const tok  = encodeURIComponent(data.tempToken)
        router.push('/verify-otp?token=' + tok + '&name=' + name)
        return
      }

      // Direct session — navigate to the appropriate area.
      // Do NOT call router.refresh() here: it races with router.push() and can
      // cause the login page to flash back. The destination page server-renders
      // with the newly-set cookie, so refresh is unnecessary.
      const role = data.data?.role
      if (role === 'admin' || role === 'staff') {
        router.push('/admin/dashboard')
      } else {
        router.push(next)
      }
    })
  }

  return (
    <div className="page-body" style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '80px 24px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div className="label label-sage" style={{ marginBottom: 12 }}>Welcome back</div>
          <h1 className="h1" style={{ marginBottom: 12 }}>Log In</h1>
          <p className="body-sm">
            New here?{' '}
            <Link href="/register" style={{ color: 'var(--caramel)' }}>Create an account</Link>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div style={{
              background: '#F8D7DA', color: '#721C24', padding: '12px 16px',
              marginBottom: 24, fontSize: 14,
            }}>
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email" className="form-label">Email address</label>
            <input
              id="email" type="email" required
              className="form-input"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <input
              id="password" type="password" required
              className="form-input"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <div style={{ textAlign: 'right', marginBottom: 28 }}>
            <Link href="/forgot-password" style={{ fontSize: 13, color: 'var(--stone)' }}>
              Forgot password?
            </Link>
          </div>

          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={isPending}>
            {isPending ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Trade account CTA */}
        <div className="divider-full" style={{ margin: '40px 0' }} />
        <div style={{ textAlign: 'center' }}>
          <p className="body-sm" style={{ marginBottom: 16 }}>
            Looking to apply for a trade account?
          </p>
          <Link href="/trade/apply" className="btn btn-secondary">
            Apply for Trade Access
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginPageContent /></Suspense>
}
