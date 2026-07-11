'use client'

import Link from 'next/link'
import { Field, Area, box, CommercialDoc } from './ui'

export function ClientProjectPanel({ doc, locked, onPatch }: {
  doc: CommercialDoc
  locked: boolean
  onPatch: (patch: Record<string, unknown>) => Promise<boolean>
}) {
  return (
    <div style={box}>
      <div className="label" style={{ marginBottom: 12 }}>Client &amp; project</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <Field label="Client name" value={doc.client_name} onSave={v => onPatch({ clientName: v })} disabled={locked} />
        <Field label="Client email" value={doc.client_email} onSave={v => onPatch({ clientEmail: v })} disabled={locked} />
        <Field label="Company" value={doc.client_company} onSave={v => onPatch({ clientCompany: v })} disabled={locked} />
        <Field label="Project" value={doc.project_name} onSave={v => onPatch({ projectName: v })} disabled={locked} />
        <Field label="Location" value={doc.project_location} onSave={v => onPatch({ projectLocation: v })} disabled={locked} />
        <div />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
        <Area label="Billing address (shown on documents)" value={doc.billing_address} onSave={v => onPatch({ billingAddress: v || null })} disabled={locked} />
        <Area label="Delivery address" value={doc.delivery_address} onSave={v => onPatch({ deliveryAddress: v || null })} disabled={locked} />
      </div>
      {doc.contact && (
        <p style={{ marginTop: 14, fontSize: 12, color: 'var(--stone)' }}>
          Linked contact: <Link href="/admin/contacts" style={{ color: 'var(--forest)' }}>{doc.contact.first_name} {doc.contact.last_name} · {doc.contact.email}</Link>
        </p>
      )}
    </div>
  )
}
