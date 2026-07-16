'use client'

import Link from 'next/link'
import { appConfirm } from '@/lib/appConfirm'
import { useState } from 'react'
import type { StaffPermission, StaffRow } from '@/lib/types'
import { DeleteAccountDialog } from '@/components/DeleteAccountDialog'
import { ResetPasswordMenu } from '@/components/ResetPasswordMenu'

// ── Constants ─────────────────────────────────────────────────

const PERMISSION_LABELS: Record<StaffPermission, string> = {
  dashboard:           'Dashboard',
  trade_applications:  'Trade Applications',
  products:            'Products',
  artisans:            'Artisans',
  retail_orders:       'Retail Orders',
  commercial_orders:   'Commercial Orders',
  quote_pipeline:      'Quote Pipeline (legacy: view/create/edit)',
  journals:            'Journals',
  settings:            'Settings',
  users:               'Users',
  contacts:            'Contacts',
  // Granular commercial permissions (Sprint 1)
  quote_pipeline_view:     'Quotes — view pipeline',
  quote_create:            'Quotes — create',
  quote_edit:              'Quotes — edit lines & details',
  quote_price_edit:        'Quotes — edit costs & pricing',
  quote_discount_override: 'Quotes — apply discounts',
  quote_approve:           'Quotes — approve (Commercial Admin)',
  commercial_settings_view: 'Commercial settings — view',
  invoice_create:          'Invoices — create',
  invoice_issue:           'Invoices — issue',
  payment_view:            'Payments — view',
  purchase_order_prepare:  'Purchase orders — prepare (future)',
  purchase_order_approve:  'Purchase orders — approve (future)',
  // Delivery & logistics (Sprint 4)
  delivery_view:           'Deliveries — view',
  delivery_create:         'Deliveries — create & edit',
  delivery_dispatch:       'Deliveries — dispatch (issues delivery note)',
  delivery_confirm:        'Deliveries — confirmation links & exceptions',
  pod_record:              'Deliveries — record proof of delivery',
  installation_manage:     'Installations — manage & sign off',
  // Documents & prepared communications (Sprint 5)
  document_generate:       'Documents — generate & regenerate PDFs',
  document_verify:         'Documents — verify stored file checksums',
  communication_prepare:   'Communications — prepare & edit packs',
  communication_mark_sent: 'Communications — mark packs as sent',
  // Accounting controls (Sprint 6)
  accounting_view:         'Accounting — view periods, exports & reports',
  accounting_export:       'Accounting — run financial exports',
  reconciliation_manage:   'Accounting — mark reconciled / excluded',
  refund_record:           'Refunds — record (approval is Ultra-only)',
  invoice_void:            'Invoices — void (blocked by locked periods)',
}

const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as StaffPermission[]

// ── Types ─────────────────────────────────────────────────────

interface StaffEditorProps {
  initialStaff: StaffRow[]
  currentUserId: string
  archivedCount?: number
  /** Sprint 7: permanent deletion is an Ultra Admin power (never grantable). */
  isUltraAdmin?: boolean
}

// ── Main Component ────────────────────────────────────────────

