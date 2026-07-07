'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PasswordInput } from '@/components/PasswordInput'

export default function RegisterPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '',
    password: '', confirmPassword: '',
    consentMarketing: false,
  })
  const [errors,   setErrors]   = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState('')
  const [isPending, startTransition] = useTransition()

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.firstName.trim())  errs.firstName = 'Required'
    if (!form.lastName.trim())   errs.lastName  = 'Required'
    if (!form.email.includes('@')) errs.email   = 'Valid email required'
    if (form.password.length < 8) errs.password = 'Minimum 8 characters'
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match'
    return errs
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError('')
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    startTransition(async () => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName:  form.lastName,
          email:     form.email,
          password:  form.password,
          consentMarketing: form.consentMarketing,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setApiError(data.error ?? 'Registration failed. Please try again.')
        return
      }
      router.push('/account')
    })
  }

  return (
    <div className="page-body" style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '80px 24px' }}>

        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div className="label label-sage" style={{ marginBottom: 12 }}>Join Full Bloom Artelier</div>
          <h1 className="h1" style={{ marginBottom: 12 }}>Create Your Account</h1>
          <p className="body-sm">
            Already have an account?{' '}
            <Link href="/login" style={{ color: 'var(--caramel)' }}>Sign in</Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {apiError && (
            <div style={{
              background: '#F8D7DA', color: '#721C24', padding: '12px 16px',
              marginBottom: 24, fontSize: 14,
            }}>
              {apiError}
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="firstName" className="form-label">First name</label>
              <input id="firstName" type="text" required className={`form-input${errors.firstName ? ' error' : ''}`}
                autoComplete="given-name" value={form.firstName} onChange={set('firstName')} />
              {errors.firstName && <p className="form-error">{errors.firstName}</p>}
            </div>
            <div className="form-group">
              <label htmlFor="lastName" className="form-label">Last name</label>
              <input id="lastName" type="text" required className={`form-input${errors.lastName ? ' error' : ''}`}
                autoComplete="family-name" value={form.lastName} onChange={set('lastName')} />
              {errors.lastName && <p className="form-error">{errors.lastName}</p>}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email" className="form-label">Email address</label>
            <input id="email" type="email" required className={`form-input${errors.email ? ' error' : ''}`}
              autoComplete="email" value={form.email} onChange={set('email')} />
            {errors.email && <p className="form-error">{errors.email}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <PasswordInput id="password" required className={`form-input${errors.password ? ' error' : ''}`}
              autoComplete="new-password" value={form.password} onChange={set('password')} />
            {errors.password && <p className="form-error">{errors.password}</p>}
            <p className="form-hint">Minimum 8 characters</p>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword" className="form-label">Confirm password</label>
            <PasswordInput id="confirmPassword" required
              className={`form-input${errors.confirmPassword ? ' error' : ''}`}
              autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} />
            {errors.confirmPassword && <p className="form-error">{errors.confirmPassword}</p>}
          </div>

          <div className="form-group">
            <label className="form-checkbox">
              <input type="checkbox" checked={form.consentMarketing}
                onChange={set('consentMarketing')} />
              <span style={{ fontSize: 13, color: 'var(--stone)', lineHeight: 1.5 }}>
                I'd like to receive updates on new products, artisan stories and studio news.
              </span>
            </label>
          </div>

          <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 24, lineHeight: 1.6 }}>
            By creating an account you agree to our{' '}
            <Link href="/privacy" style={{ color: 'var(--caramel)' }}>Privacy Policy</Link>{' '}
            and{' '}
            <Link href="/terms" style={{ color: 'var(--caramel)' }}>Terms of Use</Link>.
          </p>

          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={isPending}>
            {isPending ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <div className="divider-full" style={{ margin: '40px 0' }} />
        <div style={{ textAlign: 'center' }}>
          <p className="body-sm" style={{ marginBottom: 16 }}>
            Are you a trade professional? Apply for a trade account for access to trade pricing.
          </p>
          <Link href="/trade/apply" className="btn btn-secondary">
            Apply for Trade Access
          </Link>
        </div>
      </div>
    </div>
  )
}
