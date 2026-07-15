'use client'

import { useMemo, useState } from 'react'
import { DeleteAccountDialog } from '@/components/DeleteAccountDialog'

// ── Customer account management (trade + retail) ─────────────
// Staff and admin accounts live under Settings → Staff & Permissions.
// This surface covers everyone else: status control and password resets.

export interface CustomerRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  role: 'trade_user' | 'trade_applicant' | 'retail_customer'
  status: 'active' | 'suspended' | 'archived' | string
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  trade_user:      'Trade',
  trade_applicant: 'Trade Applicant',
  retail_customer: 'Retail',
}

export function UsersManager({
  initialUsers,
  isUltraAdmin = false,
}: {
  initialUsers: CustomerRow[]
  /** Sprint 7: permanent deletion is an Ultra Admin power (never grantable). */
  isUltraAdmin?: boolean
}) {
  const [users, setUsers]   = useState<CustomerRow[]>(initialUsers)
  const [query, setQuery]   = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast]   = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CustomerRow | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return users.filter(u => {
      if (roleFilter && u.role !== roleFilter) return false
      if (!q) return true
      return `${u.first_name ?? ''} ${u.last_name ?? ''} ${u.email}`.toLowerCase().includes(q)
    })
  }, [users, query, roleFilter])

  async function sendResetLink(u: CustomerRow) {
    if (!confirm(`Email a password reset link to ${u.email}?`)) return
    setBusyId(u.id)
    try {
      const res  = await fetch(`/api/admin/users/${u.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'link' }),
      })
      const json = await res.json()
      if (json.success) showToast(`Reset link sent to ${u.email}`)
      else alert(json.error ?? 'Failed to send reset link')
    } catch {
      alert('Network error — please try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function setTempPassword(u: CustomerRow) {
    const pw = prompt(
      `Set a temporary password for ${u.first_name ?? u.email} (min. 8 characters).\n` +
      'Share it with them securely — they should change it after signing in.'
    )
    if (pw === null) return
    if (pw.length < 8) { alert('Password must be at least 8 characters.'); return }
    setBusyId(u.id)
    try {
      const res  = await fetch(`/api/admin/users/${u.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'temp', tempPassword: pw }),
      })
      const json = await res.json()
      if (json.success) showToast(`Temporary password set for ${u.email}`)
      else alert(json.error ?? 'Failed to set password')
    } catch {
      alert('Network error — please try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleStatus(u: CustomerRow) {
    const next = u.status === 'active' ? 'suspended' : 'active'
    if (next === 'suspended' && !confirm(`Suspend ${u.email}? They will not be able to sign in.`)) return
    setBusyId(u.id)
    try {
      const res  = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const json = await res.json()
      if (json.success) {
        setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: next } : x))
        showToast(`${u.email} ${next === 'active' ? 'reactivated' : 'suspended'}`)
      } else {
        alert(json.error ?? 'Failed to update user')
      }
    } catch {
      alert('Network error — please try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 400, marginBottom: 6 }}>Users</h1>
        <p style={{ fontSize: 13, color: 'var(--stone)' }}>
          Trade and retail customer accounts — {users.length} total. Staff and admin accounts are managed under Staff &amp; Permissions.
        </p>
      </div>

      {toast && (
        <div style={{
          padding: '10px 16px', marginBottom: 16, fontSize: 13,
          background: 'var(--sage-light)', color: 'var(--forest)',
          border: '1px solid var(--light-line)',
        }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          className="form-input"
          placeholder="Search name or email…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <select
          className="form-input"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          style={{ maxWidth: 200 }}
        >
          <option value="">All roles</option>
          <option value="trade_user">Trade</option>
          <option value="trade_applicant">Trade Applicant</option>
          <option value="retail_customer">Retail</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--stone)', padding: 24, textAlign: 'center' }}>
            No users match.
          </p>
        )}
        {filtered.map(u => {
          const suspended = u.status === 'suspended'
          const busy = busyId === u.id
          return (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
              padding: '14px 18px', border: '1px solid var(--light-line)',
              background: suspended ? 'var(--sage-light)' : 'var(--warm-white)',
            }}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--forest)' }}>
                  {(u.first_name || u.last_name) ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : '—'}
                  {suspended && <span style={{ marginLeft: 8, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--danger)' }}>Suspended</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--stone)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
              </div>
              <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--stone)', width: 110 }}>
                {ROLE_LABELS[u.role] ?? u.role}
              </div>
              <div style={{ fontSize: 12, color: 'var(--stone)', width: 90 }}>
                {new Date(u.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => sendResetLink(u)}>
                  Send Reset Link
                </button>
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setTempPassword(u)}>
                  Temp Password
                </button>
                <button
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => toggleStatus(u)}
                  style={{
                    color: suspended ? 'var(--success)' : 'var(--danger)',
                    border: `1px solid ${suspended ? 'var(--success)' : 'var(--danger)'}`,
                    background: 'transparent', padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                  }}
                >
                  {suspended ? 'Reactivate' : 'Suspend'}
                </button>
                {/* Delete — Ultra Admin only (Sprint 7 Part B) */}
                {isUltraAdmin && (
                  <button
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() => setDeleteTarget(u)}
                    title="Permanently delete this account — Ultra Admin only, cannot be undone"
                    style={{
                      color: '#fff', background: 'var(--danger)',
                      border: '1px solid var(--danger)', padding: '6px 14px',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Delete…
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Permanent deletion dialog (Ultra Admin only) */}
      {deleteTarget && (
        <DeleteAccountDialog
          account={{
            id: deleteTarget.id,
            email: deleteTarget.email,
            name: `${deleteTarget.first_name ?? ''} ${deleteTarget.last_name ?? ''}`.trim() || deleteTarget.email,
            role: deleteTarget.role,
          }}
          onClose={() => setDeleteTarget(null)}
          onDeleted={acc => {
            setUsers(prev => prev.filter(x => x.id !== acc.id))
            setDeleteTarget(null)
            showToast(`${acc.email} permanently deleted`)
          }}
        />
      )}
    </div>
  )
}
