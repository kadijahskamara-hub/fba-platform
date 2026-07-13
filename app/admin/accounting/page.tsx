'use client'

import { useEffect, useState, useCallback } from 'react'

// ============================================================
// Accounting hub (Sprint 6): periods (close/reopen), export runs,
// reports, account-code mappings, and the refunds queue. All actions
// call the permission-gated APIs; period locks & segregation are
// enforced server-side.
// ============================================================

type Tab = 'periods' | 'exports' | 'refunds' | 'reports' | 'mappings'
const TABS: Array<[Tab, string]> = [['periods', 'Periods'], ['exports', 'Exports'], ['refunds', 'Refunds'], ['reports', 'Reports'], ['mappings', 'Account codes']]

export default function AccountingHub() {
  const [tab, setTab] = useState<Tab>('periods')
  return (
    <div style={{ padding: '28px 36px', maxWidth: 1150, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Georgia, serif', color: '#1B4332', fontSize: 26 }}>Accounting</h1>
      <p style={{ color: '#6b6257', marginTop: 0, fontSize: 14 }}>Period control, exports for your accounts package, reports, and refunds.</p>
      <div style={{ display: 'flex', gap: 6, margin: '14px 0 20px', borderBottom: '1px solid #e6e0d6' }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14,
            borderBottom: tab === k ? '2px solid #1B4332' : '2px solid transparent',
            color: tab === k ? '#1B4332' : '#6b6257', fontWeight: tab === k ? 700 : 400,
          }}>{label}</button>
        ))}
      </div>
      {tab === 'periods' && <Periods />}
      {tab === 'exports' && <Exports />}
      {tab === 'refunds' && <Refunds />}
      {tab === 'reports' && <Reports />}
      {tab === 'mappings' && <Mappings />}
    </div>
  )
}

function useMsg() {
  const [msg, setMsg] = useState<string | null>(null)
  return { msg, setMsg }
}

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  return { ok: res.ok, json: await res.json().catch(() => ({})) }
}

function Periods() {
  const [periods, setPeriods] = useState<Array<Record<string, unknown>>>([])
  const [label, setLabel] = useState(''); const [start, setStart] = useState(''); const [end, setEnd] = useState('')
  const { msg, setMsg } = useMsg()
  const load = useCallback(async () => { const r = await fetch('/api/admin/accounting/periods'); const j = await r.json(); setPeriods(j.periods ?? []) }, [])
  useEffect(() => { load() }, [load])

  async function create() {
    const { ok, json } = await post('/api/admin/accounting/periods', { label, startsOn: start, endsOn: end })
    setMsg(ok ? 'Period created.' : json.error); if (ok) { setLabel(''); setStart(''); setEnd(''); load() }
  }
  async function close(id: string) { const { ok, json } = await post(`/api/admin/accounting/periods/${id}/close`); setMsg(ok ? 'Closed.' : json.error); load() }
  async function reopen(id: string) { const reason = prompt('Reason for reopening this closed period?'); if (!reason) return; const { ok, json } = await post(`/api/admin/accounting/periods/${id}/reopen`, { reason }); setMsg(ok ? 'Reopened.' : json.error); load() }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', marginBottom: 14 }}>
        <Field label="Label (e.g. 2026-Q3)"><input value={label} onChange={e => setLabel(e.target.value)} style={inp} /></Field>
        <Field label="Start"><input type="date" value={start} onChange={e => setStart(e.target.value)} style={inp} /></Field>
        <Field label="End"><input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inp} /></Field>
        <button onClick={create} style={btn}>Create period</button>
      </div>
      {msg && <p style={note}>{msg}</p>}
      <table style={table}><thead><tr style={trh}><th style={th}>Label</th><th style={th}>Range</th><th style={th}>Status</th><th style={th}></th></tr></thead>
        <tbody>{periods.map(p => (
          <tr key={p.id as string} style={tr}>
            <td style={td}>{p.label as string}</td>
            <td style={td}>{p.starts_on as string} → {p.ends_on as string}</td>
            <td style={td}><span style={{ color: p.status === 'closed' ? '#B4472A' : '#3F7A54', fontWeight: 600 }}>{p.status as string}</span></td>
            <td style={td}>{p.status === 'open'
              ? <button onClick={() => close(p.id as string)} style={btnSm}>Close</button>
              : <button onClick={() => reopen(p.id as string)} style={btnGhostSm}>Reopen</button>}</td>
          </tr>))}
          {periods.length === 0 && <tr><td colSpan={4} style={{ ...td, color: '#9E9589' }}>No periods yet.</td></tr>}
        </tbody></table>
    </div>
  )
}

