'use client'

// Custom Match request detail (Sprint 11): full request context, private
// attachments, and the status workflow (server-enforced transitions).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CUSTOM_MATCH_STATUS_LABELS, type CustomMatchStatus } from '@/lib/customMatch/logic'

type Detail = Record<string, unknown> & {
  id: string; reference_number: string; status: CustomMatchStatus
  allowedNextStatuses: CustomMatchStatus[]
  attachments: Array<Record<string, unknown>>
  product?: { id: string; name: string; sku: string | null; slug: string } | null
  material_type?: { name: string } | null
  assignee?: { id: string; first_name: string; last_name: string } | null
}

const inp: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--light-line)', background: '#fff' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--stone)' }}>{label}</div>
      <div style={{ fontSize: 13.5 }}>{children}</div>
    </div>
  )
}

export default function CustomMatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [d, setD] = useState<Detail | null>(null)
  const [staff, setStaff] = useState<Array<{ id: string; first_name: string; last_name: string }>>([])
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/custom-match/${id}`).then(r => r.json())
    if (res.success) setD(res.data)
    else setErr(res.error ?? 'Could not load the request')
  }, [id])
  useEffect(() => {
    load()
    fetch('/api/admin/staff').then(r => r.json()).then(j => {
      const list = (j.data ?? j.staff ?? []) as Array<Record<string, unknown>>
      setStaff(list.map(u => ({ id: u.id as string, first_name: (u.first_name as string) ?? '', last_name: (u.last_name as string) ?? '' })))
    }).catch(() => {})
  }, [load])

  const patch = async (body: Record<string, unknown>, note?: string) => {
    setErr(''); setMsg(''); setBusy(true)
    const res = await fetch(`/api/admin/custom-match/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(r => r.json())
    setBusy(false)
    if (!res.success) setErr(res.error ?? 'Update failed')
    else { setMsg(note ?? 'Saved.'); load(); setTimeout(() => setMsg(''), 4000) }
  }

  if (!d) return <p style={{ color: 'var(--stone)', fontSize: 13, padding: 40 }}>{err || 'Loading…'}</p>

  const reqs: Array<[string, boolean]> = [
    ['Grain / pattern direction match', !!d.grain_pattern_match],
    ['Stain / tone match', !!d.stain_tone_match],
    ['Exact batch match', !!d.exact_batch_match],
    ['Sheen / gloss match', !!d.sheen_gloss_match],
    ['Physical sample available', !!d.physical_sample_available],
  ]

  return (
    <>
      <div className="admin-header">
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href="/admin/custom-match" className="btn btn-ghost btn-sm">← Queue</Link>
            <h1 className="admin-title" style={{ margin: 0 }}>{d.reference_number}</h1>
            <span className="status-pill">{CUSTOM_MATCH_STATUS_LABELS[d.status]}</span>
          </div>
          <p className="admin-subtitle">
            {d.product?.name}{d.product?.sku ? ` · ${d.product.sku}` : ''} · qty {String(d.quantity)}
            {d.product?.slug && <> · <Link href={`/admin/products/${d.product.slug}`} style={{ color: 'var(--forest)' }}>open product</Link></>}
          </p>
        </div>
      </div>

      {err && <p style={{ color: '#a33', fontSize: 13 }}>{err}</p>}
      {msg && <p style={{ color: '#1e7e34', fontSize: 13 }}>{msg}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        <div>
          <div className="admin-card" style={{ padding: 18, marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Material request</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Field label="Material type">{d.material_type?.name ?? '—'}</Field>
              <Field label="Application / component">{(d.application_component as string) ?? '—'}</Field>
              <Field label="Supplier / brand">{(d.supplier_brand as string) ?? '—'}</Field>
              <Field label="Material code">{(d.material_code as string) ?? '—'}</Field>
              <Field label="Sample / batch ref">{(d.sample_batch_reference as string) ?? '—'}</Field>
              <Field label="Requested colour">{(d.requested_colour as string) ?? '—'}</Field>
              <Field label="Gloss level">{((d.gloss_level as string) ?? '—').replace(/_/g, ' ')}</Field>
              <Field label="Fire requirement">{(d.fire_requirement as string) ?? '—'}</Field>
              <Field label="Performance requirement">{(d.performance_requirement as string) ?? '—'}</Field>
              <Field label="Colour tolerance">{(d.colour_tolerance as string) ?? '—'}</Field>
            </div>
            <Field label="Match requirements">
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {reqs.map(([label, on]) => <li key={label} style={{ opacity: on ? 1 : 0.4 }}>{on ? '✓' : '—'} {label}</li>)}
              </ul>
            </Field>
            {typeof d.additional_notes === 'string' && d.additional_notes && <Field label="Additional notes">{d.additional_notes}</Field>}
            {Object.keys((d.dimensions_application as Record<string, unknown>) ?? {}).length > 0 && (
              <Field label="Dimensions / application">
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {Object.entries(d.dimensions_application as Record<string, unknown>).map(([k, v]) => (
                    <li key={k}>{k.replace(/_/g, ' ')}: {String(v)}</li>
                  ))}
                </ul>
              </Field>
            )}
            {Array.isArray(d.selected_finishes_snapshot) && (d.selected_finishes_snapshot as unknown[]).length > 0 && (
              <Field label="Standard finishes selected at submission">
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {(d.selected_finishes_snapshot as Array<Record<string, unknown>>).map((s, i) => (
                    <li key={i}>{String(s.groupLabel ?? s.group_label ?? '')}: {String(s.finishLabel ?? s.finish_label ?? '')}</li>
                  ))}
                </ul>
              </Field>
            )}
          </div>

          <div className="admin-card" style={{ padding: 18, marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Requester</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Field label="Name">{String(d.requester_name)}</Field>
              <Field label="Studio">{(d.requester_studio as string) ?? '—'}</Field>
              <Field label="Email">{String(d.requester_email)}</Field>
              <Field label="Telephone">{(d.requester_telephone as string) ?? '—'}</Field>
            </div>
          </div>

          <div className="admin-card" style={{ padding: 18 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Attachments</h2>
            {d.attachments.length === 0 && <p style={{ fontSize: 13, color: 'var(--stone)' }}>None uploaded.</p>}
            {d.attachments.map(a => (
              <div key={String(a.id)} style={{ fontSize: 13, marginBottom: 6 }}>
                {a.signedUrl
                  ? <a href={String(a.signedUrl)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--forest)' }}>{String(a.original_filename)}</a>
                  : String(a.original_filename)}
                <span style={{ color: 'var(--stone)' }}> · {Math.round(Number(a.file_size) / 1024)} KB · {String(a.visibility)}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="admin-card" style={{ padding: 18, marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Workflow</h2>
            <Field label="Move to">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {d.allowedNextStatuses.length === 0 && <span style={{ fontSize: 13, color: 'var(--stone)' }}>This request is closed.</span>}
                {d.allowedNextStatuses.map(s => (
                  <button key={s} className="btn btn-secondary btn-sm" disabled={busy}
                    onClick={() => patch({ status: s }, `Moved to ${CUSTOM_MATCH_STATUS_LABELS[s]}.`)}>
                    {CUSTOM_MATCH_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Assigned to">
              <select style={{ ...inp, width: '100%' }} value={d.assignee?.id ?? ''} disabled={busy}
                onChange={e => patch({ assignedTo: e.target.value || null })} aria-label="Assign to">
                <option value="">Unassigned</option>
                {staff.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </select>
            </Field>
          </div>

          <div className="admin-card" style={{ padding: 18, marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Assessment (internal)</h2>
            <Field label="Maker feasibility">
              <select style={{ ...inp, width: '100%' }} value={(d.maker_feasibility as string) ?? ''} disabled={busy}
                onChange={e => patch({ makerFeasibility: e.target.value || null })} aria-label="Maker feasibility">
                <option value="">Not assessed</option>
                <option value="pending">Pending</option>
                <option value="feasible">Feasible</option>
                <option value="feasible_with_conditions">Feasible with conditions</option>
                <option value="not_feasible">Not feasible</option>
              </select>
            </Field>
            <Field label="Cost adjustment (per unit)">
              <input type="number" step="0.01" style={{ ...inp, width: '100%' }} defaultValue={(d.cost_adjustment as number) ?? ''}
                disabled={busy} aria-label="Cost adjustment"
                onBlur={e => patch({ costAdjustment: e.target.value === '' ? null : parseFloat(e.target.value) })} />
            </Field>
            <Field label="Lead-time adjustment (weeks)">
              <input type="number" step="0.5" style={{ ...inp, width: '100%' }} defaultValue={(d.lead_time_adjustment_weeks as number) ?? ''}
                disabled={busy} aria-label="Lead time adjustment"
                onBlur={e => patch({ leadTimeAdjustmentWeeks: e.target.value === '' ? null : parseFloat(e.target.value) })} />
            </Field>
            <Field label="Sample status">
              <select style={{ ...inp, width: '100%' }} value={(d.physical_sample_status as string) ?? 'none'} disabled={busy}
                onChange={e => patch({ physicalSampleStatus: e.target.value })} aria-label="Sample status">
                {['none','client_has_sample','sample_requested','sample_in_transit','sample_received','sample_sent_to_maker','sample_approved','sample_rejected']
                  .map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </Field>
            <Field label="Feasibility notes">
              <textarea style={{ ...inp, width: '100%', minHeight: 60 }} defaultValue={(d.feasibility_notes as string) ?? ''}
                disabled={busy} aria-label="Feasibility notes"
                onBlur={e => { if (e.target.value !== ((d.feasibility_notes as string) ?? '')) patch({ feasibilityNotes: e.target.value }) }} />
            </Field>
            <Field label="Internal notes">
              <textarea style={{ ...inp, width: '100%', minHeight: 60 }} defaultValue={(d.internal_notes as string) ?? ''}
                disabled={busy} aria-label="Internal notes"
                onBlur={e => { if (e.target.value !== ((d.internal_notes as string) ?? '')) patch({ internalNotes: e.target.value }) }} />
            </Field>
          </div>

          <div className="admin-card" style={{ padding: 18 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Approvals</h2>
            <Field label="Client approval">
              <select style={{ ...inp, width: '100%' }} value={(d.client_approval_status as string) ?? 'not_requested'} disabled={busy}
                onChange={e => patch({ clientApprovalStatus: e.target.value })} aria-label="Client approval">
                {['not_requested','requested','approved','rejected'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </Field>
            <Field label="Maker approval">
              <select style={{ ...inp, width: '100%' }} value={(d.maker_approval_status as string) ?? 'not_requested'} disabled={busy}
                onChange={e => patch({ makerApprovalStatus: e.target.value })} aria-label="Maker approval">
                {['not_requested','requested','approved','rejected'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </Field>
            {d.allowedNextStatuses.includes('converted_to_quote') && (
              <button className="btn btn-primary btn-full" disabled={busy} style={{ marginTop: 10 }}
                onClick={async () => {
                  setErr(''); setBusy(true)
                  const res = await fetch(`/api/admin/custom-match/${id}/convert-to-quote`, { method: 'POST' })
                    .then(r => r.json()).catch(() => ({ success: false, error: 'Request failed.' }))
                  setBusy(false)
                  if (!res.success) setErr(res.error ?? 'Conversion failed')
                  else {
                    setMsg(res.data.createdQuote ? 'Converted — a new quote was created.' : 'Converted — the line was added to the linked quote.')
                    load()
                  }
                }}>
                Convert to quote line
              </button>
            )}
            {typeof d.proforma_id === 'string' && d.proforma_id && (
              <p style={{ fontSize: 12.5, marginTop: 10 }}>
                <Link href={`/admin/quotes/${d.proforma_id}`} style={{ color: 'var(--forest)', fontWeight: 500 }}>
                  Open linked quote →
                </Link>
              </p>
            )}
            <p style={{ fontSize: 12, color: 'var(--stone)', marginTop: 8 }}>
              Converting adds a fully-specified line to the quote — the Custom Match specification
              flows into client documents, supplier POs and order-sheet snapshots automatically.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
