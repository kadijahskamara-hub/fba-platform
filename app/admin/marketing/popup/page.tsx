'use client'

// ============================================================
// /admin/marketing/popup — Signup Popup editor (Sprint 25).
//
// Controls every aspect of the public lead-capture modal:
// content (image from the Media Library, headline, offer, fine
// print, labels), audiences (Retail/Trade wording), behaviour
// (on/off, schedule, trigger, suppression) — with a live preview.
// Config lives in site_settings under 'signup_popup'; captured
// leads land in Contacts with source "Signup Popup".
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import MediaPickerDialog from '@/components/admin/media/MediaPickerDialog'
import {
  SIGNUP_POPUP_KEY, DEFAULT_SIGNUP_POPUP, normalizeSignupPopupConfig, isPopupActive,
  type SignupPopupConfig,
} from '@/lib/signupPopup'
import type { MediaLibraryFile } from '@/lib/mediaShared'

export default function SignupPopupAdminPage() {
  const [config, setConfig] = useState<SignupPopupConfig>(DEFAULT_SIGNUP_POPUP)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/site-settings?key=${SIGNUP_POPUP_KEY}`)
      .then(r => r.json())
      .then(json => { if (json.success) setConfig(normalizeSignupPopupConfig(json.data?.value)) })
      .finally(() => setLoading(false))
  }, [])

  const patch = useCallback((p: Partial<SignupPopupConfig>) => {
    setConfig(c => ({ ...c, ...p }))
    setDirty(true)
  }, [])

  const patchAudience = (key: 'retail' | 'trade', label: string) => {
    setConfig(c => ({ ...c, audiences: c.audiences.map(a => a.key === key ? { ...a, label } : a) }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    const res = await fetch('/api/admin/site-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: SIGNUP_POPUP_KEY, value: config }),
    }).then(r => r.json()).catch(() => ({ success: false, error: 'Network error' }))
    setSaving(false)
    if (!res.success) { alert(res.error ?? 'Save failed'); return }
    setDirty(false)
    setNotice('Popup settings saved.')
    setTimeout(() => setNotice(null), 3500)
  }

  const live = isPopupActive(config)
  const inp: React.CSSProperties = { width: '100%', border: '1px solid var(--light-line)', borderRadius: 4, padding: '8px 10px', fontSize: 13, background: 'var(--warm-white)' }
  const label: React.CSSProperties = { fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--stone)', margin: '20px 0 8px' }

  if (loading) return <div style={{ padding: 48, color: 'var(--stone)' }}>Loading popup settings…</div>

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Signup Popup</h1>
          <p className="admin-subtitle">
            The lead-capture modal shown to new visitors — signups land in{' '}
            <Link href="/admin/contacts" style={{ color: 'var(--caramel)' }}>Contacts</Link> with source “Signup Popup”.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="status-pill" style={{ background: live ? 'var(--forest)' : 'var(--light-line)', color: live ? '#fff' : 'var(--stone)' }}>
            {live ? 'LIVE' : 'OFF'}
          </span>
          <button className="btn btn-primary btn-sm" disabled={saving || !dirty} onClick={save}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {notice && <div style={{ background: '#eef6ee', color: '#155724', padding: '8px 12px', borderRadius: 4, fontSize: 13, marginBottom: 14 }}>{notice}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 28, alignItems: 'start' }}>
        {/* ---------- Controls ---------- */}
        <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, color: 'var(--forest)' }}>
            <input type="checkbox" checked={config.enabled} onChange={e => patch({ enabled: e.target.checked })} />
            Popup enabled
          </label>

          <div style={label}>Schedule (optional)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div className="form-label">Starts</div>
              <input style={inp} type="date" value={config.startsAt?.slice(0, 10) ?? ''} onChange={e => patch({ startsAt: e.target.value || null })} />
            </div>
            <div>
              <div className="form-label">Ends</div>
              <input style={inp} type="date" value={config.endsAt?.slice(0, 10) ?? ''} onChange={e => patch({ endsAt: e.target.value || null })} />
            </div>
          </div>

          <div style={label}>Image</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setPickerOpen(true)}>
              {config.imageUrl ? 'Change image' : 'Choose from Media Library'}
            </button>
            {config.imageUrl && (
              <button className="btn btn-ghost btn-sm" style={{ color: '#a03030' }} onClick={() => patch({ imageUrl: '' })}>Remove</button>
            )}
          </div>

          <div style={label}>Content</div>
          <div className="form-label">Headline</div>
          <input style={inp} value={config.headline} onChange={e => patch({ headline: e.target.value })} />
          <div className="form-label" style={{ marginTop: 10 }}>Offer line (bold, e.g. “−£30 for you!”)</div>
          <input style={inp} value={config.offerText} onChange={e => patch({ offerText: e.target.value })} />
          <div className="form-label" style={{ marginTop: 10 }}>Sub-line</div>
          <input style={inp} value={config.subheadline} onChange={e => patch({ subheadline: e.target.value })} />
          <div className="form-label" style={{ marginTop: 10 }}>Button label</div>
          <input style={inp} value={config.buttonLabel} onChange={e => patch({ buttonLabel: e.target.value })} />
          <div className="form-label" style={{ marginTop: 10 }}>Fine print</div>
          <textarea style={{ ...inp, minHeight: 60 }} value={config.finePrint} onChange={e => patch({ finePrint: e.target.value })} />

          <div style={label}>Audience labels</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {config.audiences.map(a => (
              <div key={a.key}>
                <div className="form-label">{a.key === 'retail' ? 'Retail label' : 'Trade label'}</div>
                <input style={inp} value={a.label} onChange={e => patchAudience(a.key, e.target.value)} />
              </div>
            ))}
          </div>

          <div style={label}>After signup</div>
          <div className="form-label">Success message</div>
          <textarea style={{ ...inp, minHeight: 50 }} value={config.successMessage} onChange={e => patch({ successMessage: e.target.value })} />
          <div className="form-label" style={{ marginTop: 10 }}>Discount code to reveal (optional)</div>
          <input style={inp} value={config.discountCode} onChange={e => patch({ discountCode: e.target.value })} />

          <div style={label}>Behaviour</div>
          <div className="form-label">Trigger</div>
          <select style={inp} value={config.trigger} onChange={e => patch({ trigger: e.target.value as SignupPopupConfig['trigger'] })}>
            <option value="delay">After a delay</option>
            <option value="scroll">After scrolling</option>
            <option value="exit">On exit intent</option>
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
            <div>
              <div className="form-label">Delay (s)</div>
              <input style={inp} type="number" min={0} max={120} value={config.delaySeconds} onChange={e => patch({ delaySeconds: Number(e.target.value) })} disabled={config.trigger !== 'delay'} />
            </div>
            <div>
              <div className="form-label">Scroll %</div>
              <input style={inp} type="number" min={5} max={95} value={config.scrollPercent} onChange={e => patch({ scrollPercent: Number(e.target.value) })} disabled={config.trigger !== 'scroll'} />
            </div>
            <div>
              <div className="form-label">Snooze (days)</div>
              <input style={inp} type="number" min={0} max={365} value={config.suppressDays} onChange={e => patch({ suppressDays: Number(e.target.value) })} title="How long before a visitor who dismissed it sees it again" />
            </div>
          </div>

          <div style={label}>Consent wording</div>
          <textarea style={{ ...inp, minHeight: 60 }} value={config.consentText} onChange={e => patch({ consentText: e.target.value })} />
          <p style={{ fontSize: 11, color: 'var(--stone)', marginTop: 8 }}>
            Never shown to logged-in staff, on admin pages, or during checkout. Repeat visitors are snoozed; signed-up visitors never see it again.
          </p>
        </div>

        {/* ---------- Live preview ---------- */}
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 10 }}>Live preview</div>
          <div style={{ background: 'var(--cream)', border: '1px solid var(--light-line)', borderRadius: 8, padding: 28, display: 'flex', justifyContent: 'center' }}>
            <div style={{ display: 'flex', width: '100%', maxWidth: 720, background: 'var(--warm-white)', overflow: 'hidden', boxShadow: '0 16px 40px rgba(26,43,24,0.18)' }}>
              {config.imageUrl && (
                <div style={{ flex: '1 1 45%', minWidth: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={config.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ flex: '1 1 55%', padding: '34px 28px', textAlign: 'center', position: 'relative' }}>
                <span style={{ position: 'absolute', top: 10, right: 14, fontSize: 20, color: 'var(--stone)' }}>×</span>
                <div style={{ fontSize: 11, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'var(--caramel)', marginBottom: 14 }}>Full Bloom Artelier</div>
                <div style={{ fontSize: 24, color: 'var(--forest)', marginBottom: 4 }}>{config.headline || '—'}</div>
                {config.offerText && <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--forest)', marginBottom: 8 }}>{config.offerText}</div>}
                {config.subheadline && <p style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 14 }}>{config.subheadline}</p>}
                <div style={{ fontSize: 12, color: 'var(--forest)', marginBottom: 8 }}>You are:</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 14, fontSize: 13, color: 'var(--forest)' }}>
                  {config.audiences.map(a => (
                    <span key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid var(--stone)', display: 'inline-block' }} />
                      {a.label || a.key}
                    </span>
                  ))}
                </div>
                <div style={{ border: '1px solid var(--light-line)', borderRadius: 999, padding: '10px 18px', fontSize: 13, color: 'var(--stone)', maxWidth: 280, margin: '0 auto 12px', background: '#fff' }}>
                  Enter your email address.
                </div>
                <div style={{ display: 'inline-block', background: 'var(--forest)', color: '#fff', borderRadius: 999, padding: '11px 34px', fontSize: 13 }}>
                  {config.buttonLabel || '—'}
                </div>
                {config.finePrint && <p style={{ fontSize: 10, color: 'var(--stone)', marginTop: 14, lineHeight: 1.5 }}>{config.finePrint}</p>}
              </div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--stone)', marginTop: 10 }}>
            Trigger: {config.trigger === 'delay' ? `${config.delaySeconds}s after arrival` : config.trigger === 'scroll' ? `after scrolling ${config.scrollPercent}%` : 'when the cursor leaves the page'} · snooze {config.suppressDays} days
            {config.startsAt || config.endsAt ? ` · scheduled ${config.startsAt?.slice(0, 10) ?? '…'} → ${config.endsAt?.slice(0, 10) ?? '…'}` : ''}
          </p>
        </div>
      </div>

      {pickerOpen && (
        <MediaPickerDialog
          startBucket="site-assets"
          onClose={() => setPickerOpen(false)}
          onSelect={files => { if (files[0]) patch({ imageUrl: files[0].url }); setPickerOpen(false) }}
        />
      )}
    </>
  )
}