function Exports() {
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([])
  const [adapter, setAdapter] = useState('generic'); const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const { msg, setMsg } = useMsg()
  const load = useCallback(async () => { const r = await fetch('/api/admin/accounting/exports'); const j = await r.json(); setRuns(j.runs ?? []) }, [])
  useEffect(() => { load() }, [load])
  async function run() {
    const { ok, json } = await post('/api/admin/accounting/exports', { adapter, from, to })
    setMsg(ok ? `Export ${json.run?.run_number} created.` : json.error); if (ok) load()
  }
  const files = ['invoices', 'credit_notes', 'payments', 'refunds']
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', marginBottom: 14 }}>
        <Field label="Package"><select value={adapter} onChange={e => setAdapter(e.target.value)} style={inp}>
          <option value="xero">Xero</option><option value="quickbooks">QuickBooks</option><option value="sage">Sage</option><option value="generic">Generic</option></select></Field>
        <Field label="From"><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp} /></Field>
        <Field label="To"><input type="date" value={to} onChange={e => setTo(e.target.value)} style={inp} /></Field>
        <button onClick={run} style={btn}>Run export</button>
      </div>
      {msg && <p style={note}>{msg}</p>}
      <table style={table}><thead><tr style={trh}><th style={th}>Run</th><th style={th}>Package</th><th style={th}>Rows</th><th style={th}>Files</th></tr></thead>
        <tbody>{runs.map(r => {
          const rc = (r.row_counts ?? {}) as Record<string, number>
          return (<tr key={r.id as string} style={tr}>
            <td style={td}><code style={{ fontSize: 12 }}>{r.run_number as string}</code></td>
            <td style={td}>{r.adapter as string}</td>
            <td style={td}>{Object.entries(rc).map(([k, v]) => `${k}:${v}`).join(' · ') || '—'}</td>
            <td style={td}>{files.map(f => <a key={f} href={`/api/admin/accounting/exports/${r.id}/download?file=${f}`} style={{ marginRight: 8, color: '#1B4332', fontSize: 12 }}>{f}</a>)}</td>
          </tr>)
        })}
          {runs.length === 0 && <tr><td colSpan={4} style={{ ...td, color: '#9E9589' }}>No export runs yet.</td></tr>}
        </tbody></table>
    </div>
  )
}

function Refunds() {
  const [refunds, setRefunds] = useState<Array<Record<string, unknown>>>([])
  const { msg, setMsg } = useMsg()
  const load = useCallback(async () => { const r = await fetch('/api/admin/refunds'); const j = await r.json(); setRefunds(j.refunds ?? []) }, [])
  useEffect(() => { load() }, [load])
  async function act(id: string, action: string, body?: unknown) { const { ok, json } = await post(`/api/admin/refunds/${id}/${action}`, body); setMsg(ok ? 'Done.' : json.error); load() }
  return (
    <div>
      <p style={{ color: '#6b6257', fontSize: 13 }}>Record refunds from the payment or credit-note detail pages. Approval is Ultra-only and cannot be done by the recorder.</p>
      {msg && <p style={note}>{msg}</p>}
      <table style={table}><thead><tr style={trh}><th style={th}>Refund</th><th style={th}>Amount</th><th style={th}>Date</th><th style={th}>Status</th><th style={th}></th></tr></thead>
        <tbody>{refunds.map(r => (
          <tr key={r.id as string} style={tr}>
            <td style={td}><code style={{ fontSize: 12 }}>{r.refund_number as string}</code></td>
            <td style={td}>{r.currency as string} {Number(r.amount).toFixed(2)}</td>
            <td style={td}>{r.refund_date as string}</td>
            <td style={td}>{r.status as string}</td>
            <td style={td}>
              {r.status === 'pending' && <button onClick={() => act(r.id as string, 'approve')} style={btnSm}>Approve</button>}
              {r.status === 'approved' && <button onClick={() => act(r.id as string, 'complete')} style={btnSm}>Complete</button>}
              {['pending', 'approved'].includes(r.status as string) && <button onClick={() => { const reason = prompt('Cancel reason?'); if (reason) act(r.id as string, 'cancel', { reason }) }} style={btnGhostSm}>Cancel</button>}
            </td>
          </tr>))}
          {refunds.length === 0 && <tr><td colSpan={5} style={{ ...td, color: '#9E9589' }}>No refunds.</td></tr>}
        </tbody></table>
    </div>
  )
}

