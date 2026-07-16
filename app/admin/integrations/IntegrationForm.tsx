'use client'

import { useState } from 'react'
import { appConfirm } from '@/lib/appConfirm'
import { useRouter } from 'next/navigation'
import type { BrandIntegration, SourceType } from '@/lib/syncEngineTypes'
import { DEFAULT_MAPPINGS } from '@/lib/syncEngineTypes'

interface Props {
  integration?: BrandIntegration
}

const SOURCE_OPTIONS: { value: SourceType; label: string; hint: string }[] = [
  { value: 'shopify',     label: 'Shopify',            hint: 'Store URL + Private App access token' },
  { value: 'woocommerce', label: 'WooCommerce',        hint: 'Site URL + Consumer key & secret' },
  { value: 'rest_api',    label: 'Custom REST API',    hint: 'Any JSON endpoint returning a products array' },
  { value: 'csv_url',     label: 'CSV Feed URL',       hint: 'Public or authenticated URL to a CSV product export' },
  { value: 'manual_csv',  label: 'Manual CSV Upload',  hint: 'Upload a CSV file from your computer on demand' },
]

const FREQ_OPTIONS = [
  { value: 'manual', label: 'Manual only' },
  { value: 'daily',  label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
]

const FBA_FIELDS = [
  { key: 'name',             label: 'Product name',       required: true  },
  { key: 'description',      label: 'Description',        required: false },
  { key: 'short_description',label: 'Short description',  required: false },
  { key: 'retail_price',     label: 'Retail price',       required: false },
  { key: 'trade_price',      label: 'Trade price',        required: false },
  { key: 'sku',              label: 'SKU',                required: false },
  { key: 'images',           label: 'Images',             required: false },
  { key: 'lead_time',        label: 'Lead time',          required: false },
  { key: 'shipping_origin',  label: 'Shipping origin',    required: false },
]

export function IntegrationForm({ integration }: Props) {
  const router = useRouter()
  const isNew = !integration

  const [brandName,      setBrandName]      = useState(integration?.brand_name      ?? '')
  const [sourceType,     setSourceType]     = useState<SourceType>(integration?.source_type ?? 'rest_api')
  const [apiEndpoint,    setApiEndpoint]    = useState(integration?.api_endpoint    ?? '')
  const [apiKey,         setApiKey]         = useState(integration?.api_key         ?? '')
  const [apiSecret,      setApiSecret]      = useState(integration?.api_secret      ?? '')
  const [fieldMappings,  setFieldMappings]  = useState<Record<string, string>>(
    integration?.field_mappings ?? DEFAULT_MAPPINGS['rest_api']
  )
  const [syncEnabled,    setSyncEnabled]    = useState(integration?.sync_enabled    ?? false)
  const [syncFrequency,  setSyncFrequency]  = useState(integration?.sync_frequency  ?? 'manual')
  const [notes,          setNotes]          = useState(integration?.notes           ?? '')

  const [saving,   setSaving]   = useState(false)
  const [syncing,  setSyncing]  = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [syncResult, setSyncResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const [syncError,  setSyncError]  = useState('')
  const [csvFile,    setCsvFile]    = useState<File | null>(null)
  const [csvUploading, setCsvUploading] = useState(false)

  function handleSourceChange(st: SourceType) {
    setSourceType(st)
    setFieldMappings(DEFAULT_MAPPINGS[st])
  }

  function updateMapping(fbaField: string, sourcePath: string) {
    setFieldMappings(prev => ({ ...prev, [fbaField]: sourcePath }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      brand_name:     brandName,
      source_type:    sourceType,
      api_endpoint:   apiEndpoint || null,
      api_key:        apiKey      || null,
      api_secret:     apiSecret   || null,
      field_mappings: fieldMappings,
      sync_enabled:   syncEnabled,
      sync_frequency: syncFrequency,
      notes:          notes       || null,
    }
    const url    = isNew ? '/api/admin/integrations' : `/api/admin/integrations/${integration!.id}`
    const method = isNew ? 'POST' : 'PATCH'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (res.ok) {
      const data = await res.json() as { id: string }
      router.push(`/admin/integrations/${isNew ? data.id : integration!.id}`)
      router.refresh()
    } else {
      const err = await res.json() as { error: string }
      alert(err.error ?? 'Save failed')
    }
    setSaving(false)
  }

  async function handleSync() {
    if (!integration) return
    setSyncing(true); setSyncResult(null); setSyncError('')
    const res = await fetch(`/api/admin/integrations/${integration.id}/sync`, { method: 'POST' })
    const data = await res.json() as { imported?: number; skipped?: number; errors?: string[]; error?: string }
    if (res.ok && data.imported !== undefined) {
      setSyncResult({ imported: data.imported, skipped: data.skipped ?? 0, errors: data.errors ?? [] })
    } else {
      setSyncError(data.error ?? 'Sync failed')
    }
    setSyncing(false)
  }

  async function handleCsvUpload() {
    if (!csvFile || !integration) return
    setCsvUploading(true); setSyncResult(null); setSyncError('')
    const fd = new FormData(); fd.append('file', csvFile)
    const res = await fetch(`/api/admin/integrations/${integration.id}/csv`, { method: 'POST', body: fd })
    const data = await res.json() as { imported?: number; skipped?: number; errors?: string[]; error?: string }
    if (res.ok && data.imported !== undefined) {
      setSyncResult({ imported: data.imported, skipped: data.skipped ?? 0, errors: data.errors ?? [] })
    } else {
      setSyncError(data.error ?? 'Upload failed')
    }
    setCsvUploading(false)
  }

  async function handleDelete() {
    if (!integration) return
    if (!await appConfirm(`Delete the "${integration.brand_name}" integration? This cannot be undone.`)) return
    setDeleting(true)
    await fetch(`/api/admin/integrations/${integration.id}`, { method: 'DELETE' })
    router.push('/admin/integrations')
    router.refresh()
  }

  const sourceOpt = SOURCE_OPTIONS.find(o => o.value === sourceType)

  return (
    <form onSubmit={handleSave}>
      {/* ── Core config ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32, marginBottom: 32 }}>

        <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 32 }}>
          <h2 className="h3" style={{ marginBottom: 24 }}>Integration details</h2>

          <div className="form-group">
            <label className="form-label">Brand name *</label>
            <input className="form-input" value={brandName} onChange={e => setBrandName(e.target.value)} required placeholder="e.g. Cassina, Flos, De La Espada" />
          </div>

          <div className="form-group">
            <label className="form-label">Source type *</label>
            <select className="form-input" value={sourceType} onChange={e => handleSourceChange(e.target.value as SourceType)}>
              {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {sourceOpt && (
              <div style={{ fontSize: 12, color: 'var(--stone)', marginTop: 6 }}>{sourceOpt.hint}</div>
            )}
          </div>

          {sourceType !== 'manual_csv' && (
            <div className="form-group">
              <label className="form-label">
                {sourceType === 'shopify'     ? 'Shopify store URL' :
                 sourceType === 'woocommerce' ? 'WooCommerce site URL' :
                 sourceType === 'csv_url'     ? 'CSV file URL' : 'API endpoint URL'}
              </label>
              <input className="form-input" value={apiEndpoint} onChange={e => setApiEndpoint(e.target.value)}
                placeholder={
                  sourceType === 'shopify'     ? 'https://your-store.myshopify.com' :
                  sourceType === 'woocommerce' ? 'https://yoursite.com' :
                  sourceType === 'csv_url'     ? 'https://brand.com/products.csv' :
                  'https://api.brand.com/products'
                }
              />
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                {sourceType === 'shopify'     ? 'Access token' :
                 sourceType === 'woocommerce' ? 'Consumer key' : 'API key / token'}
              </label>
              <input className="form-input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder={sourceType === 'shopify' ? 'shpat_...' : sourceType === 'woocommerce' ? 'ck_...' : 'Bearer token or API key'} />
            </div>
            {sourceType === 'woocommerce' && (
              <div className="form-group">
                <label className="form-label">Consumer secret</label>
                <input className="form-input" type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="cs_..." />
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Notes (internal)</label>
            <textarea className="form-input" rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Brand contact, any quirks about their API, agreed curation scope..." />
          </div>
        </div>

        {/* ── Sync settings ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 28 }}>
            <h3 className="h4" style={{ marginBottom: 20 }}>Sync settings</h3>

            <div className="form-group">
              <label className="form-label">Sync frequency</label>
              <select className="form-input" value={syncFrequency} onChange={e => setSyncFrequency(e.target.value)}>
                {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
              <input type="checkbox" id="syncEnabled" checked={syncEnabled} onChange={e => setSyncEnabled(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--forest)' }} />
              <label htmlFor="syncEnabled" style={{ fontSize: 14, cursor: 'pointer' }}>Enable automatic syncing</label>
            </div>

            {!isNew && integration && (
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--light-line)' }}>
                <div style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 12 }}>
                  {integration.products_imported} products imported total
                  {integration.last_synced_at && (
                    <><br />Last synced {new Date(integration.last_synced_at).toLocaleString('en-GB')}</>
                  )}
                  {integration.last_sync_status && (
                    <><br />Status: <strong>{integration.last_sync_status}</strong></>
                  )}
                  {integration.last_sync_message && (
                    <><br />{integration.last_sync_message}</>
                  )}
                </div>
              </div>
            )}
          </div>

          {!isNew && (
            <div style={{ background: 'var(--forest)', padding: 28, color: 'var(--cream)' }}>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 300, marginBottom: 16 }}>
                {sourceType === 'manual_csv' ? 'Upload CSV' : 'Run sync'}
              </h3>

              {sourceType === 'manual_csv' ? (
                <>
                  <p style={{ fontSize: 13, color: 'rgba(247,243,238,0.65)', marginBottom: 16, lineHeight: 1.6 }}>
                    Upload a CSV with columns matching your field mappings below. All rows land as drafts.
                  </p>
                  <input type="file" accept=".csv,text/csv"
                    onChange={e => setCsvFile(e.target.files?.[0] ?? null)}
                    style={{ fontSize: 13, color: 'var(--cream)', marginBottom: 12, display: 'block' }} />
                  <button type="button" onClick={handleCsvUpload} disabled={!csvFile || csvUploading}
                    className="btn btn-sm" style={{ background: 'var(--sand)', color: 'var(--forest)', border: 'none', width: '100%' }}>
                    {csvUploading ? 'Uploading…' : 'Upload & import'}
                  </button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: 'rgba(247,243,238,0.65)', marginBottom: 16, lineHeight: 1.6 }}>
                    Fetches all products from the source now. New products are created as drafts.
                  </p>
                  <button type="button" onClick={handleSync} disabled={syncing}
                    className="btn btn-sm" style={{ background: 'var(--sand)', color: 'var(--forest)', border: 'none', width: '100%' }}>
                    {syncing ? 'Syncing…' : 'Sync now →'}
                  </button>
                </>
              )}

              {syncResult && (
                <div style={{ marginTop: 16, fontSize: 13 }}>
                  <div style={{ color: '#90ee90' }}>✓ {syncResult.imported} imported</div>
                  {syncResult.skipped > 0 && <div style={{ color: 'rgba(247,243,238,0.5)' }}>{syncResult.skipped} skipped</div>}
                  {syncResult.errors.length > 0 && (
                    <div style={{ marginTop: 8, color: '#ffaaaa' }}>
                      {syncResult.errors.slice(0, 3).map((e, i) => <div key={i}>{e}</div>)}
                    </div>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <a href="/admin/products?visibility=draft" style={{ fontSize: 12, color: 'var(--sand)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Review drafts →
                    </a>
                  </div>
                </div>
              )}
              {syncError && <div style={{ marginTop: 12, fontSize: 13, color: '#ffaaaa' }}>{syncError}</div>}
            </div>
          )}
        </div>
      </div>

      {/* ── Field mappings ── */}
      <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 32, marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h2 className="h3" style={{ marginBottom: 4 }}>Field mappings</h2>
            <p style={{ fontSize: 13, color: 'var(--stone)' }}>
              Map each FBA field to the path in the source data. Use dot notation for nested fields (e.g. <code>variants.0.price</code> or <code>images.*.src</code>).
            </p>
          </div>
          <button type="button" onClick={() => setFieldMappings(DEFAULT_MAPPINGS[sourceType])}
            style={{ fontSize: 12, color: 'var(--caramel)', letterSpacing: '0.08em', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer' }}>
            Reset to defaults
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 32px' }}>
          {FBA_FIELDS.map(f => (
            <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, alignItems: 'center' }}>
              <label style={{ fontSize: 13, color: 'var(--forest)' }}>
                {f.label}{f.required && <span style={{ color: 'var(--terracotta)', marginLeft: 2 }}>*</span>}
              </label>
              <input className="form-input" style={{ padding: '8px 12px', fontSize: 13 }}
                value={fieldMappings[f.key] ?? ''}
                onChange={e => updateMapping(f.key, e.target.value)}
                placeholder={`source.field.path`} />
            </div>
          ))}
        </div>

        {sourceType === 'csv_url' || sourceType === 'manual_csv' ? (
          <div style={{ marginTop: 20, padding: '16px 20px', background: 'var(--sage-light)', fontSize: 13, color: 'var(--forest)', lineHeight: 1.7 }}>
            <strong>CSV tip:</strong> Column headers in your CSV must exactly match the source field paths above.
            For images, put a single URL in the column — or separate multiple URLs with <code>|</code>.
          </div>
        ) : null}
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Create integration' : 'Save changes'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => router.back()}>Cancel</button>
        </div>
        {!isNew && (
          <button type="button" onClick={handleDelete} disabled={deleting}
            style={{ fontSize: 12, color: 'var(--danger)', letterSpacing: '0.08em', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer' }}>
            {deleting ? 'Deleting…' : 'Delete integration'}
          </button>
        )}
      </div>
    </form>
  )
}
