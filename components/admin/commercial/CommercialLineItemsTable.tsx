'use client'

import { useState } from 'react'
import { inp, td, th, box, money, sym, TAX_OPTIONS, LineItem, CommercialDoc, DocPermissions } from './ui'
import { ProductLineEditor } from './ProductLineEditor'
import { ServiceLineEditor } from './ServiceLineEditor'

const LINE_TYPE_LABEL: Record<string, string> = {
  product: 'Product', service: 'Service', fee: 'Fee', delivery: 'Delivery',
  installation: 'Installation', adjustment: 'Adjustment',
}

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
            <th style={{ ...th, width: 84 }}></th>
          </tr></thead>
          <tbody>
            {doc.items.map(it => (
              <Row key={it.id} it={it} cur={cur} perms={perms} locked={locked} artisans={artisans}
                open={openItem === it.id}
                onToggle={() => setOpenItem(openItem === it.id ? null : it.id)}
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

function Row({ it, cur, perms, locked, artisans, open, onToggle, onUpdate, onDelete }: {
  it: LineItem; cur: string; perms: DocPermissions; locked: boolean
  artisans: { id: string; name: string }[]
  open: boolean; onToggle: () => void
  onUpdate: (patch: Record<string, unknown>) => void
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
          <button className="btn btn-ghost btn-sm" onClick={onToggle}>{open ? 'Close' : 'Details'}</button>
          {!ro && <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} onClick={onDelete}>✕</button>}
        </td>
      </tr>
      {open && (
        <tr>
          <td style={{ ...td, background: 'var(--cream)' }} colSpan={perms.canPriceEdit ? 9 : 7}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <Mini label="Section on document" value={it.section} onSave={v => onUpdate({ section: v || null })} disabled={ro} />
              <Mini label="Size / dimensions" value={it.selected_size} onSave={v => onUpdate({ selectedSize: v || null })} disabled={ro} />
              <Mini label="Finish" value={it.selected_finish} onSave={v => onUpdate({ selectedFinish: v || null })} disabled={ro} />
              <Mini label="Fabric / upholstery" value={it.selected_fabric} onSave={v => onUpdate({ selectedFabric: v || null })} disabled={ro} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <div className="form-label" style={{ fontSize: 11 }}>Manufacturer</div>
                <select style={inp} disabled={ro} value={it.manufacturer_id ?? ''}
                  onChange={e => onUpdate({ manufacturerId: e.target.value || null })}>
                  <option value="">{it.manufacturer_name ? `${it.manufacturer_name} (free-text)` : '— none —'}</option>
                  {artisans.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <Mini label="Supplier SKU" value={it.supplier_sku} onSave={v => onUpdate({ supplierSku: v || null })} disabled={ro} />
              <Mini label="Unit of measure" value={it.unit_of_measure} onSave={v => onUpdate({ unitOfMeasure: v || 'each' })} disabled={ro} />
              <Mini label="Image URL (blank = product photo)" value={it.image_url} onSave={v => onUpdate({ imageUrl: v || null })} disabled={ro} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <MiniArea label="Full specification (one detail per line)" value={it.spec_details} onSave={v => onUpdate({ specDetails: v || null })} disabled={ro} />
              <MiniArea label="Note for client (shown on document)" value={it.notes} onSave={v => onUpdate({ notes: v || null })} disabled={ro} />
              <MiniArea label="Internal notes (never on documents)" value={it.internal_notes} onSave={v => onUpdate({ internalNotes: v || null })} disabled={ro} />
            </div>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 10, fontSize: 12, color: 'var(--stone)' }}>
              <input type="checkbox" checked={it.procurement_fee_eligible} disabled={ro}
                onChange={e => onUpdate({ procurementFeeEligible: e.target.checked })} />
              Counts towards the procurement-fee basis
            </label>
          </td>
        </tr>
      )}
    </>
  )
}

function Mini({ label, value, onSave, disabled }: { label: string; value: string | null; onSave: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <div className="form-label" style={{ fontSize: 11 }}>{label}</div>
      <input style={{ ...inp, opacity: disabled ? 0.55 : 1 }} defaultValue={value ?? ''} disabled={disabled}
        onBlur={e => { if (e.target.value !== (value ?? '')) onSave(e.target.value) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    </div>
  )
}

function MiniArea({ label, value, onSave, disabled }: { label: string; value: string | null; onSave: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <div className="form-label" style={{ fontSize: 11 }}>{label}</div>
      <textarea style={{ ...inp, minHeight: 64, resize: 'vertical', fontFamily: 'inherit', opacity: disabled ? 0.55 : 1 }}
        defaultValue={value ?? ''} disabled={disabled}
        onBlur={e => { if (e.target.value !== (value ?? '')) onSave(e.target.value) }} />
    </div>
  )
}
