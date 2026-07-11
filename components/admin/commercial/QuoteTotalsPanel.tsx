'use client'

import { box, money, CommercialDoc, DocPermissions } from './ui'

// Server-calculated totals. Every figure here comes from the
// authoritative calculation engine via the API — nothing is
// computed in the browser.
export function QuoteTotalsPanel({ doc, perms }: { doc: CommercialDoc; perms: DocPermissions }) {
  const t = doc.totals
  const cur = doc.currency ?? 'GBP'
  if (!t) return null

  const row = (label: string, value: string | null, opts: { strong?: boolean; muted?: boolean; internal?: boolean } = {}) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '4px 0',
      borderBottom: opts.strong ? '1.5px solid var(--forest)' : '1px solid var(--light-line)',
      fontSize: opts.strong ? 15 : 13,
      color: opts.internal ? '#8a6d1a' : opts.strong ? 'var(--forest)' : opts.muted ? 'var(--stone)' : 'inherit',
      fontWeight: opts.strong ? 600 : 400,
    }}>
      <span>{label}</span><span>{value}</span>
    </div>
  )

  return (
    <div style={box}>
      <div className="label" style={{ marginBottom: 12 }}>Totals (server-calculated)</div>
      <div style={{ display: 'grid', gridTemplateColumns: perms.canPriceEdit ? '1fr 1fr' : '1fr', gap: 32 }}>
        <div>
          {row('Products (ex VAT)', money(t.productSellingSubtotal ?? 0, cur))}
          {row('Services (ex VAT)', money(t.serviceSubtotal ?? 0, cur))}
          {(t.otherChargesSubtotal ?? 0) !== 0 && row('Delivery / other charges', money(t.otherChargesSubtotal ?? 0, cur))}
          {(t.discountTotal ?? 0) > 0 && row('Discounts', `−${money(t.discountTotal, cur)}`, { muted: true })}
          {(t.procurementFee ?? 0) > 0 && row('Procurement fee', money(t.procurementFee, cur))}
          {row('Net subtotal', money(t.netSubtotal ?? 0, cur))}
          {Object.entries(t.vatByCategory ?? {}).map(([cat, amt]) =>
            row(`VAT — ${cat.replace('_', ' ')}`, money(amt, cur), { muted: true }))}
          {row('VAT total', money(t.vatTotal ?? 0, cur))}
          {row('Gross total', money(t.grossTotal ?? 0, cur), { strong: true })}
          {row(`Deposit requested (${doc.deposit_percent}%)`, money(t.depositRequested ?? 0, cur))}
          {row('Payments received', money(t.paymentsReceived ?? 0, cur), { muted: true })}
          {row('Balance due', money(t.balanceDue ?? 0, cur), { strong: true })}
        </div>
        {perms.canPriceEdit && (
          <div>
            <div className="form-label" style={{ marginBottom: 4 }}>Internal profitability (never on client documents)</div>
            {row('Product cost subtotal', t.costIncomplete ? 'cost unavailable' : money(t.productCostSubtotal ?? null, cur), { internal: true })}
            {row('Effective markup', t.effectiveMarkupPercent != null ? `${t.effectiveMarkupPercent.toFixed(1)}%` : '—', { internal: true })}
            {row('Effective margin', t.effectiveMarginPercent != null ? `${t.effectiveMarginPercent.toFixed(1)}%` : '—', { internal: true })}
            {t.costIncomplete && (
              <p style={{ fontSize: 12, color: 'var(--stone)', marginTop: 8 }}>
                One or more product lines have no recorded supplier cost (legacy or new lines
                awaiting costing). Margins are not calculated from fabricated values.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