function Reports() {
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const q = (extra: Record<string, string> = {}) => new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...extra }).toString()
  const link = (r: string, extra?: Record<string, string>) => `/api/admin/accounting/reports/${r}?${q(extra)}`
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginBottom: 14 }}>
        <Field label="From"><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp} /></Field>
        <Field label="To"><input type="date" value={to} onChange={e => setTo(e.target.value)} style={inp} /></Field>
      </div>
      <ul style={{ lineHeight: 2, fontSize: 14 }}>
        <li><a href={link('aged-debtors')} target="_blank" rel="noreferrer" style={rl}>Aged debtors</a></li>
        <li><a href={link('vat-summary')} target="_blank" rel="noreferrer" style={rl}>VAT summary (accrual)</a></li>
        <li><a href={link('reconciliation-exceptions')} target="_blank" rel="noreferrer" style={rl}>Reconciliation exceptions</a></li>
        <li style={{ color: '#9E9589', fontSize: 13 }}>Period integrity &amp; audit-trail open from a period / invoice record.</li>
      </ul>
    </div>
  )
}

function Mappings() {
  const [mappings, setMappings] = useState<Array<Record<string, unknown>>>([])
  const { msg, setMsg } = useMsg()
  const load = useCallback(async () => { const r = await fetch('/api/admin/accounting/mappings'); const j = await r.json(); setMappings(j.mappings ?? []) }, [])
  useEffect(() => { load() }, [load])
  async function save(m: Record<string, unknown>) {
    const res = await fetch('/api/admin/accounting/mappings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adapter: m.adapter, sales_account: m.sales_account, debtors_account: m.debtors_account }) })
    const j = await res.json().catch(() => ({})); setMsg(res.ok ? 'Saved.' : (j.error ?? 'Save failed (Ultra only).'))
  }
  return (
    <div>
      <p style={{ color: '#6b6257', fontSize: 13 }}>Account codes per package (Ultra Admin only). VAT codes are pre-seeded with UK defaults.</p>
      {msg && <p style={note}>{msg}</p>}
      <table style={table}><thead><tr style={trh}><th style={th}>Package</th><th style={th}>Sales</th><th style={th}>Debtors</th><th style={th}></th></tr></thead>
        <tbody>{mappings.map((m, i) => (
          <tr key={m.adapter as string} style={tr}>
            <td style={td}>{m.adapter as string}</td>
            <td style={td}><input defaultValue={m.sales_account as string} onChange={e => (mappings[i].sales_account = e.target.value)} style={{ ...inp, width: 90 }} /></td>
            <td style={td}><input defaultValue={m.debtors_account as string} onChange={e => (mappings[i].debtors_account = e.target.value)} style={{ ...inp, width: 90 }} /></td>
            <td style={td}><button onClick={() => save(mappings[i])} style={btnSm}>Save</button></td>
          </tr>))}
        </tbody></table>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#8A6D3B', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}{children}</label>
}

const inp: React.CSSProperties = { padding: '7px 9px', border: '1px solid #d8d2c8', borderRadius: 6, fontSize: 13 }
const btn: React.CSSProperties = { background: '#1B4332', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }
const btnSm: React.CSSProperties = { ...btn, padding: '4px 10px', fontSize: 12 }
const btnGhostSm: React.CSSProperties = { background: '#fff', color: '#1B4332', border: '1px solid #cfc8bc', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginLeft: 6 }
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', fontSize: 13.5 }
const trh: React.CSSProperties = { background: '#F4F1ED', textAlign: 'left', color: '#6b6257' }
const th: React.CSSProperties = { padding: '9px 11px', fontWeight: 600, fontSize: 12 }
const tr: React.CSSProperties = { borderTop: '1px solid #efeae2' }
const td: React.CSSProperties = { padding: '9px 11px', color: '#3a352f' }
const note: React.CSSProperties = { fontSize: 13, color: '#1B4332', background: '#EEF3EE', padding: '8px 12px', borderRadius: 6 }
const rl: React.CSSProperties = { color: '#1B4332', fontWeight: 600 }
