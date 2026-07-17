'use client'

// Curated finish selection (Sprint 12) — the premium configurator for
// products with finish groups (Sprint 10 model, Sprint 11 admin).
// Multi-group selection is keyed by group ID: choosing in one group can
// never erase another (md doc §5.2). Compatibility rules disable
// options with an explanation; completeness is shown live; Save to
// Project creates a REAL project item with a configuration snapshot.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  applySelection, clearSelection, configurationCompleteness,
  optionBlockedBy, configurationAdjustments,
  type ProductConfiguration, type FinishGroupDef, type CompatibilityRule,
} from '@/lib/customMatch/logic'
import CustomMatchModal, { type CustomMatchProductSummary } from './CustomMatchModal'

export interface PublicOption {
  id: string
  isAvailable: boolean
  isDefault: boolean
  priceAdjustment: number | null
  leadTimeAdjustmentWeeks: number
  sampleAvailable: boolean
  finish: {
    id: string; name: string; code: string | null; hexColour: string | null
    textureUrl: string | null; origin: string | null; description: string | null
    technicalNotes: string | null
  }
}
export interface PublicGroup {
  id: string; label: string; key: string; required: boolean; helpText: string | null
  options: PublicOption[]
}
export interface PublicMedia {
  id: string; url: string; finishOptionId: string | null; role: string
  altText: string | null; isPrimary: boolean
}

// Gallery bridge: the configurator announces the selected option; the
// gallery (separate client component in the left column) listens.
export const FINISH_MEDIA_EVENT = 'fba:finish-selected'

