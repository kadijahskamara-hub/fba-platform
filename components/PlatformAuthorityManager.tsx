'use client'

import { useState } from 'react'
import { appConfirm } from '@/lib/appConfirm'
import { PURGE_CONFIRM_PHRASE, PURGE_SECTIONS } from '@/lib/commercial/authorityLogic'

// ============================================================
// Platform authority manager (Sprint 7 Part B) — Ultra only.
// Grant/revoke Ultra Admin on admin accounts. Rules surfaced in
// the UI and enforced by the API + atomic SQL fn + DB trigger:
//  • only active admin accounts can hold Ultra authority;
//  • you cannot revoke your own authority;
//  • the platform always retains ≥1 active Ultra Admin.
// ============================================================

export interface AdminAccountRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  role: string
  status: string
  is_ultra_admin: boolean
  created_at: string
}

export function PlatformAuthorityManager({
  initialAdmins,
  initialUltraCount,
  selfId,
}: {
  initialAdmins: AdminAccountRow[]
  initialUltraCount: number
  selfId: string
}) {
  const [admins, setAdmins] = useState<AdminAccountRow[]>(initialAdmins)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const activeUltraCount = admins.filter(a => a.is_ultra_admin && a.status === 'active').length || initialUltraCount

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4500)
  }

  async function setAuthority(target: AdminAccountRow, grant: boolean) {
    const verb = grant ? 'Grant' : 'Revoke'
    const detail = grant
      ? `${target.first_name ?? target.email} will hold FULL platform authority: every permission, protected settings, and permanent account deletion.`
      : `${target.first_name ?? target.email} will lose platform authority and return to ordinary admin access.`
    if (!await appConfirm(`${verb} Ultra Admin authority?\n\n${detail}`)) return

    setBusyId(target.id)
    try {
      const res = await fetch('/api/admin/authority', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: target.id, grant }),
      })
      const json = await res.json()
      if (!json.success) {
        showToast(json.error ?? 'Authority change failed', 'error')
        return
      }
      setAdmins(prev => prev.map(a => a.id === target.id ? { ...a, is_ultra_admin: grant } : a))
      showToast(`Ultra Admin ${grant ? 'granted to' : 'revoked from'} ${target.email}`)
    } catch {
      showToast('Network error — please try again.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ maxWidth: 860 }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          padding: '14px 20px',
          background: toast.type === 'error' ? 'var(--danger)' : 'var(--success)',
          color: '#fff', fontSize: 13, fontWeight: 500, maxWidth: 380,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 400, marginBottom: 6 }}>
          Platform Authority
        </h1>
        <p style={{ fontSize: 13, color: 'var(--stone)', lineHeight: 1.6 }}>
          Ultra Admins hold overall authority over the platform: every permission,
          protected settings, and permanent account deletion. Authority is granted
          and revoked only by an existing Ultra Admin. The platform always retains
          at least one active Ultra Admin — the database refuses any change that
          would leave zero.
        </p>
      </div>

      <div style={{
        fontSize: 12, color: 'var(--stone)', marginBottom: 16,
        padding: '10px 14px', background: 'var(--sage-light)',
        border: '1px solid var(--light-line)',
      }}>
        {activeUltraCount} active Ultra Admin{activeUltraCount !== 1 ? 's' : ''} ·
        {' '}You cannot revoke your own authority.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {admins.map(a => {
          const isSelf = a.id === selfId
          const busy = busyId === a.id
          const isLastUltra = a.is_ultra_admin && a.status === 'active' && activeUltraCount <= 1
          return (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
              padding: '16px 20px', border: `1px solid ${a.is_ultra_admin ? 'var(--forest)' : 'var(--light-line)'}`,
              background: 'var(--warm-white)',
            }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--forest)' }}>
                  {`${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || '—'}
                  {isSelf && <span style={{ fontSize: 11, color: 'var(--stone)', marginLeft: 6 }}>(you)</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--stone)' }}>{a.email}</div>
              </div>

              <span className={`status-pill status-${a.status}`}>{a.status}</span>

              {a.is_ultra_admin ? (
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                  background: 'var(--forest)', color: 'var(--cream)', padding: '4px 10px',
                }}>
                  Ultra Admin
                </span>
              ) : (
                <span style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
                  border: '1px solid var(--light-line)', color: 'var(--stone)', padding: '3px 10px',
                }}>
                  Admin
                </span>
              )}

              <div style={{ marginLeft: 'auto' }}>
                {a.is_ultra_admin ? (
                  <button
                    className="btn btn-sm"
                    disabled={busy || isSelf || isLastUltra || a.status !== 'active'}
                    title={
                      isSelf ? 'You cannot revoke your own authority'
                        : isLastUltra ? 'The platform must always retain at least one active Ultra Admin'
                          : 'Revoke Ultra Admin authority'
                    }
                    onClick={() => setAuthority(a, false)}
                    style={{
                      color: 'var(--danger)', border: '1px solid var(--danger)',
                      background: 'transparent', padding: '6px 14px', fontSize: 12,
                      cursor: (busy || isSelf || isLastUltra) ? 'not-allowed' : 'pointer',
                      opacity: (isSelf || isLastUltra) ? 0.5 : 1,
                    }}
                  >
                    {busy ? 'Working…' : 'Revoke authority'}
                  </button>
                ) : (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy || a.status !== 'active'}
                    title={a.status !== 'active' ? 'Only active admin accounts can hold Ultra authority' : 'Grant Ultra Admin authority'}
                    onClick={() => setAuthority(a, true)}
                  >
                    {busy ? 'Working…' : 'Grant authority'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: 12, color: 'var(--stone)', marginTop: 20, lineHeight: 1.6 }}>
        Only admin accounts are listed — promote a staff member to admin under
        Staff &amp; Permissions before granting authority. Every grant and revoke
        is written to the audit log with actor, target and before/after state.
      </p>

      <SectionResetPanel onToast={showToast} />

      <PurgeDangerZone onToast={showToast} />
    </div>
  )
}

// ── Danger zone: per-section resets (Sprint 19) ───────────────

function SectionResetPanel({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const [reason, setReason] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})

  async function handleSectionPurge(section: string, label: string) {
    if (reason.trim().length === 0 || busyKey) return
    if (!await appConfirm(
      `Delete ALL data in “${label}”?\n\n` +
      'Every record in this section is permanently removed and its document ' +
      'numbering restarts at 0001. Other sections are untouched.\n\n' +
      'There is no undo. Continue?'
    )) return
    setBusyKey(section)
    try {
      const res = await fetch('/api/admin/authority/purge-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, reason: reason.trim() }),
      })
      const json = await res.json()
      if (!json.success) {
        onToast(json.error ?? 'Section reset failed', 'error')
        return
      }
      const n = json.data?.rows_deleted ?? 0
      setResults(prev => ({ ...prev, [section]: `${n} row${n === 1 ? '' : 's'} deleted` }))
      onToast(`${label}: ${n} rows deleted`)
    } catch {
      onToast('Network error — please try again.', 'error')
    } finally {
      setBusyKey(null)
    }
  }

  const armed = reason.trim().length > 0

  return (
    <div style={{
      marginTop: 40, border: '1.5px solid var(--danger)',
      background: 'rgba(176,58,46,0.03)', padding: '24px 28px',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: 'var(--danger)', marginBottom: 12,
      }}>
        Danger zone — reset one section
      </div>
      <p style={{ fontSize: 13, color: 'var(--forest)', lineHeight: 1.7, marginBottom: 16 }}>
        Delete <strong>all</strong> records in a single business section, leaving everything
        else intact — built for targeted test-data resets. Sections that other data depends
        on refuse to run and tell you which section to clear first. Every reset is audited
        with actor, reason and per-table counts. <strong>No undo.</strong>
      </p>

      <div style={{ maxWidth: 520, marginBottom: 18 }}>
        <label className="form-label">Reason (applies to each reset below) *</label>
        <input
          className="form-input"
          value={reason}
          maxLength={500}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. clearing test data for a fresh QA round"
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PURGE_SECTIONS.map(s => (
          <div key={s.key} style={{
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            padding: '10px 14px', border: '1px solid var(--light-line)', background: 'var(--warm-white)',
          }}>
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--forest)' }}>{s.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--stone)' }}>{s.hint}</div>
            </div>
            {results[s.key] && (
              <span style={{ fontSize: 11.5, color: '#155724', fontWeight: 600 }}>{results[s.key]}</span>
            )}
            <button
              className="btn btn-sm"
              disabled={!armed || busyKey !== null}
              title={armed ? `Delete all ${s.label}` : 'Enter a reason first'}
              onClick={() => handleSectionPurge(s.key, s.label)}
              style={{
                color: '#fff', border: 'none', padding: '7px 16px',
                fontSize: 11.5, fontWeight: 700,
                background: armed ? 'var(--danger)' : 'rgba(176,58,46,0.35)',
                cursor: armed && !busyKey ? 'pointer' : 'not-allowed',
              }}
            >
              {busyKey === s.key ? 'Deleting…' : 'Delete all'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Danger zone: purge ALL commercial data (Sprint 7.1) ───────

function PurgeDangerZone({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const [phrase, setPhrase] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string>('')

  const armed = phrase.trim() === PURGE_CONFIRM_PHRASE && reason.trim().length > 0

  async function handlePurge() {
    if (!armed || busy) return
    if (!await appConfirm(
      'FINAL CONFIRMATION\n\n' +
      'This permanently deletes EVERY quote, order, purchase order, invoice, ' +
      'payment, credit note, refund, delivery, installation, document and ' +
      'accounting period on the platform, and restarts document numbering at 0001.\n\n' +
      'Products, artisans, user accounts, contacts and settings are NOT affected.\n\n' +
      'There is no undo. Continue?'
    )) return
    setBusy(true)
    setResult('')
    try {
      const res = await fetch('/api/admin/authority/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmPhrase: phrase.trim(), reason: reason.trim() }),
      })
      const json = await res.json()
      if (!json.success) {
        onToast(json.error ?? 'Purge failed', 'error')
        return
      }
      const n = json.data?.rows_deleted ?? 0
      setResult(`Purge complete — ${n} rows deleted. Document numbering restarts at 0001.`)
      setPhrase('')
      setReason('')
      onToast(`Commercial data purged (${n} rows)`)
    } catch {
      onToast('Network error — please try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      marginTop: 40, border: '1.5px solid var(--danger)',
      background: 'rgba(176,58,46,0.03)', padding: '24px 28px',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: 'var(--danger)', marginBottom: 12,
      }}>
        Danger zone — delete all commercial data
      </div>
      <p style={{ fontSize: 13, color: 'var(--forest)', lineHeight: 1.7, marginBottom: 16 }}>
        Built for the pre-launch reset: permanently deletes <strong>every</strong> quote/proforma,
        commercial order, purchase order, invoice, payment, credit note, refund, delivery,
        installation, generated document, prepared communication, export run and accounting
        period — then restarts all document numbering at 0001. Products, artisans, user
        accounts, contacts and settings are untouched. Fully audited. <strong>No undo.</strong>
      </p>

      <div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
        <div>
          <label className="form-label">Type <strong>{PURGE_CONFIRM_PHRASE}</strong> to confirm *</label>
          <input
            className="form-input"
            value={phrase}
            onChange={e => setPhrase(e.target.value)}
            placeholder={PURGE_CONFIRM_PHRASE}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="form-label">Reason *</label>
          <input
            className="form-input"
            value={reason}
            maxLength={500}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. clearing test data before go-live"
          />
        </div>
        <div>
          <button
            className="btn btn-sm"
            disabled={!armed || busy}
            onClick={handlePurge}
            style={{
              background: armed ? 'var(--danger)' : 'rgba(176,58,46,0.35)',
              color: '#fff', border: 'none', padding: '10px 22px',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
              cursor: armed && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            {busy ? 'Purging…' : 'Purge all commercial data'}
          </button>
        </div>
        {result && (
          <p style={{ fontSize: 12.5, color: '#155724', fontWeight: 600 }}>{result}</p>
        )}
      </div>
    </div>
  )
}
