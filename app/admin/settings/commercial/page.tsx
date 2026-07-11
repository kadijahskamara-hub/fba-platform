'use client'

// Protected commercial settings.
//
// - View: authorised commercial/finance roles (bank numbers masked
//   unless Ultra Admin).
// - Edit: Ultra Admin only for company, VAT and banking identity
//   (server-enforced), with password reauthentication + reason.
// - Commercial rules: Ultra Admin (commercial_settings_manage).
// - Every change lands in the immutable change history shown below.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Settings = Record<string, unknown>
interface HistoryRow {
  id: string; setting_group: string; changed_fields: string[]
  before_value: Record<string, unknown> | null; after_value: Record<string, unknown> | null
  reason: string | null; actor_email_snapshot: string | null; created_at: string
}

const box: React.CSSProperties = { background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 28, marginBottom: 22 }
const inp: React.CSSProperties = { width: '100%', border: '1px solid var(--light-line)', borderRadius: 4, padding: '7px 9px', fontSize: 13.5, background: 'var(--warm-white)' }

export default function CommercialSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [isUltra, setIsUltra] = useState(false)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [forbidden, setForbidden] = useState(false)
  const [draft, setDraft] = useState<Settings>({})
  const [toast, setToast] = useState<string | null>(null)

  // Reauth modal state
  const [pendingGroup, setPendingGroup] = useState<string | null>(null)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/commercial/settings').then(r => r.json()).catch(() => null)
    if (!res?.success) { setForbidden(true); return }
    setSettings(res.data); setDraft(res.data)
    setCanManage(Boolean(res.canManage)); setIsUltra(Boolean(res.isUltraAdmin))
    const hist = await fetch('/api/admin/commercial/settings/history').then(r => r.json()).catch(() => null)
    if (hist?.success) setHistory(hist.data)
  }, [])
  useEffect(() => { load() }, [load])

  const show = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000) }

  const set = (k: string, v: unknown) => setDraft(d => ({ ...d, [k]: v }))

  const save = async (group: string, fields: string[], opts: { reauth?: boolean } = {}) => {
    if (opts.reauth && !pendingGroup) { setPendingGroup(group); return }
    setBusy(true)
    const body: Record<string, unknown> = { group }
    for (const f of fields) body[f] = draft[f]
    if (opts.reauth) { body.confirmPassword = confirmPassword; body.reason = reason }
    const res = await fetch('/api/admin/commercial/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(r => r.json())
    setBusy(false)
    if (!res.success) { show(res.error ?? 'Save failed'); return }
    setPendingGroup(null); setConfirmPassword(''); setReason('')
    show('Saved.')
    await load()
  }

  if (forbidden) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--stone)' }}>
        You do not have access to commercial settings.
        <div style={{ marginTop: 12 }}><Link href="/admin/settings">← Back to settings</Link></div>
      </div>
    )
  }
  if (!settings) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--stone)' }}>Loading…</div>

  const s = (k: string) => (draft[k] ?? '') as string
  const n = (k: string) => draft[k] == null ? '' : String(draft[k])
  const thresholds = (draft.approval_thresholds ?? {}) as Record<string, number>
  const ro = !canManage

  const text = (k: string, label: string, opts: { placeholder?: string; disabled?: boolean; type?: string } = {}) => (
    <div>
      <div className="form-label">{label}</div>
      <input style={{ ...inp, opacity: (opts.disabled ?? ro) ? 0.6 : 1 }} type={opts.type ?? 'text'}
        value={s(k)} placeholder={opts.placeholder}
        disabled={opts.disabled ?? ro}
        onChange={e => set(k, e.target.value || null)} />
    </div>
  )
  const numeric = (k: string, label: string, opts: { disabled?: boolean } = {}) => (
    <div>
      <div className="form-label">{label}</div>
      <input style={{ ...inp, opacity: (opts.disabled ?? ro) ? 0.6 : 1 }} type="number" step="0.01"
        value={n(k)} disabled={opts.disabled ?? ro}
        onChange={e => set(k, e.target.value === '' ? null : Number(e.target.value))} />
    </div>
  )

  return (
    <>
      <div className="admin-header">
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Link href="/admin/settings" className="btn btn-ghost btn-sm">← Settings</Link>
            <h1 className="admin-title" style={{ margin: 0 }}>Commercial Settings</h1>
            {isUltra
              ? <span className="status-pill" style={{ background: 'var(--forest)', color: '#fff' }}>Ultra Admin</span>
              : <span className="status-pill">{canManage ? 'Manager' : 'View only'}</span>}
          </div>
          <p style={{ fontSize: 13, color: 'var(--stone)', marginTop: 6 }}>
            Protected financial configuration. Company, VAT and bank changes require Ultra Admin,
            password re-confirmation, and a reason; all changes are recorded immutably.
          </p>
        </div>
      </div>

      {toast && <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 60, background: 'var(--forest)', color: '#fff', padding: '10px 18px', fontSize: 13 }}>{toast}</div>}

      {/* 1. Company & VAT identity */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 4 }}>Company &amp; VAT identity</div>
        <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 14 }}>Ultra Admin only · reauthentication required</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {text('company_legal_name', 'Company legal name', { disabled: !isUltra })}
          {text('company_registration_number', 'Company registration number', { disabled: !isUltra })}
          {text('vat_number', 'VAT registration number', { disabled: !isUltra })}
          {text('invoice_email', 'Invoice email', { disabled: !isUltra })}
          {text('invoice_phone', 'Invoice phone', { disabled: !isUltra })}
          <div>
            <div className="form-label">VAT registered</div>
            <select style={{ ...inp, opacity: !isUltra ? 0.6 : 1 }} disabled={!isUltra}
              value={draft.vat_registered ? 'yes' : 'no'} onChange={e => set('vat_registered', e.target.value === 'yes')}>
              <option value="yes">Yes</option><option value="no">No</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="form-label">Registered address</div>
          <textarea style={{ ...inp, minHeight: 64, fontFamily: 'inherit', opacity: !isUltra ? 0.6 : 1 }} disabled={!isUltra}
            value={s('registered_address')} onChange={e => set('registered_address', e.target.value || null)} />
        </div>
        {isUltra && (
          <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} disabled={busy}
            onClick={() => save('company_identity', ['company_legal_name', 'company_registration_number', 'registered_address', 'vat_registered', 'vat_number', 'invoice_email', 'invoice_phone'], { reauth: true })}>
            Save identity…
          </button>
        )}
      </div>

      {/* 2. Bank details */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 4 }}>Bank details</div>
        <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 14 }}>
          Ultra Admin only · reauthentication required · values are masked for other viewers and in the change log
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
          {text('bank_name', 'Bank name', { disabled: !isUltra })}
          {text('bank_account_name', 'Account name', { disabled: !isUltra })}
          {text('bank_account_number', 'Account number', { disabled: !isUltra })}
          {text('bank_sort_code', 'Sort code', { disabled: !isUltra })}
        </div>
        {isUltra && (
          <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} disabled={busy}
            onClick={() => save('bank_details', ['bank_name', 'bank_account_name', 'bank_account_number', 'bank_sort_code'], { reauth: true })}>
            Save bank details…
          </button>
        )}
      </div>

      {/* 3. Commercial rules */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 4 }}>Pricing, deposits, fees &amp; expiry</div>
        <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 14 }}>Defaults applied to new quotes; authorised per-quote overrides remain possible.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
          <div>
            <div className="form-label">Default pricing method</div>
            <select style={{ ...inp, opacity: ro ? 0.6 : 1 }} disabled={ro} value={s('pricing_method_default') || 'markup'}
              onChange={e => set('pricing_method_default', e.target.value)}>
              <option value="markup">Markup %</option><option value="margin">Margin %</option>
            </select>
          </div>
          {numeric('default_vat_rate', 'Default VAT rate (%)')}
          <div>
            <div className="form-label">Default tax category</div>
            <select style={{ ...inp, opacity: ro ? 0.6 : 1 }} disabled={ro} value={s('default_tax_category') || 'standard'}
              onChange={e => set('default_tax_category', e.target.value)}>
              {['standard', 'reduced', 'zero', 'exempt', 'outside_scope'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {numeric('default_deposit_percent', 'Default deposit (%)')}
          {numeric('default_quote_expiry_days', 'Quote expiry (days)')}
          {text('default_currency', 'Default currency')}
          <div>
            <div className="form-label">Procurement fee type</div>
            <select style={{ ...inp, opacity: ro ? 0.6 : 1 }} disabled={ro} value={s('procurement_fee_type') || 'none'}
              onChange={e => set('procurement_fee_type', e.target.value)}>
              <option value="none">None</option><option value="percentage">Percentage</option>
              <option value="fixed">Fixed</option><option value="tiered">Tiered</option>
            </select>
          </div>
          <div>
            <div className="form-label">Procurement fee basis</div>
            <select style={{ ...inp, opacity: ro ? 0.6 : 1 }} disabled={ro} value={s('procurement_fee_basis') || 'product_selling_subtotal'}
              onChange={e => set('procurement_fee_basis', e.target.value)}>
              <option value="product_selling_subtotal">Product selling subtotal</option>
              <option value="product_cost_subtotal">Product cost subtotal</option>
              <option value="approved_procurement_value">Approved procurement value</option>
              <option value="selected_lines">Selected lines</option>
              <option value="manual_base_amount">Manual base amount</option>
            </select>
          </div>
          {numeric('procurement_fee_value', 'Procurement fee value (% or amount)')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
          <div>
            <div className="form-label">Default payment terms</div>
            <textarea style={{ ...inp, minHeight: 74, fontFamily: 'inherit', opacity: ro ? 0.6 : 1 }} disabled={ro}
              value={s('default_payment_terms')} onChange={e => set('default_payment_terms', e.target.value || null)} />
          </div>
          <div>
            <div className="form-label">Default lead time</div>
            <textarea style={{ ...inp, minHeight: 74, fontFamily: 'inherit', opacity: ro ? 0.6 : 1 }} disabled={ro}
              value={s('default_lead_time')} onChange={e => set('default_lead_time', e.target.value || null)} />
          </div>
        </div>

        <div className="form-label" style={{ marginTop: 16, marginBottom: 6 }}>Approval thresholds</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
          {([
            ['margin_commercial_below', 'Margin below (%) → Commercial Admin'],
            ['margin_ultra_below', 'Margin below (%) → Ultra Admin'],
            ['discount_commercial_above', 'Discount above (%) → Commercial Admin'],
            ['discount_ultra_above', 'Discount above (%) → Ultra Admin'],
          ] as const).map(([k, label]) => (
            <div key={k}>
              <div className="form-label" style={{ fontSize: 11 }}>{label}</div>
              <input style={{ ...inp, opacity: ro ? 0.6 : 1 }} type="number" step="0.5" disabled={ro}
                value={thresholds[k] ?? ''} onChange={e => set('approval_thresholds', { ...thresholds, [k]: Number(e.target.value) })} />
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--stone)', marginTop: 8 }}>Negative-margin lines are always blocked pending Ultra Admin approval.</p>
        {canManage && (
          <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} disabled={busy}
            onClick={() => save('commercial_rules', ['pricing_method_default', 'default_vat_rate', 'default_tax_category', 'default_deposit_percent', 'default_quote_expiry_days', 'default_currency', 'default_payment_terms', 'default_lead_time', 'procurement_fee_type', 'procurement_fee_basis', 'procurement_fee_value', 'approval_thresholds'])}>
            Save commercial rules
          </button>
        )}
      </div>

      {/* 4. Change history */}
      <div style={box}>
        <div className="label" style={{ marginBottom: 12 }}>Change history (immutable)</div>
        {history.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--stone)' }}>No changes recorded yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map(hr => (
              <div key={hr.id} style={{ fontSize: 12.5, borderBottom: '1px solid var(--light-line)', paddingBottom: 8 }}>
                <strong>{new Date(hr.created_at).toLocaleString('en-GB')}</strong>
                {' · '}{hr.actor_email_snapshot ?? 'unknown'}
                {' · '}<span style={{ color: 'var(--forest)' }}>{hr.setting_group}</span>
                {' · fields: '}{hr.changed_fields.join(', ')}
                {hr.reason && <div style={{ color: 'var(--stone)' }}>Reason: {hr.reason}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reauthentication modal */}
      {pendingGroup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--warm-white)', padding: 28, width: 420, border: '1px solid var(--light-line)' }}>
            <div className="label" style={{ marginBottom: 8 }}>Confirm sensitive change</div>
            <p style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 14 }}>
              Changing <strong>{pendingGroup === 'bank_details' ? 'bank details' : 'company / VAT identity'}</strong> requires
              your password and a reason. This is recorded in the immutable change log.
            </p>
            <div className="form-label">Your password</div>
            <input style={inp} type="password" autoComplete="current-password" value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)} />
            <div className="form-label" style={{ marginTop: 10 }}>Reason for change *</div>
            <textarea style={{ ...inp, minHeight: 64, fontFamily: 'inherit' }} value={reason} onChange={e => setReason(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary btn-sm" disabled={busy || !confirmPassword || !reason.trim()}
                onClick={() => {
                  const fields = pendingGroup === 'bank_details'
                    ? ['bank_name', 'bank_account_name', 'bank_account_number', 'bank_sort_code']
                    : ['company_legal_name', 'company_registration_number', 'registered_address', 'vat_registered', 'vat_number', 'invoice_email', 'invoice_phone']
                  save(pendingGroup, fields, { reauth: true })
                }}>
                Confirm &amp; save
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setPendingGroup(null); setConfirmPassword(''); setReason('') }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
