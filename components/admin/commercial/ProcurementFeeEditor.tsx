'use client'

import { Field, box, inp, money, CommercialDoc } from './ui'
import { PricingMethodToggle } from './PricingMethodToggle'

const FEE_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'fixed', label: 'Fixed amount' },
  { value: 'tiered', label: 'Tiered (from settings)' },
]
const FEE_BASES = [
  { value: 'product_selling_subtotal', label: 'Product selling subtotal' },
  { value: 'product_cost_subtotal', label: 'Product cost subtotal' },
  { value: 'approved_procurement_value', label: 'Approved procurement value' },
  { value: 'selected_lines', label: 'Selected lines' },
  { value: 'manual_base_amount', label: 'Manual base amount' },
]

// Commercial controls: document pricing method, VAT, deposit, and the
// formula-driven procurement fee (with authorised override + reason).
export function ProcurementFeeEditor({ doc, locked, canPrice, onPatch }: {
  doc: CommercialDoc
  locked: boolean
  canPrice: boolean
  onPatch: (patch: Record<string, unknown>) => Promise<boolean>
}) {
  const ro = locked || !canPrice
  const cur = doc.currency ?? 'GBP'

  return (
    <div style={box}>
      <div className="label" style={{ marginBottom: 12 }}>Commercial terms</div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <div className="form-label">Pricing method (document default)</div>
          <PricingMethodToggle value={doc.pricing_method} disabled={ro}
            onChange={m => onPatch({ pricingMethod: m })} />
        </div>
        <Field width={110} label="VAT rate (%)" value={String(doc.vat_rate ?? '')} onSave={v => onPatch({ vatRate: v })} disabled={ro} />
        <Field width={110} label="Deposit (%)" value={String(doc.deposit_percent ?? '')} onSave={v => onPatch({ depositPercent: v })} disabled={ro} />
        <div>
          <div className="form-label">Deposit basis</div>
          <select style={{ ...inp, width: 160, opacity: ro ? 0.6 : 1 }} disabled={ro} value={doc.deposit_basis}
            onChange={e => onPatch({ depositBasis: e.target.value })}>
            <option value="gross_total">Gross total (inc VAT)</option>
            <option value="net_subtotal">Net subtotal (ex VAT)</option>
          </select>
        </div>
      </div>

      <div className="form-label" style={{ marginBottom: 6 }}>Procurement fee (formula-driven)</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div className="form-label" style={{ fontSize: 11 }}>Type</div>
          <select style={{ ...inp, width: 150, opacity: ro ? 0.6 : 1 }} disabled={ro} value={doc.procurement_fee_type ?? 'none'}
            onChange={e => onPatch({ procurementFeeType: e.target.value })}>
            {FEE_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {doc.procurement_fee_type !== 'none' && (
          <>
            <div>
              <div className="form-label" style={{ fontSize: 11 }}>Basis</div>
              <select style={{ ...inp, width: 210, opacity: ro ? 0.6 : 1 }} disabled={ro} value={doc.procurement_fee_basis ?? 'product_selling_subtotal'}
                onChange={e => onPatch({ procurementFeeBasis: e.target.value })}>
                {FEE_BASES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {doc.procurement_fee_type === 'percentage' && (
              <Field width={100} label="Rate (%)" value={doc.procurement_fee_value != null ? String(doc.procurement_fee_value) : ''} onSave={v => onPatch({ procurementFeeValue: v })} disabled={ro} />
            )}
            {doc.procurement_fee_type === 'fixed' && (
              <Field width={110} label={`Amount (${cur})`} value={doc.procurement_fee_value != null ? String(doc.procurement_fee_value) : ''} onSave={v => onPatch({ procurementFeeValue: v })} disabled={ro} />
            )}
            {(doc.procurement_fee_basis === 'manual_base_amount' || doc.procurement_fee_basis === 'approved_procurement_value') && (
              <Field width={140} label={`Base amount (${cur})`} value={doc.procurement_fee_manual_base != null ? String(doc.procurement_fee_manual_base) : ''} onSave={v => onPatch({ procurementFeeManualBase: v })} disabled={ro} />
            )}
            <div>
              <div className="form-label" style={{ fontSize: 11 }}>Manual override ({cur})</div>
              <input style={{ ...inp, width: 120, opacity: ro ? 0.6 : 1 }} type="number" step="0.01" disabled={ro}
                defaultValue={doc.procurement_fee_override ?? ''}
                onBlur={e => {
                  const v = e.target.value === '' ? null : parseFloat(e.target.value)
                  if (v === doc.procurement_fee_override) return
                  if (v !== null) {
                    const reason = prompt('Reason for overriding the calculated procurement fee? (required — Commercial Admin approval will be requested)')
                    if (!reason) { e.target.value = doc.procurement_fee_override != null ? String(doc.procurement_fee_override) : ''; return }
                    onPatch({ procurementFeeOverride: v, procurementFeeOverrideReason: reason })
                  } else {
                    onPatch({ procurementFeeOverride: null })
                  }
                }} />
            </div>
          </>
        )}
        <div style={{ fontSize: 12.5, color: 'var(--stone)', paddingBottom: 6 }}>
          Basis {money(doc.totals?.procurementFeeBasisAmount ?? 0, cur)} → fee <strong style={{ color: 'var(--forest)' }}>{money(doc.totals?.procurementFee ?? 0, cur)}</strong>
          {doc.procurement_fee_override != null && ' (overridden)'}
        </div>
      </div>
    </div>
  )
}
