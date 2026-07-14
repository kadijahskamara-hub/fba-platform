import 'server-only'
import { renderDocument, type DocModel } from './theme'
import {
  findForbiddenDeliveryFields,
  type DeliveryNoteSnapshot,
  type DeliveryNoteAudience,
} from '../deliveryLogic'

// ============================================================
// Delivery notes — NO-PRICE by design. Three audiences:
//   • client        — client's records
//   • site          — goes to the delivery site (embeds the
//                     confirmation QR + URL, like the HTML copy)
//   • manufacturer  — maker copy, references the related PO
//
// Before rendering, the snapshot is deep-scanned with
// findForbiddenDeliveryFields; ANY money-like field aborts the
// render (mirrors the HTML renderer guard).
// ============================================================

export interface DeliveryConfirmation { url: string; qrDataUri?: string | null }

const AUDIENCE_LABEL: Record<DeliveryNoteAudience, string> = {
  client: 'Client copy',
  site: 'Site copy',
  manufacturer: 'Maker copy',
}

export function buildDeliveryNoteModel(
  snapshot: DeliveryNoteSnapshot,
  opts: { audience: DeliveryNoteAudience; confirmation?: DeliveryConfirmation | null },
): DocModel {
  // Hard guard: refuse to render if any forbidden (money) field is present.
  const hits = findForbiddenDeliveryFields(snapshot)
  if (hits.length) {
    throw new Error(`Delivery note contains forbidden price/cost fields: ${hits.join(', ')}`)
  }

  const { audience } = opts
  const loc = snapshot.location ?? ({} as DeliveryNoteSnapshot['location'])
  const del = snapshot.delivery ?? ({} as DeliveryNoteSnapshot['delivery'])
  const settings = snapshot.settings ?? ({} as DeliveryNoteSnapshot['settings'])

  const meta: Array<[string, string]> = []
  if (snapshot.orderNumber) meta.push(['Order', String(snapshot.orderNumber)])
  if (del.carrier) meta.push(['Carrier', String(del.carrier)])
  if (del.expected_date) meta.push(['Expected', String(del.expected_date)])
  if (del.dispatched_at) meta.push(['Dispatched', String(del.dispatched_at).slice(0, 10)])

  const deliverTo = [
    loc.label, loc.address_line1, loc.address_line2,
    [loc.city, loc.region, loc.postcode].filter(Boolean).join(', '), loc.country,
  ].filter(Boolean) as string[]

  const contacts = (snapshot.contacts ?? []).map(c =>
    [c.name, c.role, c.phone, c.email].filter(Boolean).join(' · '))

  const parties: DocModel['parties'] = [{ label: 'Deliver to', lines: deliverTo }]
  if (contacts.length) parties.push({ label: 'Site contact', lines: contacts })
  if (snapshot.client?.name || snapshot.client?.company) {
    parties.push({ label: 'Client', lines: [snapshot.client.name, snapshot.client.company].filter(Boolean) as string[] })
  }

  const showMakerCol = audience === 'manufacturer'
  const columns: DocModel['columns'] = [
    { header: 'Item', width: showMakerCol ? 40 : 50 },
    { header: 'Specification', width: 30 },
    { header: 'Qty', width: 8, align: 'right' },
    { header: 'Ordered', width: 9, align: 'right' },
    { header: 'UoM', width: 9 },
  ]
  if (showMakerCol) columns.push({ header: 'PO', width: 14 })

  const rows = (snapshot.lines ?? []).map(l => {
    const spec = [l.selected_finish, l.selected_fabric, l.selected_size, l.spec_details].filter(Boolean).join(' · ')
    const base = [
      [l.name, l.description].filter(Boolean).join(' — ').slice(0, 160),
      spec.slice(0, 120),
      String(Number(l.quantity ?? 0)),
      String(Number(l.ordered_quantity ?? 0)),
      String(l.unit_of_measure ?? 'each'),
    ]
    if (showMakerCol) base.push(String(l.purchase_order_number ?? ''))
    return base
  })

  const notes: DocModel['notes'] = []
  if (del.instructions) notes.push({ title: 'Delivery instructions', body: String(del.instructions) })
  if (loc.access_notes) notes.push({ title: 'Site access', body: String(loc.access_notes) })
  const pkgs = (snapshot.packages ?? []).map(p =>
    [p.reference, p.description, p.weight, p.dimensions].filter(Boolean).join(' · ')).filter(Boolean)
  if (pkgs.length) notes.push({ title: 'Packages', body: pkgs.join('\n') })
  notes.push({ title: 'Goods received', body: 'Received in good condition (subject to any exceptions noted): _______________________________   Name: __________________   Date: __________' })

  const showQr = (audience === 'site') && opts.confirmation?.qrDataUri
  return {
    docLabel: 'DELIVERY NOTE',
    documentNumber: String(snapshot.deliveryNumber ?? ''),
    subtitle: AUDIENCE_LABEL[audience],
    metaRight: meta,
    company: {
      legal_name: String(settings.company_legal_name ?? 'Full Bloom Artelier'),
      address: settings.registered_address ?? null,
      email: settings.contact_email ?? null,
      phone: settings.contact_phone ?? null,
      registration_number: settings.company_registration_number ?? null,
    },
    parties,
    columns,
    rows,
    totals: [],           // NO money on delivery notes
    notes,
    bank: null,
    qr: showQr ? { dataUri: opts.confirmation!.qrDataUri!, url: opts.confirmation!.url, caption: 'Confirm delivery' } : null,
    showTerms: false,
    confidential: 'Delivery note — no charge',
  }
}

export function deliveryNotePdf(
  snapshot: DeliveryNoteSnapshot,
  opts: { audience: DeliveryNoteAudience; confirmation?: DeliveryConfirmation | null },
): Buffer {
  return renderDocument(buildDeliveryNoteModel(snapshot, opts))
}
