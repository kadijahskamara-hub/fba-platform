'use client'

// Sprint 7.1 — one "Reset Password" button with a small menu,
// replacing the separate "Send Reset Link" / "Temp Password"
// buttons on the staff and customer management screens.
//  • Email reset link: the user sets their own password (secure default).
//  • Set temporary password: for when email fails or the person is
//    with you — they must change it at next sign-in.

import { useEffect, useRef, useState } from 'react'

export function ResetPasswordMenu({
  userId,
  email,
  firstName,
  disabled = false,
  onResult,
}: {
  userId: string
  email: string
  firstName?: string | null
  disabled?: boolean
  onResult: (msg: string, type: 'success' | 'error') => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  async function call(body: Record<string, unknown>, okMsg: string) {
    setBusy(true)
    setOpen(false)
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.success) onResult(okMsg, 'success')
      else onResult(json.error ?? 'Password reset failed', 'error')
    } catch {
      onResult('Network error — please try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  function sendLink() {
    if (!confirm(`Email a password reset link to ${email}?`)) return
    call({ mode: 'link' }, `Reset link sent to ${email}`)
  }

  function setTemp() {
    const pw = prompt(
      `Set a temporary password for ${firstName || email} (min. 8 characters).\n` +
      'Share it with them securely — they must change it after signing in.'
    )
    if (pw === null) return
    if (pw.length < 8) { onResult('Password must be at least 8 characters.', 'error'); return }
    call({ mode: 'temp', tempPassword: pw }, `Temporary password set for ${email}`)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn btn-secondary btn-sm"
        disabled={disabled || busy}
        onClick={() => setOpen(o => !o)}
      >
        {busy ? 'Working…' : <>Reset Password <span style={{ fontSize: 9 }}>▾</span></>}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 200, marginTop: 4,
          background: 'var(--warm-white)', border: '1px solid var(--light-line)',
          boxShadow: '0 6px 24px rgba(0,0,0,0.12)', minWidth: 230,
        }}>
          <button
            onClick={sendLink}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
              background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12.5,
              color: 'var(--forest)',
            }}
          >
            <div style={{ fontWeight: 600 }}>Email reset link</div>
            <div style={{ fontSize: 11, color: 'var(--stone)' }}>They choose their own new password</div>
          </button>
          <button
            onClick={setTemp}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
              background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12.5,
              color: 'var(--forest)', borderTop: '1px solid var(--light-line)',
            }}
          >
            <div style={{ fontWeight: 600 }}>Set temporary password</div>
            <div style={{ fontSize: 11, color: 'var(--stone)' }}>For when email isn&rsquo;t working — must be changed at sign-in</div>
          </button>
        </div>
      )}
    </div>
  )
}
