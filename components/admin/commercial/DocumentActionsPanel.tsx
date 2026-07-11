'use client'

import { useState } from 'react'
import { box, money, CommercialDoc, DocPermissions, LineItem } from './ui'

// Controlled document generation: issue (freeze) quotes, pro formas
// and invoices; open watermarked draft previews; download legacy
// manufacturer copies (transitional); show download history.
export function DocumentActionsPanel({ doc, perms, onIssue, onRevise }: {
  doc: CommercialDoc
  perms: DocPermissions
  onIssue: (docType: 'quote' | 'proforma' | 'invoice' | 'service_invoice') => Promise<void>
  onRevise: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const cur = doc.currency ?? 'GBP'
  const locked = Boolean(doc.locked_at)
  const needsApproval = ['required_commercial', 'required_ultra', 'blocked'].includes(doc.approval_status)
  const hasServiceLines = doc.items.some(i => i.line_type === 'service')

  const openDoc = (type: string, extra?: Record<string, string>) => {
    const params = new URLSearchParams({ type, ...(extra ?? {}) })
    window.open(`/api/admin/proformas/${doc.id}/document?${params.toString()}`, '_blank')
  }

  const issue = async (docType: 'quote' | 'proforma' | 'invoice' | 'service_invoice') => {
    const label = docType.replace('_', ' ')
    if (!confirm(`Issue this ${label}? The document is frozen as an immutable snapshot; later changes will require a new revision.`)) return
    setBusy(true); await onIssue(docType); setBusy(false)
  }

  const issuedOf = (t: string) => doc.issued.filter(d => d.doc_type === t)

  // Manufacturer groups (legacy maker copies — transitional)
  const groups = new Map<string, { key: string; name: string; manufacturerId: string | null; items: LineItem[]; subtotal: number }>()
  for (const it of doc.items) {
    if (it.line_type !== 'product') continue
    const name = it.manufacturer?.name ?? it.manufacturer_name ?? 'Unassigned'
    const key = it.manufacturer_id ?? (it.manufacturer_name ? `n:${it.manufacturer_name}` : 'unassigned')
    if (!groups.has(key)) groups.set(key, { key, name, manufacturerId: it.manufacturer_id, items: [], subtotal: 0 })
    const g = groups.get(key)!
    g.items.push(it); g.subtotal += Number(it.line_net_total ?? 0)
  }

  return (
    <div style={box}>
      <div className="label" style={{ marginBottom: 6 }}>Documents</div>
      <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 14 }}>
        <strong>Issuing</strong> freezes an immutable, numbered snapshot — that snapshot is what clients receive.
        <strong> Previews</strong> are watermarked drafts and allocate no numbers. Download PDFs via the print
        dialogue and attach them to your own email.
      </p>

      {needsApproval && (
        <p style={{ fontSize: 12.5, color: '#8a6d1a', background: '#faf3dd', padding: '6px 10px', marginBottom: 12 }}>
          Approval is outstanding — documents cannot be issued yet.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {!locked && perms.canEdit && (
          <>
            <button className="btn btn-primary btn-sm" disabled={busy || needsApproval} onClick={() => issue('quote')}>Issue quotation…</button>
            <button className="btn btn-primary btn-sm" disabled={busy || needsApproval} onClick={() => issue('proforma')}>Issue pro forma…</button>
          </>
        )}
        {perms.canIssueInvoice && (
          <>
            <button className="btn btn-primary btn-sm" disabled={busy || (!locked && needsApproval)} onClick={() => issue('invoice')}>Issue invoice…</button>
            {hasServiceLines && (
              <button className="btn btn-primary btn-sm" disabled={busy || (!locked && needsApproval)} onClick={() => issue('service_invoice')}>Issue service invoice…</button>
            )}
          </>
        )}
        {locked && perms.canEdit && (
          <button className="btn btn-secondary btn-sm" disabled={busy}
            onClick={async () => {
              if (!confirm(`Create revision R${String(doc.revision_number + 1).padStart(2, '0')}? Issued documents remain preserved; the working record re-opens for editing.`)) return
              setBusy(true); await onRevise(); setBusy(false)
            }}>
            Create new revision…
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => openDoc('quote')}>Preview quotation ↗</button>
        <button className="btn btn-ghost btn-sm" onClick={() => openDoc('proforma')}>Preview pro forma ↗</button>
        <button className="btn btn-ghost btn-sm" onClick={() => openDoc('invoice')}>Preview invoice ↗</button>
        {hasServiceLines && <button className="btn btn-ghost btn-sm" onClick={() => openDoc('service_invoice')}>Preview service invoice ↗</button>}
      </div>

      {doc.issued.length > 0 && (
        <>
          <div className="label" style={{ marginBottom: 8, fontSize: 11 }}>Issued documents (immutable)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {doc.issued.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, padding: '7px 12px', border: '1px solid var(--light-line)' }}>
                <strong style={{ minWidth: 170 }}>{d.document_number}</strong>
                <span style={{ color: 'var(--stone)' }}>{d.doc_type.replace('_', ' ')} · R{String(d.revision).padStart(2, '0')} · {new Date(d.issued_at).toLocaleString('en-GB')}</span>
                <span style={{ flex: 1 }} />
                <button className="btn btn-secondary btn-sm" onClick={() => openDoc(d.doc_type, { issuedId: d.id })}>Open PDF ↧</button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="label" style={{ marginBottom: 8, fontSize: 11 }}>Manufacturer copies (legacy — replaced by purchase orders in a later sprint)</div>
      {groups.size === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--stone)' }}>Add product lines to split by manufacturer.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...groups.values()].map(g => (
            <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, padding: '8px 12px', border: '1px solid var(--light-line)' }}>
              <div style={{ flex: 1 }}><strong>{g.name}</strong> · {g.items.length} item{g.items.length !== 1 ? 's' : ''} · {money(g.subtotal, cur)}</div>
              <button className="btn btn-secondary btn-sm" disabled={g.manufacturerId === null && g.name === 'Unassigned'}
                onClick={() => openDoc('proforma', g.manufacturerId
                  ? { audience: 'manufacturer', manufacturerId: g.manufacturerId }
                  : { audience: 'manufacturer', manufacturerName: g.name })}>
                Maker copy PDF ↧
              </button>
            </div>
          ))}
        </div>
      )}

      {doc.downloads.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--light-line)' }}>
          <div className="label" style={{ marginBottom: 8, fontSize: 11 }}>Download history</div>
          {doc.downloads.map(d => (
            <div key={d.id} style={{ fontSize: 12, color: 'var(--stone)', padding: '3px 0' }}>
              {new Date(d.downloaded_at).toLocaleString('en-GB')} · {d.doc_type.replace('_', ' ')} · {d.audience === 'client' ? 'Client copy' : `Manufacturer: ${d.manufacturer?.name ?? d.manufacturer_name ?? '—'}`}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
