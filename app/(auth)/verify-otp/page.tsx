'use client'

import { useState, useTransition, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function VerifyOtpPageContent() {
  const router      = useRouter()
  const params      = useSearchParams()
  const tempToken   = params.get('token') ?? ''
  const name        = params.get('name') ?? 'there'

  const [digits, setDigits]   = useState(['', '', '', '', '', ''])
  const [error,  setError]    = useState('')
  const [isPending, startTransition] = useTransition()

  // Token can be refreshed by a resend, so track it in state.
  const [token, setToken]         = useState(tempToken)
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState('')
  const [cooldown, setCooldown]   = useState(0)

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Focus first box on mount
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  // Keep token in sync with the URL param on first load.
  useEffect(() => { setToken(tempToken) }, [tempToken])

  // Resend cooldown countdown.
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function handleResend() {
    if (resending || cooldown > 0) return
    setResending(true)
    setResendMsg('')
    setError('')
    try {
      const res  = await fetch('/api/auth/resend-otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tempToken: token }),
      })
      const data = await res.json()
      if (!data.success) {
        setResendMsg(data.error ?? 'Could not resend the code.')
        return
      }
      if (data.tempToken) setToken(data.tempToken)
      setResendMsg('A new code is on its way — check your inbox (and spam).')
      setCooldown(30)
    } catch {
      setResendMsg('Something went wrong. Please try again.')
    } finally {
      setResending(false)
    }
  }

  // If no token in URL, redirect to login
  useEffect(() => {
    if (!tempToken) {
      router.replace('/login')
    }
  }, [tempToken, router])

  const code = digits.join('')

  function handleChange(idx: number, val: string) {
    // Handle paste of full 6-digit code
    if (val.length === 6 && /^\d{6}$/.test(val)) {
      const arr = val.split('')
      setDigits(arr)
      inputRefs.current[5]?.focus()
      return
    }

    const single = val.replace(/\D/g, '').slice(-1)
    const next   = [...digits]
    next[idx]    = single
    setDigits(next)
    if (single && idx < 5) {
      inputRefs.current[idx + 1]?.focus()
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      e.preventDefault()
      setDigits(pasted.split(''))
      inputRefs.current[5]?.focus()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length < 6) { setError('Please enter all 6 digits.'); return }
    setError('')

    startTransition(async () => {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken: token, code }),
      })
      const data = await res.json()

      if (!data.success) {
        setError(data.error ?? 'Invalid code. Please try again.')
        setDigits(['', '', '', '', '', ''])
        inputRefs.current[0]?.focus()
        return
      }

      // Temp-password sign-in: force a new password before anything else
      if (data.mustChangePassword) {
        router.push('/account/change-password?forced=1')
        return
      }

      const role = data.data?.role
      if (role === 'admin' || role === 'staff') {
        router.push('/admin/dashboard')
      } else {
        router.push('/account')
      }
    })
  }

  return (
    <div className="page-body" style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <div style={{ maxWidth: 440, margin: '0 auto', padding: '80px 24px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{
            width: 52, height: 52, margin: '0 auto 20px',
            background: 'var(--sage-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--forest)" strokeWidth="1.5">
              <rect x="5" y="11" width="14" height="10" rx="1"/>
              <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
              <circle cx="12" cy="16" r="1" fill="var(--forest)"/>
            </svg>
          </div>
          <div className="label label-sage" style={{ marginBottom: 12 }}>Two-step verification</div>
          <h1 className="h1" style={{ marginBottom: 12 }}>Enter your code</h1>
          <p className="body-sm">
            Hi {name}, we&rsquo;ve sent a 6-digit code to your email address.
            <br />It expires in 10 minutes.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div style={{
              background: '#F8D7DA', color: '#721C24',
              padding: '12px 16px', marginBottom: 28, fontSize: 14,
            }}>
              {error}
            </div>
          )}

          {/* 6-digit input grid */}
          <div style={{
            display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 36,
          }}>
            {digits.map((d, idx) => (
              <input
                key={idx}
                ref={el => { inputRefs.current[idx] = el }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={d}
                onChange={e => handleChange(idx, e.target.value)}
                onKeyDown={e => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                disabled={isPending}
                style={{
                  width: 52, height: 64,
                  textAlign: 'center',
                  fontSize: 28, fontWeight: 600,
                  fontFamily: 'var(--font-body)',
                  color: 'var(--forest)',
                  border: `2px solid ${d ? 'var(--forest)' : 'var(--light-line)'}`,
                  background: 'var(--warm-white)',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                  caretColor: 'var(--caramel)',
                }}
              />
            ))}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={isPending || code.length < 6}
          >
            {isPending ? 'Verifying…' : 'Verify & Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <Link
            href="/login"
            style={{ fontSize: 13, color: 'var(--stone)' }}
          >
            ← Back to login
          </Link>
        </div>

        <div style={{
          marginTop: 40, padding: '16px 20px',
          background: 'rgba(26,43,24,0.04)',
          border: '1px solid var(--light-line)',
          fontSize: 12, color: 'var(--stone)', lineHeight: 1.7, textAlign: 'center',
        }}>
          Didn&rsquo;t receive the code? Check your spam folder, or{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            style={{
              background: 'none', border: 'none', padding: 0, font: 'inherit',
              color: resending || cooldown > 0 ? 'var(--stone)' : 'var(--caramel)',
              cursor: resending || cooldown > 0 ? 'default' : 'pointer',
              textDecoration: 'underline',
            }}
          >
            {resending ? 'sending…' : cooldown > 0 ? `resend in ${cooldown}s` : 'resend the code'}
          </button>.
          {resendMsg && (
            <div style={{ marginTop: 10, color: 'var(--forest)' }}>{resendMsg}</div>
          )}
          <div style={{ marginTop: 10 }}>
            <Link href="/login" style={{ color: 'var(--stone)' }}>Back to login</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function VerifyOtpPage() {
  return <Suspense fallback={null}><VerifyOtpPageContent /></Suspense>
}
