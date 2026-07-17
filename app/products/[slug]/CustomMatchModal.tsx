'use client'

// Custom Match / COM modal (Sprint 13) — matches the supplied reference:
// forest-green header, product summary strip, material-type selection,
// supplier/sample references, gloss buttons, match-requirement
// checkboxes, material-conditional dimension fields, notes, contact and
// secure attachments. Fully functional: submission creates a real
// custom_match_requests record and shows the FBA-CM reference.
//
// Accessibility: dialog role, focus trap, Escape close, focus return,
// body scroll lock, internal scrolling, mobile full-height.

import { useEffect, useRef, useState } from 'react'
import { fieldsForMaterial, DIMENSION_FIELD_LABELS, GLOSS_LEVELS } from '@/lib/customMatch/logic'

const GLOSS_LABELS: Record<string, string> = {
  matt: 'Matt', satin: 'Satin', semi_gloss: 'Semi-Gloss', full_gloss: 'Full Gloss', custom_na: 'Custom / N.A.',
}

export interface CustomMatchProductSummary {
  id: string
  name: string
  sku: string | null
  makerName: string | null
  imageUrl: string | null
}

const inp: React.CSSProperties = {
  padding: '10px 12px', fontSize: 13.5, border: '1px solid var(--light-line)',
  background: '#fff', width: '100%', minHeight: 44,
}
const lbl: React.CSSProperties = {
  fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'var(--stone)', display: 'block', marginBottom: 6,
}

