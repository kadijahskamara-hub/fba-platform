'use client'

import { useEffect, useState, useCallback } from 'react'
import { renderTemplate } from '@/lib/commercial/communications'

// ============================================================
// Settings → Communication templates (Ultra Admin).
// Editing creates a new version (history kept server-side). Templates
// are plain text with {{variables}}; a live preview uses sample data.
// ============================================================

type Template = {
  id: string; template_key: string; label: string; audience: string
  subject_template: string; body_template: string; variables: string[]; version: number
}

const SAMPLE: Record<string, string> = {
  client_name: 'Ms A. Client', recipient_name: 'Workshop Ltd', company_name: 'Full Bloom Artelier',
  document_number: 'FBA-INV-2026-0007', balance_due: '£4,200.00', due_date: '2026-08-01',
  valid_until: '2026-08-15', confirmation_url: 'https://fullbloom.uk.com/accept/…',
}

export default function CommunicationTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [editing, setEditing] = useState<Template | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/communication-templates')
    const json = await res.json().catch(() => ({ templates: [] }))
    setTemplates(json.templates ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  function open(t: Template) { setEditing(t); setSubject(t.subject_template); setBody(t.body_template); setMsg(null) }

  async function save() {
    if (!editing) return
    setSaving(true); setMsg(null)
    const res = await fetch(`/api/admin/communication-templates/${editing.template_key}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject_template: subject, body_template: body, label: editing.label }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setMsg(json.error ?? 'Save failed (templates are Ultra-Admin only).'); return }
    setMsg('Saved as a new version.'); setEditing(null); await load()
  }

  const preview = editing ? renderTemplate(subject, body, SAMPLE) : null

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Georgia, serif', color: '#1B4332', fontSize: 26 }}>Communication templates</h1>
      <p style={{ color: '#6b6257', marginTop: 0, fontSize: 14 }}>
        Editable message copy for prepared communications. Editing creates a new version — brand voice, so changes are Ultra-Admin only.
      </p>

      {!editing ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden', fontSize: 13.5 }}>
          <thead><tr style={{ background: '#F4F1ED', textAlign: 'left', color: '#6b6257' }}>
            <th style={th}>Template</th><th style={th}>Audience</th><th style={th}>Subject</th><th style={th}>Ver.</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id} style={{ borderTop: '1px solid #efeae2' }}>
                <td style={td}>{t.label}</td>
                <td style={td}>{t.audience.replace('_', ' ')}</td>
                <td style={{ ...td, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject_template}</td>
                <td style={td}>v{t.version}</td>
                <td style={td}><button onClick={() => open(t)} style={linkBtn}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <h3 style={{ color: '#1B4332' }}>{editing.label} <span style={{ color: '#9E9589', fontSize: 13 }}>({editing.audience})</span></h3>
            <label style={lbl}>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} style={input} />
            <label style={lbl}>Body</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={14} style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }} />
            <p style={{ fontSize: 12, color: '#9E9589' }}>Available variables: {(editing.variables ?? []).map(v => `{{${v}}}`).join('  ')}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={saving} onClick={save} style={primaryBtn}>Save new version</button>
              <button onClick={() => setEditing(null)} style={secBtn}>Cancel</button>
            </div>
            {msg && <p style={{ fontSize: 13, color: '#1B4332', marginTop: 10 }}>{msg}</p>}
          </div>
          <div>
            <label style={lbl}>Preview (sample data)</label>
            <div style={{ background: '#fff', border: '1px solid #e5e0d7', borderRadius: 8, padding: 16 }}>
              <div style={{ fontWeight: 600, color: '#1B4332', marginBottom: 8 }}>{preview?.subject}</div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, color: '#3a352f' }}>{preview?.body}</div>
            </div>
            {preview && preview.missing.length > 0 && (
              <p style={{ fontSize: 12, color: '#B4472A' }}>Unfilled in sample: {preview.missing.join(', ')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 600, fontSize: 12 }
const td: React.CSSProperties = { padding: '10px 12px', color: '#3a352f' }
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#1B4332', cursor: 'pointer', fontWeight: 600 }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: '#8A6D3B', margin: '12px 0 4px', fontWeight: 700 }
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d8d2c8', borderRadius: 6, fontSize: 13.5, boxSizing: 'border-box' }
const primaryBtn: React.CSSProperties = { background: '#1B4332', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }
const secBtn: React.CSSProperties = { background: '#fff', color: '#1B4332', border: '1px solid #1B4332', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }
