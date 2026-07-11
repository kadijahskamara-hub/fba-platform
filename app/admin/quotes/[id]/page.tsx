'use client'

// FBA Commercial Pipeline — quote / pro forma / invoice working record.
// Refactored (Sprint 1) into domain components under
// components/admin/commercial/. All authoritative calculations happen
// server-side; this page only displays what the API returns.

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { CommercialDoc, DocPermissions, Area, box } from '@/components/admin/commercial/ui'
import { QuoteHeaderForm } from '@/components/admin/commercial/QuoteHeaderForm'
import { ClientProjectPanel } from '@/components/admin/commercial/ClientProjectPanel'
import { CommercialLineItemsTable } from '@/components/admin/commercial/CommercialLineItemsTable'
import { ProcurementFeeEditor } from '@/components/admin/commercial/ProcurementFeeEditor'
import { QuoteTotalsPanel } from '@/components/admin/commercial/QuoteTotalsPanel'
import { ApprovalStatusPanel } from '@/components/admin/commercial/ApprovalStatusPanel'
import { DocumentActionsPanel } from '@/components/admin/commercial/DocumentActionsPanel'
import { RevisionHistoryPanel } from '@/components/admin/commercial/RevisionHistoryPanel'
import { Field } from '@/components/admin/commercial/ui'

export default function CommercialQuotePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [doc, setDoc] = useState<CommercialDoc | null>(null)
  const [perms, setPerms] = useState<DocPermissions | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [artisans, setArtisans] = useState<{ id: string; name: string }[]>([])

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/proformas/${id}`).then(r => r.json())
    if (res.success) { setDoc(res.data); setPerms(res.permissions) }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { fetch('/api/admin/artisans').then(r => r.json()).then(d => setArtisans(d.data ?? [])) }, [])

  const patchHeader = async (patch: Record<string, unknown>): Promise<boolean> => {
    setBusy(true)
    const res = await fetch(`/api/admin/proformas/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }).then(r => r.json())
    setBusy(false)
    if (!res.success) { alert(res.error ?? 'Update failed'); await load(); return false }
    await load(); return true
  }

  const updateItem = async (itemId: string, patch: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/proformas/${id}/items/${itemId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }).then(r => r.json())
    if (!res.success) alert(res.error ?? 'Update failed')
    await load()
  }

  const deleteItem = async (itemId: string) => {
    if (!confirm('Remove this line?')) return
    const res = await fetch(`/api/admin/proformas/${id}/items/${itemId}`, { method: 'DELETE' }).then(r => r.json())
    if (!res.success) alert(res.error ?? 'Delete failed')
    await load()
  }

  const addItem = async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/proformas/${id}/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }).then(r => r.json())
    if (!res.success) alert(res.error ?? 'Add failed')
    await load()
  }

  const approvalAction = async (action: 'approve' | 'reject', note: string | null) => {
    const res = await fetch(`/api/admin/proformas/${id}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, note }),
    }).then(r => r.json())
    if (!res.success) alert(res.error ?? 'Approval action failed')
    await load()
  }

  const issue = async (docType: 'quote' | 'proforma' | 'invoice' | 'service_invoice') => {
    const res = await fetch(`/api/admin/proformas/${id}/issue`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docType }),
    }).then(r => r.json())
    if (!res.success) { alert(res.error ?? 'Issue failed'); return }
    await load()
    window.open(`/api/admin/proformas/${id}/document?type=${docType}&issuedId=${res.data.id}`, '_blank')
  }

  const revise = async () => {
    const res = await fetch(`/api/admin/proformas/${id}/revise`, { method: 'POST' }).then(r => r.json())
    if (!res.success) alert(res.error ?? 'Revision failed')
    await load()
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--stone)' }}>Loading…</div>
  if (!doc || !perms) return <div style={{ padding: 60, textAlign: 'center' }}>Document not found. <Link href="/admin/quotes">Back</Link></div>

  const locked = Boolean(doc.locked_at)

  return (
    <>
      <QuoteHeaderForm doc={doc} locked={locked} busy={busy} onPatch={patchHeader}
        onChangeStage={(stage, lostReason) => patchHeader(lostReason ? { stage, lostReason } : { stage })} />

      {locked && (
        <div style={{ background: 'var(--tint, #E8F0EB)', border: '1px solid var(--forest)', color: 'var(--forest)', padding: '10px 16px', marginBottom: 20, fontSize: 13 }}>
          This document is <strong>issued and locked</strong> — its figures are frozen in the issued snapshots below.
          To amend it, create a new revision from the Documents panel. Previously issued versions are preserved.
        </div>
      )}

      <ApprovalStatusPanel doc={doc} perms={perms} onAction={approvalAction} />

      <ClientProjectPanel doc={doc} locked={locked || !perms.canEdit} onPatch={patchHeader} />

      <ProcurementFeeEditor doc={doc} locked={locked} canPrice={perms.canPriceEdit} onPatch={patchHeader} />

      <CommercialLineItemsTable doc={doc} perms={perms} locked={locked} artisans={artisans}
        onUpdateItem={updateItem} onDeleteItem={deleteItem} onAddItem={addItem} />

      <QuoteTotalsPanel doc={doc} perms={perms} />

      {/* Narrative document fields */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 12 }}>Document text</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 12 }}>
          <Field label="Lead time" value={doc.lead_time} onSave={v => patchHeader({ leadTime: v || null })} disabled={locked || !perms.canEdit} placeholder="e.g. 10–14 weeks depending on maker capacity" />
          {doc.invoice_number && <Field label="Invoice date" value={doc.invoice_date} onSave={v => patchHeader({ invoiceDate: v || null })} placeholder="YYYY-MM-DD" disabled={locked} />}
          {doc.invoice_number && <Field label="Payment due" value={doc.invoice_due_date} onSave={v => patchHeader({ invoiceDueDate: v || null })} placeholder="YYYY-MM-DD" disabled={locked} />}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Area label="Delivery notes (shown on document)" value={doc.delivery_notes} onSave={v => patchHeader({ deliveryNotes: v || null })} disabled={locked || !perms.canEdit} />
          <Area label="Payment terms (blank = studio default)" value={doc.payment_terms} onSave={v => patchHeader({ paymentTerms: v || null })} disabled={locked || !perms.canEdit} />
          <Area label="Notes to client (shown on document)" value={doc.notes} onSave={v => patchHeader({ notes: v || null })} disabled={locked || !perms.canEdit} />
          <Area label="Internal notes (never on documents)" value={doc.admin_notes} onSave={v => patchHeader({ adminNotes: v || null })} disabled={!perms.canEdit} />
        </div>
      </div>

      <DocumentActionsPanel doc={doc} perms={perms} onIssue={issue} onRevise={revise} />

      <RevisionHistoryPanel doc={doc} />

      {!locked && perms.canEdit && (
        <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }}
          onClick={async () => {
            if (!confirm(`Delete draft ${doc.quote_number ?? doc.proforma_number}? Issued documents cannot be deleted.`)) return
            const res = await fetch(`/api/admin/proformas/${id}`, { method: 'DELETE' }).then(r => r.json())
            if (!res.success) { alert(res.error ?? 'Delete failed'); return }
            router.push('/admin/quotes')
          }}>
          Delete draft
        </button>
      )}
    </>
  )
}
