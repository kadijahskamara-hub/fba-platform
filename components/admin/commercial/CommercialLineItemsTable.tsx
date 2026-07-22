'use client'

import { useMemo, useState } from 'react'
import { inp, td, th, box, money, sym, TAX_OPTIONS, LineItem, CommercialDoc, DocPermissions } from './ui'
import { ProductLineEditor } from './ProductLineEditor'
import { ServiceLineEditor } from './ServiceLineEditor'

const LINE_TYPE_LABEL: Record<string, string> = {
  product: 'Product', service: 'Service', fee: 'Fee', delivery: 'Delivery',
  installation: 'Installation', adjustment: 'Adjustment',
}

// Final amendments §1: line items are edited through a TYPE-AWARE
// detail editor. Services never show product-only fields; products
// keep the full specification set. Edits are buffered locally and
// written back only on an explicit "Save changes".

export function CommercialLineItemsTable({ doc, perms, locked, artisans, onUpdateItem, onDeleteItem, onAddItem }: {
  doc: CommercialDoc
  perms: DocPermissions
  locked: boolean
  artisans: { id: string; name: string }[]
  onUpdateItem: (itemId: string, patch: Record<string, unknown>) => Promise<void>
  onDeleteItem: (itemId: string) => Promise<void>
  onAddItem: (payload: Record<string, unknown>) => Promise<void>
}) {
  const [openItem, setOpenItem] = useState<string | null>(null)
  const cur = doc.currency ?? 'GBP'

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="label">Line items</div>
        {doc.totals?.costIncomplete && perms.canPriceEdit && (
          <span style={{ fontSize: 12, color: '#8a6d1a', background: '#faf3dd', padding: '3px 10px' }}>
            Cost unavailable on some lines — margins shown are partial.
          </span>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead><tr>
            <th style={th}>Item</th>
            <th style={{ ...th, width: 60 }}>Qty</th>
            {perms.canPriceEdit && <th style={{ ...th, width: 95 }}>Cost ({sym(cur)})</th>}
            {perms.canPriceEdit && <th style={{ ...th, width: 130 }}>Markup / Margin</th>}
            <th style={{ ...th, width: 100 }}>Selling ({sym(cur)})</th>
            <th style={{ ...th, width: 95 }}>Discount</th>
            <th style={{ ...th, width: 90 }}>VAT</th>
            <th style={{ ...th, width: 95 }}>Net total</th>
            <th style={{ ...th, width: 110 }}></th>
          </tr></thead>
          <tbody>
            {doc.items.map(it => (
              <Row key={it.id} it={it} cur={cur} perms={perms} locked={locked} artisans={artisans}
                open={openItem === it.id}
                onToggle={() => setOpenItem(openItem === it.id ? null : it.id)}
                onClose={() => setOpenItem(null)}
                onUpdate={patch => onUpdateItem(it.id, patch)}
                onDelete={() => onDeleteItem(it.id)} />
            ))}
            {doc.items.length === 0 && (
              <tr><td style={td} colSpan={9}><span style={{ color: 'var(--stone)' }}>No lines yet — add a catalogue product, a service, or a bespoke line below.</span></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!locked && perms.canEdit && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--light-line)', display: 'grid', gap: 12 }}>
          <ProductLineEditor cur={cur} canPrice={perms.canPriceEdit} onAdd={onAddItem} />
          <ServiceLineEditor cur={cur} canPrice={perms.canPriceEdit} onAdd={onAddItem} />
        </div>
      )}
    </div>
  )
}

function editVerb(lineType: string): string {
  if (lineType === 'product') return 'Edit product'
  if (lineType === 'service') return 'Edit service'
  return 'Edit line'
}

