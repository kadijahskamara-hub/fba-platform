'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { StaffPermission, StaffRow } from '@/lib/types'

// ── Constants ─────────────────────────────────────────────────

const PERMISSION_LABELS: Record<StaffPermission, string> = {
  dashboard:           'Dashboard',
  trade_applications:  'Trade Applications',
  products:            'Products',
  artisans:            'Artisans',
  retail_orders:       'Retail Orders',
  commercial_orders:   'Commercial Orders',
  quote_pipeline:      'Quote Pipeline',
  journals:            'Journals',
  settings:            'Settings',
  users:               'Users',
  contacts:            'Contacts',
}

// ── Component ─────────────────────────────────────────────────

export function ArchivedStaffViewer({ initialStaff }: { initialStaff: StaffRow[] }) {
  const [staff, setStaff] = useState<StaffRow[]>(initialStaff)
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  async function restoreMember(member: StaffRow) {
    const confirmed = confirm(
      `Restore ${member.first_name} ${member.last_name}?\n\n` +
      `Their account will be reactivated and they will be able to log in again. ` +
      `Their previous permissions will remain intact.`
    )
    if (!confirmed) return

    setSaving(member.id)
    try {
      const res = await fetch(`/api/admin/staff/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Restore failed')
      setStaff(prev => prev.filter(m => m.id !== member.id))
      showToast(`${member.first_name} has been restored to active`)
    } catch (e) {
      showToast((e as Error).message, 'error')
    } finally {
      setSaving(null)
    }
  }

  if (staff.length === 0) {
    return (
      <div className="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <h3>No archived staff</h3>
        <p>When you archive a staff member, they will appear here.</p>
        <Link href="/admin/settings/staff" className="btn btn-secondary btn-sm" style={{ marginTop: 16 }}>
          ← Back to Active Staff
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          padding: '14px 20px',
          background: toast.type === 'error' ? 'var(--danger)' : 'var(--success)',
          color: '#fff',
          fontSize: 13, fontWeight: 500, letterSpacing: '0.02em',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          maxWidth: 360,
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {staff.map(member => {
          const perms    = member.staff_permissions?.[0]?.permissions ?? []
          const isAdmin  = member.role === 'admin'
          const isSaving = saving === member.id

          return (
            <div
              key={member.id}
              style={{
                background: 'var(--warm-white)',
                border: '1px solid var(--light-line)',
                padding: '24px 28px',
                opacity: isSaving ? 0.7 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                    <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 300, color: 'var(--forest)' }}>
                      {member.first_name} {member.last_name}
                    </h3>
                    <span className={`badge ${isAdmin ? 'badge-forest' : 'badge-sand'}`}>
                      {member.role}
                    </span>
                    <span className="status-pill" style={{
                      background: 'var(--stone)', color: '#fff',
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
                      textTransform: 'uppercase', padding: '2px 8px',
                    }}>
                      archived
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--stone)' }}>{member.email}</p>
                  {!isAdmin && (
                    <p style={{ fontSize: 11, color: 'var(--stone)', marginTop: 3, opacity: 0.7 }}>
                      Had {perms.length} of 11 permissions
                    </p>
                  )}
                  <p style={{ fontSize: 11, color: 'var(--stone)', marginTop: 4, letterSpacing: '0.05em' }}>
                    Joined {new Date(member.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>

                {/* Restore button */}
                <button
                  className="btn btn-sm"
                  style={{
                    color:       'var(--forest)',
                    border:      '1px solid var(--forest)',
                    background:  'transparent',
                    padding:     '6px 16px',
                    fontSize:    12,
                    fontWeight:  500,
                    letterSpacing: '0.04em',
                    cursor:      'pointer',
                    flexShrink:  0,
                  }}
                  disabled={isSaving}
                  onClick={() => restoreMember(member)}
                >
                  {isSaving ? 'Restoring…' : 'Restore'}
                </button>
              </div>

              {/* Last-known permissions */}
              <div style={{ marginTop: 20 }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.18em',
                  textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 12,
                }}>
                  {isAdmin ? 'Had full admin access' : 'Last-known permissions'}
                </div>

                {isAdmin ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.values(PERMISSION_LABELS).map(label => (
                      <span key={label} className="badge badge-sage" style={{ opacity: 0.6 }}>{label}</span>
                    ))}
                  </div>
                ) : perms.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--stone)', opacity: 0.6, fontStyle: 'italic' }}>
                    No permissions were assigned
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(Object.keys(PERMISSION_LABELS) as StaffPermission[]).map(key => {
                      const granted = perms.includes(key)
                      return (
                        <div key={key} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          fontSize: 12,
                          color: granted ? 'var(--forest)' : 'var(--stone)',
                          opacity: granted ? 0.9 : 0.4,
                        }}>
                          <span style={{
                            width: 14, height: 14, borderRadius: 2, flexShrink: 0,
                            background: granted ? 'var(--forest)' : 'transparent',
                            border: `1px solid ${granted ? 'var(--forest)' : 'var(--light-line)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {granted && (
                              <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          {PERMISSION_LABELS[key]}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