export default function CuratedFinishes({ productId, groups, rules, media, isLoggedIn, currencySymbol, productSummary, materialTypes, defaultEmail }: {
  productId: string
  groups: PublicGroup[]
  rules: CompatibilityRule[]
  media: PublicMedia[]
  isLoggedIn: boolean
  currencySymbol: string
  productSummary: CustomMatchProductSummary
  materialTypes: Array<{ id: string; name: string; slug: string }>
  defaultEmail?: string | null
}) {
  const router = useRouter()
  const groupDefs: FinishGroupDef[] = useMemo(
    () => groups.map(g => ({ id: g.id, key: g.key, label: g.label, required: g.required, isActive: true })),
    [groups])

  const [activeGroup, setActiveGroup] = useState(groups[0]?.id ?? '')
  const [config, setConfig] = useState<ProductConfiguration>(() => {
    // Seed defaults per group
    let c: ProductConfiguration = { productId, quantity: 1, selections: {} }
    for (const g of groups) {
      const def = g.options.find(o => o.isDefault && o.isAvailable)
      if (def) c = applySelection(c, toSelection(g, def))
    }
    return c
  })
  const [qty, setQty] = useState(1)
  const [saveOpen, setSaveOpen] = useState(false)
  const [customMatchOpen, setCustomMatchOpen] = useState(false)

  const completeness = configurationCompleteness(groupDefs, config)
  const adjustments = configurationAdjustments(config)

  // Announce finish-linked media for the gallery
  useEffect(() => {
    const selectedIds = Object.values(config.selections).map(s => s.finishOptionId)
    const match = media.find(m => m.finishOptionId && selectedIds.includes(m.finishOptionId))
    window.dispatchEvent(new CustomEvent(FINISH_MEDIA_EVENT, { detail: { mediaId: match?.id ?? null } }))
  }, [config, media])

  const group = groups.find(g => g.id === activeGroup) ?? groups[0]
  const selectedInGroup = group ? config.selections[group.id]?.finishOptionId : undefined
  const selectedDetail = group?.options.find(o => o.id === selectedInGroup)

  const summaryText = Object.values(config.selections)
    .map(s => `${s.groupLabel}: ${s.finishLabel}`).join('; ')

  const quoteParams = new URLSearchParams({ product: productId })
  if (qty > 1) quoteParams.set('qty', String(qty))
  if (summaryText) quoteParams.set('finish', summaryText.slice(0, 190))

  if (groups.length === 0) return null

  const sectionLabel: React.CSSProperties = {
    fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
    color: 'var(--forest)', fontWeight: 600, marginBottom: 10, display: 'block',
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <span style={sectionLabel}>Curated Finishes</span>

      {/* Group tabs */}
      <div role="tablist" aria-label="Finish groups" style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--light-line)', marginBottom: 14, flexWrap: 'wrap' }}>
        {groups.map(g => {
          const done = !!config.selections[g.id]
          const active = g.id === group?.id
          return (
            <button key={g.id} role="tab" aria-selected={active} id={`fg-tab-${g.id}`} aria-controls={`fg-panel-${g.id}`}
              onClick={() => setActiveGroup(g.id)}
              style={{
                padding: '8px 14px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
                background: 'none', border: 'none', cursor: 'pointer',
                color: active ? 'var(--forest)' : 'var(--stone)',
                borderBottom: active ? '2px solid var(--forest)' : '2px solid transparent',
                fontWeight: active ? 600 : 400,
              }}>
              {g.label}{g.required && !done ? ' *' : done ? ' ✓' : ''}
            </button>
          )
        })}
      </div>

      {/* Swatches for the active group */}
      {group && (
        <div role="tabpanel" id={`fg-panel-${group.id}`} aria-labelledby={`fg-tab-${group.id}`}>
          {group.helpText && <p style={{ fontSize: 12, color: 'var(--stone)', margin: '0 0 10px' }}>{group.helpText}</p>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            {group.options.map(o => {
              const blocked = optionBlockedBy(o.id, config, rules)
              const disabled = !o.isAvailable || blocked.blocked
              const selected = selectedInGroup === o.id
              const label = o.finish.code ? `${o.finish.name} (${o.finish.code})` : o.finish.name
              const title = blocked.blocked ? `${label} — ${blocked.explanation}` : !o.isAvailable ? `${label} — currently unavailable` : label
              return (
                <button key={o.id} type="button" disabled={disabled} aria-pressed={selected} aria-label={title} title={title}
                  onClick={() => setConfig(c => selected ? clearSelection(c, group.id) : applySelection(c, toSelection(group, o)))}
                  style={{
                    width: 40, height: 40, borderRadius: '50%', padding: 0, flexShrink: 0,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    background: o.finish.hexColour ?? 'var(--warm-white)',
                    border: '1px solid rgba(0,0,0,0.18)',
                    outline: selected ? '2px solid var(--forest)' : 'none', outlineOffset: 2,
                    opacity: disabled ? 0.3 : 1, overflow: 'hidden',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  {o.finish.textureUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.finish.textureUrl} alt="" width={40} height={40} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Selected finish details */}
          {selectedDetail ? (
            <div style={{ fontSize: 12.5, color: 'var(--stone)', marginBottom: 6 }}>
              <strong style={{ color: 'var(--forest)' }}>{selectedDetail.finish.name}</strong>
              {selectedDetail.finish.code ? ` · ${selectedDetail.finish.code}` : ''}
              {selectedDetail.finish.origin ? ` · ${selectedDetail.finish.origin}` : ''}
              {selectedDetail.sampleAvailable ? ' · sample available' : ''}
              {selectedDetail.priceAdjustment != null && selectedDetail.priceAdjustment !== 0
                ? ` · ${selectedDetail.priceAdjustment > 0 ? '+' : '−'}${currencySymbol}${Math.abs(selectedDetail.priceAdjustment).toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : ''}
              {selectedDetail.leadTimeAdjustmentWeeks ? ` · +${selectedDetail.leadTimeAdjustmentWeeks} wks` : ''}
              {selectedDetail.finish.description ? <><br />{selectedDetail.finish.description}</> : null}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--stone)', fontStyle: 'italic', marginBottom: 6 }}>Select a finish to see details</p>
          )}
        </div>
      )}

      {/* Completeness + configuration effect */}
      <div aria-live="polite" style={{
        fontSize: 12, marginTop: 10, padding: '8px 12px',
        background: completeness.complete ? 'var(--sage-light, #E8EDE6)' : 'var(--warm-white)',
        color: 'var(--forest)', border: '1px solid var(--light-line)',
      }}>
        {completeness.summary}
        {adjustments.priceAdjustmentTotal !== 0 && ` · finish adjustments ${adjustments.priceAdjustmentTotal > 0 ? '+' : '−'}${currencySymbol}${Math.abs(adjustments.priceAdjustmentTotal).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`}
        {adjustments.leadTimeAdjustmentWeeksMax > 0 && ` · up to +${adjustments.leadTimeAdjustmentWeeksMax} weeks lead time`}
      </div>

      {/* Quantity */}
      <div style={{ marginTop: 18 }}>
        <span style={sectionLabel}>Quantity</span>
        <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--light-line)' }}>
          <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Decrease quantity"
            style={{ width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>−</button>
          <input type="number" min={1} max={999} value={qty} aria-label="Quantity"
            onChange={e => setQty(Math.min(999, Math.max(1, parseInt(e.target.value) || 1)))}
            style={{ width: 56, height: 44, textAlign: 'center', border: 'none', borderLeft: '1px solid var(--light-line)', borderRight: '1px solid var(--light-line)', fontSize: 14, background: 'transparent' }} />
          <button type="button" onClick={() => setQty(q => Math.min(999, q + 1))} aria-label="Increase quantity"
            style={{ width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>+</button>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        <button className="btn btn-primary btn-full" onClick={() => router.push(`/quote?${quoteParams.toString()}`)}>
          Request Quote
        </button>
        {isLoggedIn ? (
          <button className="btn btn-secondary btn-full" onClick={() => setSaveOpen(true)}>
            Save to Project ♡
          </button>
        ) : (
          <a href={`/login?next=/quote?${encodeURIComponent(quoteParams.toString())}`} className="btn btn-secondary btn-full">
            Sign in to Save to Project
          </a>
        )}
        {/* CUSTOM MATCH — full-width outlined action (reference §2.4) */}
        <button className="btn btn-secondary btn-full" onClick={() => setCustomMatchOpen(true)} style={{ minHeight: 48 }}>
          <span style={{ display: 'block' }}>Custom Match</span>
          <span style={{ display: 'block', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'none', opacity: 0.75 }}>
            Bring your own marble, timber or fabric — we&apos;ll match it
          </span>
        </button>
      </div>

      {customMatchOpen && (
        <CustomMatchModal
          product={productSummary}
          materialTypes={materialTypes}
          selections={Object.values(config.selections).map(s => ({
            finishOptionId: s.finishOptionId, groupLabel: s.groupLabel, finishLabel: s.finishLabel,
          }))}
          quantity={qty}
          defaultEmail={defaultEmail}
          onClose={() => setCustomMatchOpen(false)}
        />
      )}

      {saveOpen && (
        <SaveToProjectModal
          productId={productId}
          quantity={qty}
          selections={Object.values(config.selections).map(s => ({ finishOptionId: s.finishOptionId }))}
          summaryText={summaryText}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </div>
  )
}

function toSelection(g: PublicGroup, o: PublicOption) {
  return {
    finishGroupId: g.id,
    finishOptionId: o.id,
    finishId: o.finish.id,
    groupLabel: g.label,
    finishLabel: o.finish.name,
    priceAdjustment: o.priceAdjustment ?? 0,
    leadTimeAdjustmentWeeks: o.leadTimeAdjustmentWeeks,
  }
}

function SaveToProjectModal({ productId, quantity, selections, summaryText, onClose }: {
  productId: string
  quantity: number
  selections: Array<{ finishOptionId: string }>
  summaryText: string
  onClose: () => void
}) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [projectId, setProjectId] = useState('')
  const [newName, setNewName] = useState('')
  const [roomArea, setRoomArea] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(j => {
      const list = (j.data ?? []) as Array<{ id: string; name: string }>
      setProjects(list)
      if (list[0]) setProjectId(list[0].id)
    }).catch(() => {})
  }, [])

  const save = async () => {
    setErr(''); setBusy(true)
    try {
      let targetId = projectId
      if (!targetId) {
        if (!newName.trim()) { setErr('Choose a project or name a new one.'); setBusy(false); return }
        const created = await fetch('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim() }),
        }).then(r => r.json())
        if (!created.success) { setErr(created.error ?? 'Could not create the project.'); setBusy(false); return }
        targetId = created.data.id
      }
      const res = await fetch(`/api/projects/${targetId}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity, selections, roomArea: roomArea || undefined }),
      }).then(r => r.json())
      if (!res.success) { setErr(res.error ?? 'Could not save the piece.'); setBusy(false); return }
      setDone(true)
    } catch { setErr('Request failed.') }
    setBusy(false)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Save to project" style={{
      position: 'fixed', inset: 0, background: 'rgba(24,32,26,0.45)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{ background: 'var(--cream, #F7F3EE)', maxWidth: 440, width: '100%', padding: 24, borderRadius: 4 }}>
        {done ? (
          <>
            <h2 style={{ marginTop: 0, fontSize: 19 }}>Saved to your project</h2>
            <p style={{ fontSize: 13, color: 'var(--stone)' }}>
              {summaryText ? <>Configuration saved: {summaryText}.<br /></> : null}
              You can review, edit or request a quote from your project board.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>Keep browsing</button>
              <a href="/account/projects" className="btn btn-primary btn-sm">View projects</a>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 0, fontSize: 19 }}>Save to Project</h2>
            {summaryText && <p style={{ fontSize: 12.5, color: 'var(--stone)' }}>{summaryText} · qty {quantity}</p>}
            {err && <p style={{ color: '#a33', fontSize: 13 }}>{err}</p>}
            {projects.length > 0 && (
              <label style={{ display: 'block', fontSize: 12.5, marginBottom: 10 }}>Project
                <select className="form-input" value={projectId} onChange={e => setProjectId(e.target.value)}>
                  {projects.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                  <option value="">＋ New project…</option>
                </select>
              </label>
            )}
            {(!projectId || projects.length === 0) && (
              <label style={{ display: 'block', fontSize: 12.5, marginBottom: 10 }}>New project name
                <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Chelsea Townhouse" />
              </label>
            )}
            <label style={{ display: 'block', fontSize: 12.5, marginBottom: 16 }}>Room / area (optional)
              <input className="form-input" value={roomArea} onChange={e => setRoomArea(e.target.value)} placeholder="e.g. Master suite" />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onClose}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save piece'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