function Row({ it, cur, perms, locked, artisans, open, onToggle, onClose, onUpdate, onDelete }: {
  it: LineItem; cur: string; perms: DocPermissions; locked: boolean
  artisans: { id: string; name: string }[]
  open: boolean; onToggle: () => void; onClose: () => void
  onUpdate: (patch: Record<string, unknown>) => Promise<void> | void
  onDelete: () => void
}) {
  const img = it.image_url ?? it.product?.images?.[0] ?? null
  const ro = locked || !perms.canEdit
  const priceRo = locked || !perms.canPriceEdit
  const isDerived = it.pricing_method === 'markup' || it.pricing_method === 'margin'
  const marginPct = it.line_cost_total != null && it.line_net_total
    ? ((it.line_net_total - it.line_cost_total) / it.line_net_total) * 100
    : null

  const numInput = (value: number | null, onSave: (v: number | null) => void, opts: { disabled?: boolean; step?: string; width?: number } = {}) => (
    <input style={{ ...inp, width: opts.width ?? '100%', opacity: opts.disabled ? 0.55 : 1 }} type="number" step={opts.step ?? '0.01'}
      defaultValue={value ?? ''} disabled={opts.disabled}
      onBlur={e => {
        const v = e.target.value === '' ? null : parseFloat(e.target.value)
        if (v !== value) onSave(Number.isNaN(v as number) ? null : v)
      }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
  )

  return (
    <>
      <tr style={marginPct != null && marginPct < 0 ? { background: '#fdf0f0' } : undefined}>
        <td style={td}>
          <div style={{ display: 'flex', gap: 10 }}>
            {img && <img src={img} alt="" style={{ width: 38, height: 38, objectFit: 'cover', flexShrink: 0 }} />}
            <div>
              <div style={{ fontWeight: 500 }}>
                {it.name}
                <span style={{ fontSize: 9.5, color: 'var(--caramel)', marginLeft: 6, letterSpacing: '0.08em' }}>
                  {LINE_TYPE_LABEL[it.line_type]?.toUpperCase()}{it.is_bespoke ? ' · BESPOKE' : ''}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--stone)' }}>
                {[it.section, it.manufacturer?.name ?? it.manufacturer_name, it.supplier_cost_source === 'unavailable' && perms.canPriceEdit ? 'cost unavailable' : null].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
          </div>
        </td>
        <td style={td}>{numInput(it.quantity, v => onUpdate({ quantity: v ?? 1 }), { disabled: ro, step: '1' })}</td>
        {perms.canPriceEdit && (
          <td style={td}>
            {numInput(it.supplier_cost_unit, v => {
              const patch: Record<string, unknown> = { supplierCostUnit: v }
              if (it.supplier_cost_source.startsWith('catalogue') && v != null) {
                const reason = prompt('Reason for overriding the catalogue supplier cost? (required — Commercial Admin approval will be requested)')
                if (!reason) return
                patch.supplierCostOverrideReason = reason
              }
              onUpdate(patch)
            }, { disabled: priceRo })}
          </td>
        )}
        {perms.canPriceEdit && (
          <td style={{ ...td, whiteSpace: 'nowrap' }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <select style={{ ...inp, width: 78, opacity: priceRo ? 0.55 : 1 }} disabled={priceRo}
                value={it.pricing_method ?? 'manual'}
                onChange={e => onUpdate({ pricingMethod: e.target.value })}>
                <option value="manual">Manual</option>
                <option value="markup">Markup</option>
                <option value="margin">Margin</option>
              </select>
              {isDerived && numInput(it.pricing_percent, v => onUpdate({ pricingPercent: v }), { disabled: priceRo, width: 58, step: '0.1' })}
              {isDerived && <span style={{ fontSize: 11, color: 'var(--stone)' }}>%</span>}
            </div>
            {marginPct != null && (
              <div style={{ fontSize: 10.5, marginTop: 2, color: marginPct < 0 ? '#a03030' : marginPct < 30 ? '#8a6d1a' : 'var(--stone)' }}>
                margin {marginPct.toFixed(1)}%
              </div>
            )}
          </td>
        )}
        <td style={td}>
          {isDerived
            ? <span style={{ fontSize: 13 }}>{money(it.selling_price_unit, cur)}</span>
            : numInput(it.selling_price_unit, v => onUpdate({ sellingPriceUnit: v }), { disabled: priceRo })}
        </td>
        <td style={{ ...td, whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <select style={{ ...inp, width: 46, padding: '5px 2px', opacity: locked || !perms.canDiscountOverride ? 0.55 : 1 }}
              disabled={locked || !perms.canDiscountOverride}
              value={it.discount_type ?? ''}
              onChange={e => onUpdate({ discountType: e.target.value || null, discountValue: e.target.value ? (it.discount_value ?? 0) : null })}>
              <option value="">—</option>
              <option value="percent">%</option>
              <option value="fixed">{sym(cur)}</option>
            </select>
            {it.discount_type && numInput(it.discount_value, v => onUpdate({ discountValue: v }), { disabled: locked || !perms.canDiscountOverride, width: 52 })}
          </div>
        </td>
        <td style={td}>
          <select style={{ ...inp, opacity: ro ? 0.55 : 1 }} disabled={ro} value={it.tax_category}
            onChange={e => onUpdate({ taxCategory: e.target.value })}>
            {TAX_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </td>
        <td style={{ ...td, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {money(it.line_net_total, cur)}
          {it.line_tax_total != null && it.line_tax_total > 0 && (
            <div style={{ fontSize: 10.5, color: 'var(--stone)', fontWeight: 400 }}>+VAT {money(it.line_tax_total, cur)}</div>
          )}
        </td>
        <td style={{ ...td, whiteSpace: 'nowrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={onToggle}>{open ? 'Close' : editVerb(it.line_type)}</button>
          {!ro && <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} onClick={onDelete}>✕</button>}
        </td>
      </tr>
      {open && (
        <tr>
          <td style={{ ...td, background: 'var(--cream)' }} colSpan={perms.canPriceEdit ? 9 : 7}>
            {it.line_type === 'product'
              ? <ProductDetailEditor key={it.id} it={it} ro={ro} artisans={artisans} onSave={onUpdate} onClose={onClose} />
              : <ServiceDetailEditor key={it.id} it={it} cur={cur} ro={ro} priceRo={priceRo} onSave={onUpdate} onClose={onClose} />}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Shared buffered-editor plumbing ──────────────────────────

type Draft = Record<string, string | boolean>

function useDraft(initial: Draft) {
  const [draft, setDraft] = useState<Draft>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const dirty = useMemo(() => Object.keys(initial).some(k => draft[k] !== initial[k]), [draft, initial])
  const set = (k: string, v: string | boolean) => setDraft(d => ({ ...d, [k]: v }))
  return { draft, set, errors, setErrors, saving, setSaving, dirty }
}

function DraftField({ label, value, onChange, disabled, error, area, type, step, placeholder }: {
  label: string; value: string; onChange: (v: string) => void
  disabled?: boolean; error?: string; area?: boolean; type?: string; step?: string; placeholder?: string
}) {
  return (
    <div>
      <div className="form-label" style={{ fontSize: 11 }}>{label}</div>
      {area ? (
        <textarea style={{ ...inp, minHeight: 64, resize: 'vertical', fontFamily: 'inherit', opacity: disabled ? 0.55 : 1, borderColor: error ? '#a03030' : undefined }}
          value={value} disabled={disabled} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      ) : (
        <input style={{ ...inp, opacity: disabled ? 0.55 : 1, borderColor: error ? '#a03030' : undefined }}
          type={type ?? 'text'} step={step} value={value} disabled={disabled} placeholder={placeholder}
          onChange={e => onChange(e.target.value)} />
      )}
      {error && <div role="alert" style={{ fontSize: 11, color: '#a03030', marginTop: 3 }}>{error}</div>}
    </div>
  )
}

function EditorActions({ dirty, saving, ro, onSave, onCancel }: {
  dirty: boolean; saving: boolean; ro: boolean; onSave: () => void; onCancel: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--light-line)' }}>
      {!ro && (
        <button className="btn btn-primary btn-sm" disabled={saving || !dirty} onClick={onSave}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      )}
      <button className="btn btn-ghost btn-sm" disabled={saving} onClick={onCancel}>Cancel</button>
      {dirty && !ro && <span style={{ fontSize: 11.5, color: 'var(--stone)' }}>Unsaved changes — nothing is written until you save.</span>}
    </div>
  )
}

// ── Service line editor (final amendments §1) ────────────────
// Only service-relevant fields; product specification fields are
// intentionally absent and are also rejected server-side for
// non-product lines.

function ServiceDetailEditor({ it, cur, ro, priceRo, onSave, onClose }: {
  it: LineItem; cur: string; ro: boolean; priceRo: boolean
  onSave: (patch: Record<string, unknown>) => Promise<void> | void
  onClose: () => void
}) {
  const initial: Draft = {
    name: it.name ?? '',
    description: it.description ?? '',
    rate: it.selling_price_unit != null ? String(it.selling_price_unit) : '',
    quantity: String(it.quantity ?? 1),
    unit: it.unit_of_measure ?? '',
    notes: it.notes ?? '',
    internalNotes: it.internal_notes ?? '',
    procurementFeeEligible: it.procurement_fee_eligible,
  }
  const { draft, set, errors, setErrors, saving, setSaving, dirty } = useDraft(initial)

  const save = async () => {
    const errs: Record<string, string> = {}
    if (!(draft.name as string).trim()) errs.name = 'A service name is required.'
    const qty = parseFloat(draft.quantity as string)
    if (!Number.isFinite(qty) || qty <= 0) errs.quantity = 'Enter a quantity greater than zero.'
    const rateStr = (draft.rate as string).trim()
    const rate = rateStr === '' ? null : parseFloat(rateStr)
    if (rateStr !== '' && (!Number.isFinite(rate as number) || (rate as number) < 0)) errs.rate = 'Enter a valid rate (0 or more).'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    const patch: Record<string, unknown> = {}
    if (draft.name !== initial.name) patch.name = (draft.name as string).trim()
    if (draft.description !== initial.description) patch.description = (draft.description as string).trim() || null
    if (draft.quantity !== initial.quantity) patch.quantity = qty
    if (draft.unit !== initial.unit) patch.unitOfMeasure = (draft.unit as string).trim() || 'each'
    if (draft.notes !== initial.notes) patch.notes = (draft.notes as string).trim() || null
    if (draft.internalNotes !== initial.internalNotes) patch.internalNotes = (draft.internalNotes as string).trim() || null
    if (draft.procurementFeeEligible !== initial.procurementFeeEligible) patch.procurementFeeEligible = draft.procurementFeeEligible
    if (!priceRo && draft.rate !== initial.rate) { patch.sellingPriceUnit = rate; patch.pricingMethod = 'manual' }
    if (Object.keys(patch).length === 0) { onClose(); return }

    setSaving(true)
    await onSave(patch)
    setSaving(false)
    onClose()
  }

  return (
    <div aria-label={`Edit service — ${it.name}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div className="label" style={{ fontSize: 11 }}>Edit service</div>
        {it.service && (
          <span style={{ fontSize: 11.5, color: 'var(--stone)' }}>
            Catalogue service: <strong>{it.service.name}</strong> ({it.service.pricing_type})
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <DraftField label={it.service ? 'Service name override' : 'Service name'} value={draft.name as string}
          onChange={v => set('name', v)} disabled={ro} error={errors.name} />
        <DraftField label={`Rate (${sym(cur)})`} value={draft.rate as string} type="number" step="0.01"
          onChange={v => set('rate', v)} disabled={priceRo} error={errors.rate}
          placeholder={priceRo ? 'restricted' : ''} />
        <DraftField label="Qty / hours / days" value={draft.quantity as string} type="number" step="0.5"
          onChange={v => set('quantity', v)} disabled={ro} error={errors.quantity} />
        <DraftField label="Unit" value={draft.unit as string} placeholder="hour / day / stage"
          onChange={v => set('unit', v)} disabled={ro} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <DraftField label="Description (shown on document)" value={draft.description as string} area
          onChange={v => set('description', v)} disabled={ro} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <DraftField label="Note for client (shown on document)" value={draft.notes as string} area
          onChange={v => set('notes', v)} disabled={ro} />
        <DraftField label="Internal notes (never on documents)" value={draft.internalNotes as string} area
          onChange={v => set('internalNotes', v)} disabled={ro} />
      </div>
      <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 10, fontSize: 12, color: 'var(--stone)' }}>
        <input type="checkbox" checked={draft.procurementFeeEligible as boolean} disabled={ro}
          onChange={e => set('procurementFeeEligible', e.target.checked)} />
        Counts towards the procurement-fee basis
      </label>
      <EditorActions dirty={dirty} saving={saving} ro={ro} onSave={save} onCancel={onClose} />
    </div>
  )
}

// ── Product line editor (buffered; explicit save) ────────────

function ProductDetailEditor({ it, ro, artisans, onSave, onClose }: {
  it: LineItem; ro: boolean
  artisans: { id: string; name: string }[]
  onSave: (patch: Record<string, unknown>) => Promise<void> | void
  onClose: () => void
}) {
  const initial: Draft = {
    name: it.name ?? '',
    section: it.section ?? '',
    selectedSize: it.selected_size ?? '',
    selectedFinish: it.selected_finish ?? '',
    selectedFabric: it.selected_fabric ?? '',
    manufacturerId: it.manufacturer_id ?? '',
    supplierSku: it.supplier_sku ?? '',
    unitOfMeasure: it.unit_of_measure ?? '',
    imageUrl: it.image_url ?? '',
    specDetails: it.spec_details ?? '',
    notes: it.notes ?? '',
    internalNotes: it.internal_notes ?? '',
    procurementFeeEligible: it.procurement_fee_eligible,
  }
  const { draft, set, errors, setErrors, saving, setSaving, dirty } = useDraft(initial)

  const save = async () => {
    const errs: Record<string, string> = {}
    if (!(draft.name as string).trim()) errs.name = 'A product name is required.'
    const imageUrl = (draft.imageUrl as string).trim()
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) errs.imageUrl = 'Image URL must start with http(s)://'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    const patch: Record<string, unknown> = {}
    if (draft.name !== initial.name) patch.name = (draft.name as string).trim()
    if (draft.section !== initial.section) patch.section = (draft.section as string).trim() || null
    if (draft.selectedSize !== initial.selectedSize) patch.selectedSize = (draft.selectedSize as string).trim() || null
    if (draft.selectedFinish !== initial.selectedFinish) patch.selectedFinish = (draft.selectedFinish as string).trim() || null
    if (draft.selectedFabric !== initial.selectedFabric) patch.selectedFabric = (draft.selectedFabric as string).trim() || null
    if (draft.manufacturerId !== initial.manufacturerId) patch.manufacturerId = (draft.manufacturerId as string) || null
    if (draft.supplierSku !== initial.supplierSku) patch.supplierSku = (draft.supplierSku as string).trim() || null
    if (draft.unitOfMeasure !== initial.unitOfMeasure) patch.unitOfMeasure = (draft.unitOfMeasure as string).trim() || 'each'
    if (draft.imageUrl !== initial.imageUrl) patch.imageUrl = imageUrl || null
    if (draft.specDetails !== initial.specDetails) patch.specDetails = (draft.specDetails as string) || null
    if (draft.notes !== initial.notes) patch.notes = (draft.notes as string).trim() || null
    if (draft.internalNotes !== initial.internalNotes) patch.internalNotes = (draft.internalNotes as string).trim() || null
    if (draft.procurementFeeEligible !== initial.procurementFeeEligible) patch.procurementFeeEligible = draft.procurementFeeEligible
    if (Object.keys(patch).length === 0) { onClose(); return }

    setSaving(true)
    await onSave(patch)
    setSaving(false)
    onClose()
  }

  return (
    <div aria-label={`Edit product — ${it.name}`}>
      <div className="label" style={{ fontSize: 11, marginBottom: 10 }}>Product details</div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <DraftField label="Name (shown on document)" value={draft.name as string} onChange={v => set('name', v)} disabled={ro} error={errors.name} />
        <DraftField label="Section on document" value={draft.section as string} onChange={v => set('section', v)} disabled={ro} />
        <DraftField label="Size / dimensions" value={draft.selectedSize as string} onChange={v => set('selectedSize', v)} disabled={ro} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <DraftField label="Finish" value={draft.selectedFinish as string} onChange={v => set('selectedFinish', v)} disabled={ro} />
        <DraftField label="Fabric / upholstery" value={draft.selectedFabric as string} onChange={v => set('selectedFabric', v)} disabled={ro} />
        <div>
          <div className="form-label" style={{ fontSize: 11 }}>Manufacturer</div>
          <select style={{ ...inp, opacity: ro ? 0.55 : 1 }} disabled={ro} value={draft.manufacturerId as string}
            onChange={e => set('manufacturerId', e.target.value)}>
            <option value="">{it.manufacturer_name ? `${it.manufacturer_name} (free-text)` : '— none —'}</option>
            {artisans.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <DraftField label="Supplier SKU" value={draft.supplierSku as string} onChange={v => set('supplierSku', v)} disabled={ro} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginBottom: 10 }}>
        <DraftField label="Unit of measure" value={draft.unitOfMeasure as string} onChange={v => set('unitOfMeasure', v)} disabled={ro} />
        <DraftField label="Image URL (blank = product photo)" value={draft.imageUrl as string} onChange={v => set('imageUrl', v)} disabled={ro} error={errors.imageUrl} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <DraftField label="Full specification (one detail per line)" value={draft.specDetails as string} area onChange={v => set('specDetails', v)} disabled={ro} />
        <DraftField label="Note for client (shown on document)" value={draft.notes as string} area onChange={v => set('notes', v)} disabled={ro} />
        <DraftField label="Internal notes (never on documents)" value={draft.internalNotes as string} area onChange={v => set('internalNotes', v)} disabled={ro} />
      </div>
      <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 10, fontSize: 12, color: 'var(--stone)' }}>
        <input type="checkbox" checked={draft.procurementFeeEligible as boolean} disabled={ro}
          onChange={e => set('procurementFeeEligible', e.target.checked)} />
        Counts towards the procurement-fee basis
      </label>
      <EditorActions dirty={dirty} saving={saving} ro={ro} onSave={save} onCancel={onClose} />
    </div>
  )
}
