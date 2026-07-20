'use client'

// ============================================================
// Public signup popup (lead-capture modal) — Sprint 25.
//
// Self-contained: fetches its config from /api/signup-popup
// (which returns { active: false } for staff or when disabled),
// honours the configured trigger (delay / scroll / exit intent)
// and the suppression window, and posts captures back. Never
// renders on /admin, auth or account routes.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { isSuppressed, normalizeSignupPopupConfig, type SignupPopupConfig } from '@/lib/signupPopup'

const DISMISS_STORE = 'fba-signup-popup-dismissed'
const DONE_STORE = 'fba-signup-popup-done'

const EXCLUDED_PREFIXES = ['/admin', '/account', '/login', '/register', '/verify-otp', '/reset-password', '/forgot-password', '/checkout', '/delivery', '/accept', '/supplier']

export default function SignupPopup() {
  const pathname = usePathname()
  const [config, setConfig] = useState<SignupPopupConfig | null>(null)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [audience, setAudience] = useState<'retail' | 'trade' | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const armedRef = useRef(false)

  const excluded = EXCLUDED_PREFIXES.some(p => pathname?.startsWith(p))

  // Fetch config once (skipped entirely on excluded routes).
  useEffect(() => {
    if (excluded) return
    if (typeof window !== 'undefined' && window.localStorage.getItem(DONE_STORE)) return
    fetch('/api/signup-popup')
      .then(r => r.json())
      .then(json => {
        if (!json?.active) return
        const cfg = normalizeSignupPopupConfig({ ...json.config, enabled: true })
        if (isSuppressed(cfg, window.localStorage.getItem(DISMISS_STORE))) return
        setConfig(cfg)
      })
      .catch(() => { /* popup is never worth an error */ })
  }, [excluded])

  const fire = useCallback(() => {
    if (armedRef.current) return
    armedRef.current = true
    setOpen(true)
  }, [])

  // Arm the configured trigger.
  useEffect(() => {
    if (!config || excluded) return
    if (config.trigger === 'delay') {
      const t = window.setTimeout(fire, config.delaySeconds * 1000)
      return () => window.clearTimeout(t)
    }
    if (config.trigger === 'scroll') {
      const onScroll = () => {
        const doc = document.documentElement
        const max = doc.scrollHeight - window.innerHeight
        if (max > 0 && (window.scrollY / max) * 100 >= config.scrollPercent) fire()
      }
      window.addEventListener('scroll', onScroll, { passive: true })
      return () => window.removeEventListener('scroll', onScroll)
    }
    // exit intent: pointer leaves through the top of the viewport
    const onLeave = (e: MouseEvent) => { if (e.clientY <= 0) fire() }
    document.addEventListener('mouseout', onLeave)
    return () => document.removeEventListener('mouseout', onLeave)
  }, [config, excluded, fire])

  const dismiss = () => {
    setOpen(false)
    try { window.localStorage.setItem(DISMISS_STORE, new Date().toISOString()) } catch { /* ignore */ }
  }

  const submit = async () => {
    if (!audience) { setError('Please choose one.'); return }
    setBusy(true); setError(null)
    const res = await fetch('/api/signup-popup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), audience }),
    }).then(r => r.json()).catch(() => ({ success: false, error: 'Something went wrong — please try again.' }))
    setBusy(false)
    if (!res.success) { setError(res.error ?? 'Something went wrong — please try again.'); return }
    setDone(true)
    try { window.localStorage.setItem(DONE_STORE, '1') } catch { /* ignore */ }
  }

  if (!config || !open || excluded) return null

  return (
    <div
      role="dialog" aria-modal="true" aria-label={config.headline}
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(26,43,24,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', width: 'min(880px, 96vw)', maxHeight: '90vh',
          background: 'var(--warm-white, #FDFAF7)', overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(26,43,24,0.35)',
        }}
      >
        {/* Image half — hidden on narrow screens via aspect trick */}
        {config.imageUrl && (
          <div style={{ flex: '1 1 45%', minWidth: 0, display: 'flex' }} className="signup-popup-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={config.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        {/* Form half */}
        <div style={{ flex: '1 1 55%', padding: '40px 36px', position: 'relative', overflowY: 'auto' }}>
          <button
            onClick={dismiss} aria-label="Close"
            style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--stone, #5C5245)' }}
          >
            ×
          </button>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'var(--caramel, #6E5233)', marginBottom: 18 }}>
              Full Bloom Artelier
            </div>

            {done ? (
              <>
                <h2 style={{ fontSize: 26, color: 'var(--forest, #1A2B18)', marginBottom: 12 }}>Thank you</h2>
                <p style={{ fontSize: 14, color: 'var(--stone, #5C5245)', marginBottom: 16 }}>{config.successMessage}</p>
                {config.discountCode && (
                  <div style={{ display: 'inline-block', padding: '10px 22px', border: '1.5px dashed var(--caramel, #6E5233)', fontSize: 16, letterSpacing: '0.14em', color: 'var(--forest, #1A2B18)', marginBottom: 16 }}>
                    {config.discountCode}
                  </div>
                )}
                <div>
                  <button onClick={dismiss} className="btn btn-primary btn-sm">Continue browsing</button>
                </div>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: 30, lineHeight: 1.15, color: 'var(--forest, #1A2B18)', marginBottom: 6 }}>{config.headline}</h2>
                {config.offerText && (
                  <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--forest, #1A2B18)', marginBottom: 12 }}>{config.offerText}</div>
                )}
                {config.subheadline && (
                  <p style={{ fontSize: 14, color: 'var(--stone, #5C5245)', marginBottom: 20 }}>{config.subheadline}</p>
                )}

                <div style={{ fontSize: 13, color: 'var(--forest, #1A2B18)', marginBottom: 10 }}>You are:</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 26, marginBottom: 20 }}>
                  {config.audiences.map(a => (
                    <label key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', color: 'var(--forest, #1A2B18)' }}>
                      <input
                        type="radio" name="fba-popup-audience" checked={audience === a.key}
                        onChange={() => setAudience(a.key)}
                      />
                      {a.label}
                    </label>
                  ))}
                </div>

                <input
                  type="email" placeholder="Enter your email address."
                  value={email} onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submit() }}
                  style={{
                    width: '100%', maxWidth: 340, padding: '13px 20px', fontSize: 14,
                    border: '1px solid var(--light-line, #DDD5C8)', borderRadius: 999,
                    background: '#fff', textAlign: 'center', marginBottom: 14,
                  }}
                />

                {error && <div style={{ fontSize: 13, color: '#a03030', marginBottom: 10 }}>{error}</div>}

                <div>
                  <button
                    onClick={submit} disabled={busy || !email.trim()}
                    style={{
                      padding: '14px 44px', borderRadius: 999, fontSize: 14, letterSpacing: '0.04em',
                      background: 'var(--forest, #1A2B18)', color: '#fff', border: 'none',
                      cursor: busy ? 'wait' : 'pointer', opacity: busy || !email.trim() ? 0.7 : 1,
                    }}
                  >
                    {busy ? 'Signing up…' : config.buttonLabel}
                  </button>
                </div>

                {config.finePrint && (
                  <p style={{ fontSize: 11, color: 'var(--stone, #5C5245)', marginTop: 18, lineHeight: 1.5 }}>{config.finePrint}</p>
                )}
                <p style={{ fontSize: 10, color: 'var(--stone, #5C5245)', marginTop: 10, lineHeight: 1.5, opacity: 0.85 }}>{config.consentText}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