export default function CustomMatchModal({ product, materialTypes, selections, quantity, defaultEmail, onClose }: {
  product: CustomMatchProductSummary
  materialTypes: Array<{ id: string; name: string; slug: string }>
  selections: Array<{ finishOptionId: string; groupLabel: string; finishLabel: string }>
  quantity: number
  defaultEmail?: string | null
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [reference, setReference] = useState<string | null>(null)
  const [uploadNote, setUploadNote] = useState('')

  const [materialTypeId, setMaterialTypeId] = useState(materialTypes[0]?.id ?? '')
  const [supplierBrand, setSupplierBrand] = useState('')
  const [sampleBatchReference, setSampleBatchReference] = useState('')
  const [requestedColour, setRequestedColour] = useState('')
  const [gloss, setGloss] = useState<string>('matt')
  const [reqs, setReqs] = useState({ grain: false, stain: false, batch: false, sheen: false, sample: false })
  const [dims, setDims] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [name, setName] = useState('')
  const [studio, setStudio] = useState('')
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [telephone, setTelephone] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [hp, setHp] = useState('')

  const materialSlug = materialTypes.find(t => t.id === materialTypeId)?.slug ?? 'other'
  const dimFields = fieldsForMaterial(materialSlug).filter(f => f !== 'application_component')

  // Body scroll lock + Escape + focus management
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector<HTMLElement>('input, button, select, textarea')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'))
        if (focusables.length === 0) return
        const first = focusables[0], last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previous?.focus?.()
    }
  }, [onClose])

  const submit = async () => {
    setErr('')
    if (!name.trim() || !email.trim()) { setErr('Please add your name and email so we can come back to you.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/custom-match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          quantity,
          selections: selections.map(s => ({ finishOptionId: s.finishOptionId })),
          materialTypeId: materialTypeId || undefined,
          supplierBrand: supplierBrand || undefined,
          sampleBatchReference: sampleBatchReference || undefined,
          requestedColour: requestedColour || undefined,
          glossLevel: gloss,
          grainPatternMatch: reqs.grain,
          stainToneMatch: reqs.stain,
          exactBatchMatch: reqs.batch,
          sheenGlossMatch: reqs.sheen,
          physicalSampleAvailable: reqs.sample,
          dimensions: dims,
          additionalNotes: notes || undefined,
          requesterName: name,
          requesterStudio: studio || undefined,
          requesterEmail: email,
          requesterTelephone: telephone || undefined,
          sourcePage: typeof window !== 'undefined' ? window.location.pathname : undefined,
          hp,
        }),
      }).then(r => r.json())
      if (!res.success) { setErr(res.error ?? 'Submission failed. Please try again.'); setBusy(false); return }

      // Upload attachments (best effort, reported honestly)
      let uploaded = 0, failed = 0
      for (const file of files.slice(0, 5)) {
        const fd = new FormData(); fd.append('file', file)
        const up = await fetch(`/api/custom-match/${res.data.id}/attachments`, { method: 'POST', body: fd })
          .then(r => r.json()).catch(() => ({ success: false }))
        if (up.success) uploaded++; else failed++
      }
      if (files.length > 0) setUploadNote(failed === 0 ? `${uploaded} file${uploaded === 1 ? '' : 's'} attached.` : `${uploaded} attached, ${failed} failed — you can email them to us instead.`)
      setReference(res.data.referenceNumber)
    } catch { setErr('Submission failed. Please try again.') }
    setBusy(false)
  }

  const check = (k: keyof typeof reqs, label: string) => (
    <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5, marginBottom: 10, minHeight: 24, cursor: 'pointer' }}>
      <input type="checkbox" checked={reqs[k]} onChange={e => setReqs(v => ({ ...v, [k]: e.target.checked }))} style={{ width: 18, height: 18 }} />
      {label}
    </label>
  )

  return (
    <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, background: 'rgba(24,32,26,0.5)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(0px, 2vw, 24px)',
    }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="cm-title" style={{
        background: 'var(--cream, #F7F3EE)', width: '100%', maxWidth: 640,
        maxHeight: '100dvh', height: 'auto', display: 'flex', flexDirection: 'column',
        borderRadius: 2, overflow: 'hidden',
      }}>
        {/* Forest header */}
        <div style={{ background: 'var(--forest, #2C3A2F)', color: 'var(--cream, #F7F3EE)', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <h2 id="cm-title" style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 24 }}>Custom Match</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, opacity: 0.75 }}>Bring your own material specification</p>
          </div>
          <button onClick={onClose} aria-label="Close Custom Match" style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 6 }}>×</button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* Product summary strip */}
          <div style={{ background: 'var(--sage-light, #E8EDE6)', padding: '14px 24px', display: 'flex', gap: 14, alignItems: 'center' }}>
            {product.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt="" width={48} height={48} style={{ objectFit: 'cover', width: 48, height: 48 }} />
            )}
            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17 }}>{product.name}</div>
              <div style={{ fontSize: 12, color: 'var(--stone)' }}>
                {[product.makerName, product.sku, quantity > 1 ? `qty ${quantity}` : null].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>

          {reference ? (
            <div style={{ padding: 32 }}>
              <h3 style={{ marginTop: 0, fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 22 }}>Request received</h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--stone)' }}>
                Your Custom Match reference is <strong style={{ color: 'var(--forest)' }}>{reference}</strong>.
                {uploadNote ? ` ${uploadNote}` : ''} We will confirm feasibility with the maker within 5 working days
                and reply to {email}.
              </p>
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          ) : (
            <div style={{ padding: 24 }}>
              {selections.length > 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--stone)', margin: '0 0 16px', lineHeight: 1.6 }}>
                  You&apos;ve already specified: {selections.map(s => `${s.groupLabel}: ${s.finishLabel}`).join('; ')}. FBA&apos;s
                  Custom Match service coordinates with the maker to achieve a precise match — grain direction,
                  stain depth and gloss finish — to your existing specification.
                </p>
              )}
              {err && <p role="alert" style={{ color: '#a33', fontSize: 13 }}>{err}</p>}

              {/* Honeypot */}
              <input type="text" value={hp} onChange={e => setHp(e.target.value)} tabIndex={-1} autoComplete="off"
                aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} name="website" />

              <span style={lbl}>Material type</span>
              <div role="radiogroup" aria-label="Material type" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
                {materialTypes.map(t => (
                  <label key={t.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, cursor: 'pointer', minHeight: 24 }}>
                    <input type="radio" name="cm-material" checked={materialTypeId === t.id} onChange={() => setMaterialTypeId(t.id)} />
                    {t.name}
                  </label>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
                <div>
                  <label style={lbl} htmlFor="cm-supplier">Supplier / brand reference</label>
                  <input id="cm-supplier" style={inp} value={supplierBrand} onChange={e => setSupplierBrand(e.target.value)} placeholder="e.g. Antolini, Armani Casa" />
                </div>
                <div>
                  <label style={lbl} htmlFor="cm-batch">Sample / batch reference</label>
                  <input id="cm-batch" style={inp} value={sampleBatchReference} onChange={e => setSampleBatchReference(e.target.value)} placeholder="e.g. CAL-2024-07A" />
                </div>
                <div>
                  <label style={lbl} htmlFor="cm-colour">Requested colour</label>
                  <input id="cm-colour" style={inp} value={requestedColour} onChange={e => setRequestedColour(e.target.value)} placeholder="e.g. warm ivory" />
                </div>
              </div>

              <span style={lbl}>Gloss level required</span>
              <div role="radiogroup" aria-label="Gloss level" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
                {GLOSS_LEVELS.map(g => (
                  <button key={g} type="button" onClick={() => setGloss(g)} aria-pressed={gloss === g} style={{
                    padding: '10px 16px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
                    cursor: 'pointer', minHeight: 44,
                    background: gloss === g ? 'var(--forest, #2C3A2F)' : 'transparent',
                    color: gloss === g ? 'var(--cream, #F7F3EE)' : 'var(--forest, #2C3A2F)',
                    border: '1px solid ' + (gloss === g ? 'var(--forest, #2C3A2F)' : 'var(--light-line)'),
                  }}>
                    {GLOSS_LABELS[g]}
                  </button>
                ))}
              </div>

              <span style={lbl}>Match requirements</span>
              <div style={{ marginBottom: 18 }}>
                {check('grain', 'Grain / pattern direction match required')}
                {check('stain', 'Stain depth / tone match required')}
                {check('batch', 'Exact batch match required')}
                {check('sheen', 'Sheen / gloss match required')}
                {check('sample', 'I can provide a physical sample')}
              </div>

              {/* Material-conditional dimension fields */}
              {dimFields.length > 0 && (
                <>
                  <span style={lbl}>Dimensions &amp; application</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
                    <div>
                      <label style={lbl} htmlFor="cm-application">{DIMENSION_FIELD_LABELS.application_component}</label>
                      <input id="cm-application" style={inp} value={dims.application_component ?? ''}
                        onChange={e => setDims(v => ({ ...v, application_component: e.target.value }))} placeholder="e.g. tabletop, seat upholstery" />
                    </div>
                    {dimFields.map(f => (
                      <div key={f}>
                        <label style={lbl} htmlFor={`cm-${f}`}>{DIMENSION_FIELD_LABELS[f] ?? f}</label>
                        <input id={`cm-${f}`} style={inp} value={dims[f] ?? ''} onChange={e => setDims(v => ({ ...v, [f]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              <label style={lbl} htmlFor="cm-notes">Additional notes</label>
              <textarea id="cm-notes" style={{ ...inp, minHeight: 84, marginBottom: 18 }} value={notes}
                onChange={e => setNotes(e.target.value)} placeholder="Any other matching requirements or context…" />

              <label style={lbl} htmlFor="cm-files">Attachments (PDF, JPG, PNG or WEBP — up to 5 files, 15 MB each)</label>
              <input id="cm-files" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp"
                style={{ fontSize: 12.5, marginBottom: 18 }}
                onChange={e => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
                <div>
                  <label style={lbl} htmlFor="cm-name">Your name</label>
                  <input id="cm-name" style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Name" autoComplete="name" />
                </div>
                <div>
                  <label style={lbl} htmlFor="cm-studio">Studio</label>
                  <input id="cm-studio" style={inp} value={studio} onChange={e => setStudio(e.target.value)} placeholder="Your studio" autoComplete="organization" />
                </div>
                <div>
                  <label style={lbl} htmlFor="cm-email">Email</label>
                  <input id="cm-email" type="email" style={inp} value={email} onChange={e => setEmail(e.target.value)} placeholder="hello@yourstudio.com" autoComplete="email" />
                </div>
                <div>
                  <label style={lbl} htmlFor="cm-phone">Telephone (optional)</label>
                  <input id="cm-phone" type="tel" style={inp} value={telephone} onChange={e => setTelephone(e.target.value)} autoComplete="tel" />
                </div>
              </div>

              <button className="btn btn-primary btn-full" disabled={busy} onClick={submit} style={{ minHeight: 48 }}>
                {busy ? 'Submitting…' : 'Submit Custom Match Request'}
              </button>
              <p style={{ fontSize: 11.5, color: 'var(--stone)', textAlign: 'center', margin: '10px 0 0' }}>
                We&apos;ll confirm feasibility with the maker within 5 working days. studio@fullbloomartelier.com
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
