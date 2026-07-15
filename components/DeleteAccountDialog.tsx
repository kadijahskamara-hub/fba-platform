'use client'

import { useState } from 'react'

// ============================================================
// Permanent account deletion dialog (Sprint 7 Part B).
// Ultra Admin only — the button that opens this dialog is only
// rendered for Ultra Admins, and the API re-checks live.
//
// Two-step-final: archive/suspend remain the first-line actions;
// this is the irreversible act. Requires the target's email to
// be retyped exactly plus a written reason.
// ============================================================

export interface DeletableAccount {
  id: string
  email: string
  name: string
  role: string
}

export function DeleteAccountDialog({
  account,
  onClose,
  onDeleted,
}: {
  account: DeletableAccount
  onClose: () => void
  onDeleted: (account: DeletableAccount) => void
}) {
  const [confirmEmail, setConfirmEmail] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const emailMatches = confirmEmail.trim().toLowerCase() === account.email.trim().toLowerCase()
  const canSubmit = emailMatches && reason.trim().length > 0 && !busy

  async function handleDelete() {
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${account.id}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim(), confirmEmail: confirmEmail.trim() }),
      })
      const json = await res.json()
      if (!json.success) {
        setError(json.error ?? 'Deletion failed')
        return
      }
      onDeleted(account)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(20,28,18,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div style={{
        background: 'var(--warm-white)', border: '1.5px solid var(--danger)',
        maxWidth: 520, width: '100%', padding: '28px 32px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.2em',
          textTransform: 'uppercase', color: 'var(--danger)', marginBottom: 16,
        }}>
          Permanently delete account
        </div>

        <p style={{ fontSize: 14, color: 'var(--forest)', marginBottom: 6, fontWeight: 500 }}>
          {account.name} — {account.email}
        </p>
        <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 16, textTransform: 'capitalize' }}>
          {account.role.replace(/_/g, ' ')} account
        </p>

        <div style={{
          fontSize: 13, color: 'var(--forest)', lineHeight: 1.6,
          background: 'rgba(176,58,46,0.06)', border: '1px solid rgba(176,58,46,0.25)',
          padding: '12px 16px', marginBottom: 20,
        }}>
          <strong>This cannot be undone.</strong> The account is removed as a person:
          personal details are erased, sign-in is permanently revoked, and personal
          data (carts, projects, tokens, permissions) is destroyed. Financial and
          audit history is preserved in anonymised form, as required for the
          business records. If you only need to block access, use Suspend or
          Archive instead.
        </div>

        <label className="form-label">Type the account email to confirm *</label>
        <input
          className="form-input"
          value={confirmEmail}
          onChange={e => setConfirmEmail(e.target.value)}
          placeholder={account.email}
          autoComplete="off"
          style={{ marginBottom: 4 }}
        />
        {confirmEmail.length > 0 && !emailMatches && (
          <p style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 8 }}>Email does not match.</p>
        )}

        <label className="form-label" style={{ marginTop: 12 }}>Reason for deletion *</label>
        <textarea
          className="form-input"
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. GDPR erasure request received 15 Jul 2026"
          style={{ resize: 'vertical', marginBottom: 12 }}
        />

        {error && (
          <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 12 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-sm"
            disabled={!canSubmit}
            onClick={handleDelete}
            style={{
              background: canSubmit ? 'var(--danger)' : 'rgba(176,58,46,0.35)',
              color: '#fff', border: 'none', padding: '8px 18px',
              fontSize: 12, fontWeight: 600, letterSpacing: '0.06em',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  )
}
