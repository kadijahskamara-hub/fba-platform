'use client'

import { useState } from 'react'
import { inp, money, sym } from './ui'

// Add a product line: catalogue search or bespoke entry.
export function ProductLineEditor({ cur, canPrice, onAdd }: {
  cur: string
  canPrice: boolean
  onAdd: (payload: Record<string, unknown>) => Promise<void>
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; trade_price: number | null }[]>([])
  const [showBespoke, setShowBespoke] = useState(false)
  const [busy, setBusy] = useState(false)
  const [bespoke, setBespoke] = useState({ name: '', manufacturerName: '', supplierCost: '', sellingPrice: '', quantity: '1' })

  const search = async (term: string) => {
    setQ(term)
    if (term.trim().length < 2) { setResults([]); return }
    const res = await fetch(`/api/products?q=${encodeURIComponent(term)}&limit=8`).then(r => r.json())
    setResults((res.data ?? []).map((p: Record<string, unknown>) => ({
      id: p.id as string, name: p.name as string, trade_price: (p.trade_price as number) ?? null,
    })))
  }

  const addProduct = async (productId: string) => {
    setBusy(true)
    await onAdd({ lineType: 'product', productId })
    setBusy(false); setQ(''); setResults([])
  }

  const addBespoke = async () => {
    if (!bespoke.name.trim()) { alert('A name is required for a bespoke item.'); return }
    setBusy(true)
    const payload: Record<string, unknown> = {
      lineType: 'product',
      name: bespoke.name,
      manufacturerName: bespoke.manufacturerName || null,
      quantity: parseFloat(bespoke.quantity) || 1,
    }
    if (canPrice) {
      if (bespoke.supplierCost) payload.supplierCostUnit = parseFloat(bespoke.supplierCost)
      if (bespoke.sellingPrice) { payload.sellingPriceUnit = parseFloat(bespoke.sellingPrice); payload.pricingMethod = 'manual' }
    }
    await onAdd(payload)
    setBusy(false)
    setBespoke({ name: '', manufacturerName: '', supplierCost: '', sellingPrice: '', quantity: '1' })
    setShowBespoke(false)
  }

  return (
    <div>
      <div className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Products</div>
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <input style={{ ...inp, maxWidth: 420 }} placeholder="Search catalogue to add a product…" value={q} onChange={e => search(e.target.value)} />
        {results.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 20, background: 'var(--warm-white)', border: '1px solid var(--light-line)', maxWidth: 420, width: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
            {results.map(r => (
              <button key={r.id} disabled={busy}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}
                onClick={() => addProduct(r.id)}>
                {r.name} <span style={{ color: 'var(--stone)' }}>· trade {money(r.trade_price, cur)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {!showBespoke ? (
        <button className="btn btn-secondary btn-sm" onClick={() => setShowBespoke(true)}>+ Bespoke / off-catalogue item</button>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', background: 'var(--cream)', padding: 12, border: '1px solid var(--light-line)' }}>
          <div><div className="form-label">Name *</div><input style={{ ...inp, width: 190 }} value={bespoke.name} onChange={e => setBespoke(b => ({ ...b, name: e.target.value }))} /></div>
          <div><div className="form-label">Manufacturer</div><input style={{ ...inp, width: 140 }} value={bespoke.manufacturerName} onChange={e => setBespoke(b => ({ ...b, manufacturerName: e.target.value }))} placeholder="free text" /></div>
          {canPrice && <div><div className="form-label">Cost ({sym(cur)})</div><input style={{ ...inp, width: 90 }} type="number" step="0.01" value={bespoke.supplierCost} onChange={e => setBespoke(b => ({ ...b, supplierCost: e.target.value }))} /></div>}
          {canPrice && <div><div className="form-label">Selling ({sym(cur)})</div><input style={{ ...inp, width: 90 }} type="number" step="0.01" value={bespoke.sellingPrice} onChange={e => setBespoke(b => ({ ...b, sellingPrice: e.target.value }))} /></div>}
          <div><div className="form-label">Qty</div><input style={{ ...inp, width: 64 }} type="number" value={bespoke.quantity} onChange={e => setBespoke(b => ({ ...b, quantity: e.target.value }))} /></div>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={addBespoke}>Add</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBespoke(false)}>Cancel</button>
        </div>
      )}
    </div>
  )
}