export function StaffEditor({ initialStaff, currentUserId, archivedCount = 0, isUltraAdmin = false }: StaffEditorProps) {
  const [staff, setStaff]     = useState<StaffRow[]>(initialStaff)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving]   = useState<string | null>(null)
  const [toast, setToast]     = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null)

  // Pending (unsaved) permission changes keyed by staff member ID
  const [pendingPerms, setPendingPerms] = useState<Record<string, StaffPermission[]>>({})

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Returns the in-editor permissions for a member (pending or saved)
  function getEditorPerms(member: StaffRow): StaffPermission[] {
    if (member.id in pendingPerms) return pendingPerms[member.id]
    return member.staff_permissions?.[0]?.permissions ?? []
  }

  function hasPendingChanges(member: StaffRow): boolean {
    if (!(member.id in pendingPerms)) return false
    const saved   = member.staff_permissions?.[0]?.permissions ?? []
    const pending = pendingPerms[member.id]
    if (saved.length !== pending.length) return true
    return !saved.every(p => pending.includes(p))
  }

  function discardChanges(memberId: string) {
    setPendingPerms(prev => {
      const next = { ...prev }
      delete next[memberId]
      return next
    })
  }

  // ── Patch a staff member (role / status / permissions) ──────

  async function patchMember(id: string, payload: Record<string, unknown>) {
    setSaving(id)
    try {
      const res = await fetch(`/api/admin/staff/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Update failed')
      return true
    } catch (e) {
      showToast((e as Error).message, 'error')
      return false
    } finally {
      setSaving(null)
    }
  }

  // ── Toggle permission (local state only — no API call) ───────

  function togglePermission(member: StaffRow, perm: StaffPermission) {
    const current = getEditorPerms(member)
    const next = current.includes(perm)
      ? current.filter(p => p !== perm)
      : [...current, perm]
    setPendingPerms(prev => ({ ...prev, [member.id]: next }))
  }

  // ── Save permissions (explicit save) ─────────────────────────

  async function savePermissions(member: StaffRow) {
    const perms = getEditorPerms(member)
    const ok = await patchMember(member.id, { permissions: perms })
    if (ok) {
      setStaff(prev => prev.map(m =>
        m.id === member.id
          ? { ...m, staff_permissions: [{ permissions: perms }] }
          : m
      ))
      discardChanges(member.id)
      showToast(`Permissions saved for ${member.first_name}`)
    }
  }

  // ── Change role ──────────────────────────────────────────────

  async function changeRole(member: StaffRow, role: 'staff' | 'admin') {
    if (role === member.role) return
    const ok = await patchMember(member.id, { role })
    if (ok) {
      setStaff(prev => prev.map(m => m.id === member.id ? { ...m, role } : m))
      showToast(`${member.first_name}'s role updated to ${role}`)
    }
  }

  // ── Toggle status (active ↔ suspended) ───────────────────────

  async function toggleStatus(member: StaffRow) {
    if (member.id === currentUserId) {
      showToast('Cannot change your own account status', 'error')
      return
    }
    const next = member.status === 'active' ? 'suspended' : 'active'
    const ok   = await patchMember(member.id, { status: next })
    if (ok) {
      setStaff(prev => prev.map(m => m.id === member.id ? { ...m, status: next } : m))
      showToast(`${member.first_name}'s account ${next === 'active' ? 'reactivated' : 'suspended'}`)
    }
  }

  // ── Archive staff member ──────────────────────────────────────

  async function archiveMember(member: StaffRow) {
    if (member.id === currentUserId) {
      showToast('Cannot archive your own account', 'error')
      return
    }
    const confirmed = await appConfirm(
      `Archive ${member.first_name} ${member.last_name}?\n\n` +
      `They will be blocked from logging in and removed from this list. ` +
      `You can restore them at any time from the Archived Staff page.`
    )
    if (!confirmed) return
    const ok = await patchMember(member.id, { status: 'archived' })
    if (ok) {
      setStaff(prev => prev.filter(m => m.id !== member.id))
      if (editingId === member.id) setEditingId(null)
      showToast(`${member.first_name} has been archived`)
    }
  }

  // Archived count: server value + however many we've archived this session
  // initialStaff.length − staff.length = number removed from list this session
  const displayedArchivedCount = archivedCount + (initialStaff.length - staff.length)

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

      {/* Header */}
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Staff &amp; Permissions</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <p className="admin-subtitle" style={{ margin: 0 }}>
              {staff.length} active member{staff.length !== 1 ? 's' : ''}
            </p>
            {displayedArchivedCount > 0 && (
              <Link
                href="/admin/settings/staff/archived"
                style={{
                  fontSize: 12, color: 'var(--stone)',
                  textDecoration: 'none', letterSpacing: '0.03em',
                  borderBottom: '1px solid var(--light-line)',
                  paddingBottom: 1,
                }}
              >
                {displayedArchivedCount} archived →
              </Link>
            )}
            {displayedArchivedCount === 0 && (
              <Link
                href="/admin/settings/staff/archived"
                style={{
                  fontSize: 12, color: 'var(--stone)',
                  textDecoration: 'none', letterSpacing: '0.03em',
                  borderBottom: '1px solid var(--light-line)',
                  paddingBottom: 1,
                  opacity: 0.6,
                }}
              >
                Archived staff
              </Link>
            )}
          </div>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAdd(s => !s)}
        >
          {showAdd ? 'Cancel' : '+ Add Staff Member'}
        </button>
      </div>

      {/* Add Staff Form */}
      {showAdd && (
        <AddStaffForm
          onAdded={(newMember) => {
            setStaff(prev => [...prev, newMember])
            setShowAdd(false)
            showToast(`${newMember.first_name} added successfully`)
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* Staff list */}
      {staff.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <h3>No active staff accounts</h3>
          <p>Use &ldquo;Add Staff Member&rdquo; above to create your first staff account.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {staff.map(member => {
            const savedPerms  = member.staff_permissions?.[0]?.permissions ?? []
            const isAdmin     = member.role === 'admin'
            const isSelf      = member.id === currentUserId
            const isEditing   = editingId === member.id
            const isSaving    = saving === member.id
            const editorPerms = getEditorPerms(member)
            const isDirty     = hasPendingChanges(member)
            const isSuspended = member.status === 'suspended'

            return (
              <div
                key={member.id}
                style={{
                  background: isSuspended ? 'var(--sage-light)' : 'var(--warm-white)',
                  border: `1px solid ${isDirty && isEditing ? 'var(--caramel)' : 'var(--light-line)'}`,
                  padding: '24px 28px',
                  opacity: isSaving ? 0.7 : 1,
                  transition: 'opacity 0.2s, border-color 0.2s',
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isEditing ? 20 : 0 }}>
                  <div>
                    {/* Name + role badge + status pill */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                      <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 300, color: 'var(--forest)' }}>
                        {member.first_name} {member.last_name}
                        {isSelf && <span style={{ fontSize: 11, color: 'var(--stone)', marginLeft: 6 }}>(you)</span>}
                      </h3>
                      {/* Role selector */}
                      {!isSelf ? (
                        <select
                          value={member.role}
                          disabled={isSaving}
                          onChange={e => changeRole(member, e.target.value as 'staff' | 'admin')}
                          style={{
                            fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
                            textTransform: 'uppercase', padding: '3px 8px',
                            border: '1px solid var(--light-line)',
                            background: isAdmin ? 'var(--forest)' : 'var(--sand)',
                            color: isAdmin ? 'var(--cream)' : 'var(--forest)',
                            cursor: 'pointer', appearance: 'auto',
                          }}
                        >
                          <option value="staff">Staff</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className={`badge ${isAdmin ? 'badge-forest' : 'badge-sand'}`}>
                          {member.role}
                        </span>
                      )}
                      {/* Sprint 7.1: platform-authority badge */}
                      {member.is_ultra_admin && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                          textTransform: 'uppercase', background: 'var(--forest)',
                          color: 'var(--cream)', padding: '4px 10px',
                        }}>
                          Ultra Admin
                        </span>
                      )}
                      <span className={`status-pill status-${member.status}`}>
                        {member.status}
                      </span>
                    </div>

                    {/* Email */}
                    <p style={{ fontSize: 13, color: 'var(--stone)' }}>{member.email}</p>

                    {/* Permission count summary */}
                    {!isAdmin && (
                      <p style={{
                        fontSize: 11, marginTop: 3, letterSpacing: '0.03em',
                        color: savedPerms.length > 0 ? 'var(--forest)' : 'var(--stone)',
                        opacity: savedPerms.length > 0 ? 0.8 : 0.6,
                      }}>
                        {savedPerms.length} of {ALL_PERMISSIONS.length} permissions granted
                      </p>
                    )}

                    {/* Join date */}
                    <p style={{ fontSize: 11, color: 'var(--stone)', marginTop: 4, letterSpacing: '0.05em' }}>
                      Joined {new Date(member.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {/* Edit permissions — staff only, not self */}
                    {!isAdmin && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={async () => {
                          if (isEditing && isDirty) {
                            if (await appConfirm('You have unsaved changes. Discard them?')) {
                              discardChanges(member.id)
                              setEditingId(null)
                            }
                          } else {
                            discardChanges(member.id)
                            setEditingId(isEditing ? null : member.id)
                          }
                        }}
                      >
                        {isEditing ? 'Close' : 'Edit Permissions'}
                      </button>
                    )}

                    {/* Password reset — not self (Sprint 7.1: single button + menu) */}
                    {!isSelf && (
                      <ResetPasswordMenu
                        userId={member.id}
                        email={member.email}
                        firstName={member.first_name}
                        disabled={isSaving}
                        onResult={(msg, type) => showToast(msg, type)}
                      />
                    )}

                    {/* Suspend / Reactivate — not self */}
                    {!isSelf && (
                      <button
                        className="btn btn-sm"
                        style={{
                          color:       isSuspended ? 'var(--success)' : 'var(--danger)',
                          border:      `1px solid ${isSuspended ? 'var(--success)' : 'var(--danger)'}`,
                          background:  'transparent',
                          padding:     '6px 14px',
                          fontSize:    12,
                          fontWeight:  500,
                          letterSpacing: '0.04em',
                          cursor:      'pointer',
                          transition:  'background 0.15s',
                        }}
                        disabled={isSaving}
                        onClick={() => toggleStatus(member)}
                      >
                        {isSuspended ? 'Reactivate' : 'Suspend'}
                      </button>
                    )}

                    {/* Archive — not self */}
                    {!isSelf && (
                      <button
                        className="btn btn-sm"
                        style={{
                          color:       'var(--stone)',
                          border:      '1px solid var(--light-line)',
                          background:  'transparent',
                          padding:     '6px 14px',
                          fontSize:    12,
                          fontWeight:  500,
                          letterSpacing: '0.04em',
                          cursor:      'pointer',
                          transition:  'background 0.15s, border-color 0.15s',
                        }}
                        disabled={isSaving}
                        onClick={() => archiveMember(member)}
                        title="Archive this staff member — they will be blocked from logging in"
                      >
                        Archive
                      </button>
                    )}

                    {/* Delete — Ultra Admin only, never self (Sprint 7 Part B) */}
                    {isUltraAdmin && !isSelf && (
                      <button
                        className="btn btn-sm"
                        style={{
                          color:       '#fff',
                          border:      '1px solid var(--danger)',
                          background:  'var(--danger)',
                          padding:     '6px 14px',
                          fontSize:    12,
                          fontWeight:  600,
                          letterSpacing: '0.04em',
                          cursor:      'pointer',
                        }}
                        disabled={isSaving}
                        onClick={() => setDeleteTarget(member)}
                        title="Permanently delete this account — Ultra Admin only, cannot be undone"
                      >
                        Delete…
                      </button>
                    )}
                  </div>
                </div>

                {/* Permissions view (collapsed) */}
                {!isEditing && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 600, letterSpacing: '0.18em',
                      textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 12,
                    }}>
                      {isAdmin ? 'Full access to all areas' : 'Module permissions'}
                    </div>

                    {isAdmin ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {Object.values(PERMISSION_LABELS).map(label => (
                          <span key={label} className="badge badge-sage">{label}</span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                        {ALL_PERMISSIONS.map(key => {
                          const granted = savedPerms.includes(key)
                          return (
                            <div key={key} style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              fontSize: 13, color: granted ? 'var(--forest)' : 'var(--stone)',
                            }}>
                              <span style={{
                                width: 16, height: 16, borderRadius: 2,
                                background: granted ? 'var(--forest)' : 'var(--sage-light)',
                                border: `1px solid ${granted ? 'var(--forest)' : 'var(--light-line)'}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              }}>
                                {granted && (
                                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
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
                )}

                {/* Inline permission editor */}
                {isEditing && !isAdmin && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600, letterSpacing: '0.18em',
                        textTransform: 'uppercase', color: 'var(--stone)',
                      }}>
                        Toggle permissions — click Save to apply
                      </div>
                      {isDirty && (
                        <span style={{ fontSize: 12, color: 'var(--caramel)', fontWeight: 500 }}>
                          Unsaved changes
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                      {ALL_PERMISSIONS.map(perm => {
                        const granted = editorPerms.includes(perm)
                        return (
                          <button
                            key={perm}
                            disabled={isSaving}
                            onClick={() => togglePermission(member, perm)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '10px 14px', cursor: 'pointer',
                              border: `1.5px solid ${granted ? 'var(--forest)' : 'var(--light-line)'}`,
                              background: granted ? 'rgba(26,43,24,0.06)' : 'transparent',
                              color: granted ? 'var(--forest)' : 'var(--stone)',
                              fontSize: 12, fontWeight: granted ? 500 : 400,
                              letterSpacing: '0.04em', textAlign: 'left',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <span style={{
                              width: 18, height: 18, borderRadius: 3, flexShrink: 0,
                              background: granted ? 'var(--forest)' : 'transparent',
                              border: `1.5px solid ${granted ? 'var(--forest)' : 'var(--sage)'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {granted && (
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </span>
                            {PERMISSION_LABELS[perm]}
                          </button>
                        )
                      })}
                    </div>

                    {/* Action row */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 20, borderTop: '1px solid var(--light-line)', paddingTop: 16 }}>
                      {/* Save button — primary action */}
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={isSaving || !isDirty}
                        onClick={() => savePermissions(member)}
                        style={{ minWidth: 120 }}
                      >
                        {isSaving ? 'Saving…' : 'Save Changes'}
                      </button>

                      {isDirty && (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={isSaving}
                          onClick={() => discardChanges(member.id)}
                        >
                          Discard
                        </button>
                      )}

                      {/* Quick-set helpers */}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={isSaving}
                          onClick={() => setPendingPerms(prev => ({ ...prev, [member.id]: ALL_PERMISSIONS }))}
                        >
                          Grant All
                        </button>
                        {/* Remove All — danger-outlined */}
                        <button
                          className="btn btn-sm"
                          style={{
                            color:       'var(--danger)',
                            border:      '1px solid var(--danger)',
                            background:  'transparent',
                            padding:     '6px 14px',
                            fontSize:    12,
                            fontWeight:  500,
                            letterSpacing: '0.04em',
                            cursor:      'pointer',
                          }}
                          disabled={isSaving}
                          onClick={() => setPendingPerms(prev => ({ ...prev, [member.id]: [] }))}
                        >
                          Remove All
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Permanent deletion dialog (Ultra Admin only) */}
      {deleteTarget && (
        <DeleteAccountDialog
          account={{
            id: deleteTarget.id,
            email: deleteTarget.email,
            name: `${deleteTarget.first_name} ${deleteTarget.last_name}`.trim(),
            role: deleteTarget.role,
          }}
          onClose={() => setDeleteTarget(null)}
          onDeleted={acc => {
            setStaff(prev => prev.filter(m => m.id !== acc.id))
            if (editingId === acc.id) setEditingId(null)
            setDeleteTarget(null)
            showToast(`${acc.email} permanently deleted`)
          }}
        />
      )}
    </div>
  )
}

// ── Add Staff Form ────────────────────────────────────────────

function AddStaffForm({
  onAdded,
  onError,
}: {
  onAdded: (member: StaffRow) => void
  onError: (msg: string) => void
}) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'staff' as 'staff' | 'admin',
    tempPassword: '',
    permissions: [] as StaffPermission[],
  })
  const [saving, setSaving] = useState(false)

  function toggle(perm: StaffPermission) {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter(p => p !== perm)
        : [...f.permissions, perm],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.firstName || !form.lastName || !form.email || !form.tempPassword) {
      onError('Please fill all required fields')
      return
    }
    if (form.tempPassword.length < 8) {
      onError('Password must be at least 8 characters')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!json.success) {
        onError(json.error ?? 'Failed to create staff member')
        return
      }
      onAdded({
        ...json.data,
        staff_permissions: form.role === 'staff' ? [{ permissions: form.permissions }] : null,
      })
    } catch {
      onError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: 'var(--warm-white)',
        border: '1.5px solid var(--forest)',
        padding: '28px 32px',
        marginBottom: 24,
      }}
    >
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: 'var(--forest)',
        marginBottom: 24,
      }}>
        New Staff Member
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <label className="form-label">First Name *</label>
          <input
            className="form-input"
            value={form.firstName}
            onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
            placeholder="e.g. Sarah"
            required
          />
        </div>
        <div>
          <label className="form-label">Last Name *</label>
          <input
            className="form-input"
            value={form.lastName}
            onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
            placeholder="e.g. Okonkwo"
            required
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <label className="form-label">Email Address *</label>
          <input
            className="form-input"
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="staff@fullbloom.uk.com"
            required
          />
        </div>
        <div>
          <label className="form-label">Role *</label>
          <select
            className="form-input"
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value as 'staff' | 'admin' }))}
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <label className="form-label">Temporary Password * (staff member will log in with this)</label>
        <input
          className="form-input"
          type="text"
          value={form.tempPassword}
          onChange={e => setForm(f => ({ ...f, tempPassword: e.target.value }))}
          placeholder="Min. 8 characters"
          required
          minLength={8}
          style={{ maxWidth: 360 }}
        />
      </div>

      {form.role === 'staff' && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 12,
          }}>
            Module Permissions
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setForm(f => ({ ...f, permissions: ALL_PERMISSIONS }))}
            >
              Select All
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{
                color: 'var(--danger)', border: '1px solid var(--danger)',
                background: 'transparent', padding: '6px 14px',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}
              onClick={() => setForm(f => ({ ...f, permissions: [] }))}
            >
              Clear All
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {ALL_PERMISSIONS.map(perm => {
              const granted = form.permissions.includes(perm)
              return (
                <button
                  key={perm}
                  type="button"
                  onClick={() => toggle(perm)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', cursor: 'pointer',
                    border: `1.5px solid ${granted ? 'var(--forest)' : 'var(--light-line)'}`,
                    background: granted ? 'rgba(26,43,24,0.06)' : 'transparent',
                    color: granted ? 'var(--forest)' : 'var(--stone)',
                    fontSize: 12, fontWeight: granted ? 500 : 400,
                    letterSpacing: '0.04em', textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: 3, flexShrink: 0,
                    background: granted ? 'var(--forest)' : 'transparent',
                    border: `1.5px solid ${granted ? 'var(--forest)' : 'var(--sage)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {granted && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  {PERMISSION_LABELS[perm]}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving}
        >
          {saving ? 'Creating…' : 'Create Staff Member'}
        </button>
      </div>
    </form>
  )
}
