'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Script from 'next/script'

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    XLSX: any
  }
}

type Row = Record<string, string>

interface PreviewItem {
  rowNumber: number
  action: string
  message: string
  warning?: string
  slug: string
  name: string
  matchedBy?: string
}

interface PreviewResult {
  summary: {
    productsFound: number
    create: number
    update: number
    unchanged: number
    skip: number
    conflict: number
    archive: number
  }
  items: PreviewItem[]
  toArchive: Array<{ name: string; slug: string }>
}

interface RunResult {
  success: boolean
  batchId?: string
  batchRef?: string
  status?: string
  created: number
  updated: number
  unchanged: number
  skipped: number
  conflict: number
  archived: number
  failed: number
  errors: string[]
  error?: string
}

const MODES = [
  { value: 'create_only',   label: 'Create new products only',              hint: 'Existing products are reported but never changed.' },
  { value: 'upsert',        label: 'Update existing and create new',        hint: 'Recommended for day-to-day imports.' },
  { value: 'force_refresh', label: 'Force refresh all matching products',   hint: 'Rewrites every matched product from source, even if unchanged.' },
  { value: 'replace_batch', label: 'Replace previous batch with this source', hint: 'Admin only. Also archives products missing from the new file.' },
  { value: 'purge_reload',  label: 'Purge previous import and reload',      hint: 'Admin only. Archives missing products and force-rewrites everything. Requires typed confirmation.' },
] as const

const ACTION_COLOURS: Record<string, string> = {
  create: '#16A34A', update: '#0369A1', unchanged: '#6B7280',
  skip: '#92700E', conflict: '#DC2626', archive: '#9333EA', fail: '#DC2626',
}

export default function ImportProductsPage() {
  const [xlsxReady, setXlsxReady] = useState(false)
  const [driveUrl, setDriveUrl]   = useState('')
  const [fetching, setFetching]   = useState(false)
  const [rows, setRows]           = useState<Row[]>([])
  const [fileName, setFileName]   = useState('')
  const [fileId, setFileId]       = useState('')
  const [mode, setMode]           = useState<string>('upsert')
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview]     = useState<PreviewResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult]       = useState<RunResult | null>(null)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (window.XLSX) setXlsxReady(true)
  }, [])

  function parseBase64(base64: string, label: string) {
    if (!window.XLSX) { setError('Excel parser not ready yet. Please wait a moment.'); return }
    try {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

      const wb = window.XLSX.read(bytes, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json: Row[] = window.XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!json.length) { setError('No data rows found in the file.'); return }

      const filtered = json.filter(r => {
        const slug = (r['Slug (URL)'] ?? r['Slug'] ?? '').toString()
        const name = (r['Product Name'] ?? r['Name'] ?? r['Products Product Name'] ?? '').toString()
        return slug.trim() !== '' || name.trim() !== ''
      })

      setRows(filtered)
      setFileName(label)
      setError('')
    } catch (err) {
      setError(`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleFetch = async () => {
    if (!driveUrl.trim()) { setError('Paste a Google Drive link first.'); return }
    setFetching(true)
    setError('')
    setRows([])
    setPreview(null)
    try {
      const res = await fetch('/api/admin/products/fetch-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveUrl: driveUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to fetch file.'); return }
      setFileId(data.fileId ?? '')
      parseBase64(data.base64, `Drive file: ${(data.fileId ?? '').slice(0, 12)}…`)
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setFetching(false)
    }
  }

  const handlePreview = async () => {
    if (!rows.length) return
    setPreviewing(true)
    setError('')
    try {
      const res = await fetch('/api/admin/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, mode, preview: true, sourceUrl: driveUrl.trim() || undefined, sourceFileId: fileId || undefined, sourceName: fileName }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.error ?? 'Preview failed.'); return }
      setPreview(data)
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPreviewing(false)
    }
  }

  const handleImport = async () => {
    if (!rows.length) return
    let confirm: string | undefined
    if (mode === 'purge_reload') {
      const typed = prompt('Purge previous import and reload?\n\nProducts missing from the new file will be archived and all matching products will be rewritten from source.\n\nType RELOAD PRODUCTS to confirm:')
      if (typed === null) return
      confirm = typed
    }
    setImporting(true)
    setError('')
    try {
      const res = await fetch('/api/admin/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, mode, confirm, sourceUrl: driveUrl.trim() || undefined, sourceFileId: fileId || undefined, sourceName: fileName }),
      })
      const data: RunResult = await res.json()
      if (!data.success) { setError(data.error ?? 'Import failed.'); return }
      setResult(data)
      setPreview(null)
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setRows([]); setFileName(''); setFileId(''); setResult(null)
    setPreview(null); setError(''); setDriveUrl(''); setMode('upsert')
  }

  const attentionItems = preview?.items.filter(i => ['skip', 'conflict', 'fail'].includes(i.action) || i.warning) ?? []

  const errBox = error ? (
    <div style={{ marginTop: 12, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, color: '#B91C1C', fontSize: 13 }}>
      {error}
    </div>
  ) : null

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
        onLoad={() => setXlsxReady(true)}
      />

      <div className="admin-header">
        <div>
          <h1 className="admin-title">Import Products</h1>
          <p className="admin-subtitle">
            Fetch a supplier .xlsx from Google Drive, choose an import mode, preview, then run.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/imports" className="btn btn-ghost btn-sm">Import history</Link>
          <Link href="/admin/products" className="btn btn-ghost btn-sm">← Back to Products</Link>
        </div>
      </div>

      {!rows.length && !result && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--forest)' }}>
            Step 1 — Paste a Google Drive link
          </h3>

          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input
              type="url"
              value={driveUrl}
              onChange={e => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/…/view?usp=sharing"
              style={{ flex: 1, padding: '10px 14px', border: '1px solid var(--light-line)', borderRadius: 6, fontSize: 13, background: 'var(--warm-white)', color: 'var(--forest)', outline: 'none' }}
              onKeyDown={e => { if (e.key === 'Enter') handleFetch() }}
              disabled={fetching}
            />
            <button className="btn btn-primary btn-sm" onClick={handleFetch} disabled={fetching || !xlsxReady} style={{ whiteSpace: 'nowrap' }}>
              {fetching ? 'Checking Google Drive access…' : 'Fetch & Preview'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 6, fontSize: 12, color: '#0369A1' }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>ℹ</span>
            <div>
              The file must be shared as <strong>&quot;Anyone with the link can view&quot;</strong> in Google Drive.
              Open the file in Drive → Share → Change access → Anyone with the link.
            </div>
          </div>
          {errBox}
        </div>
      )}

      {rows.length > 0 && !result && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--forest)', marginBottom: 2 }}>
                Step 2 — Choose import mode ({rows.length} rows found)
              </h3>
              <div style={{ fontSize: 12, color: 'var(--stone)' }}>{fileName}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={reset}>Use a different file</button>
          </div>

          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 16px 0' }}>
            <legend style={{ fontSize: 12, fontWeight: 600, color: 'var(--stone)', marginBottom: 8 }}>Import Mode</legend>
            {MODES.map(m => (
              <label key={m.value} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', cursor: 'pointer', background: mode === m.value ? 'var(--cream, #f7f3ec)' : 'transparent', borderRadius: 6 }}>
                <input
                  type="radio"
                  name="importMode"
                  value={m.value}
                  checked={mode === m.value}
                  onChange={() => { setMode(m.value); setPreview(null) }}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <span style={{ fontSize: 13, fontWeight: mode === m.value ? 600 : 400 }}>{m.label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--stone)' }}>{m.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {!preview && (
            <button className="btn btn-primary" onClick={handlePreview} disabled={previewing}>
              {previewing ? 'Analysing rows…' : 'Preview Import'}
            </button>
          )}

          {preview && (
            <div style={{ marginTop: 8 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--forest)', marginBottom: 12 }}>Import Preview</h4>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
                {[
                  ['Products found', preview.summary.productsFound, 'var(--forest)'],
                  ['New', preview.summary.create, ACTION_COLOURS.create],
                  ['To update', preview.summary.update, ACTION_COLOURS.update],
                  ['Unchanged', preview.summary.unchanged, ACTION_COLOURS.unchanged],
                  ['Skipped', preview.summary.skip, ACTION_COLOURS.skip],
                  ['Conflicts', preview.summary.conflict, ACTION_COLOURS.conflict],
                  ['To archive', preview.summary.archive, ACTION_COLOURS.archive],
                ].map(([label, value, colour]) => (
                  <div key={label as string} style={{ textAlign: 'center', minWidth: 80 }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: colour as string }}>{value as number}</div>
                    <div style={{ fontSize: 11, color: 'var(--stone)' }}>{label as string}</div>
                  </div>
                ))}
              </div>

              {attentionItems.length > 0 && (
                <div style={{ marginBottom: 16, maxHeight: 260, overflowY: 'auto', border: '1px solid var(--light-line)', borderRadius: 6 }}>
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr><th>Row</th><th>Product</th><th>Action</th><th>Detail</th></tr>
                    </thead>
                    <tbody>
                      {attentionItems.map(i => (
                        <tr key={i.rowNumber}>
                          <td>{i.rowNumber}</td>
                          <td>{i.name || i.slug || '—'}</td>
                          <td><span style={{ color: ACTION_COLOURS[i.action] ?? 'inherit', fontWeight: 600 }}>{i.action}</span></td>
                          <td style={{ maxWidth: 420 }}>{i.message}{i.warning ? ` ⚠ ${i.warning}` : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview.toArchive.length > 0 && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: 6, fontSize: 12, color: '#7E22CE' }}>
                  <strong>{preview.toArchive.length} product(s) will be archived</strong> because they are missing from the new source file:{' '}
                  {preview.toArchive.slice(0, 10).map(p => p.name).join(', ')}{preview.toArchive.length > 10 ? '…' : ''}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                  {importing ? 'Running import…' : 'Run Import'}
                </button>
                <button className="btn btn-ghost" onClick={() => setPreview(null)}>Change mode</button>
                <button className="btn btn-ghost" onClick={reset}>Cancel</button>
              </div>
            </div>
          )}
          {errBox}
        </div>
      )}

      {result && (
        <div className="admin-card">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--forest)', marginBottom: 4 }}>
            Import {result.status === 'completed_with_errors' ? 'completed with errors' : 'complete'}
          </h3>
          <div style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 16 }}>Batch {result.batchRef}</div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
            {[
              ['Created', result.created, ACTION_COLOURS.create],
              ['Updated', result.updated, ACTION_COLOURS.update],
              ['Unchanged', result.unchanged, ACTION_COLOURS.unchanged],
              ['Skipped', result.skipped, ACTION_COLOURS.skip],
              ['Conflicts', result.conflict, ACTION_COLOURS.conflict],
              ['Archived', result.archived, ACTION_COLOURS.archive],
              ['Failed', result.failed, ACTION_COLOURS.fail],
            ].map(([label, value, colour]) => (
              <div key={label as string} style={{ textAlign: 'center', minWidth: 80 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: colour as string }}>{value as number}</div>
                <div style={{ fontSize: 12, color: 'var(--stone)' }}>{label as string}</div>
              </div>
            ))}
          </div>

          {result.errors.length > 0 && (
            <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, fontSize: 12, marginBottom: 16 }}>
              <strong style={{ color: '#B91C1C', display: 'block', marginBottom: 6 }}>Errors:</strong>
              {result.errors.slice(0, 15).map((e, i) => <div key={i} style={{ color: '#7F1D1D' }}>{e}</div>)}
              {result.errors.length > 15 && <div style={{ color: '#7F1D1D' }}>…and {result.errors.length - 15} more (see the import report).</div>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            {result.batchId && (
              <a href={`/api/admin/imports/${result.batchId}/report`} className="btn btn-primary btn-sm">
                Download Import Report (CSV)
              </a>
            )}
            <Link href="/admin/imports" className="btn btn-ghost btn-sm">Import history</Link>
            <Link href="/admin/products" className="btn btn-ghost btn-sm">View all products</Link>
            <button className="btn btn-ghost btn-sm" onClick={reset}>Import another file</button>
          </div>
        </div>
      )}

      {!rows.length && !result && (
        <div className="admin-card" style={{ background: 'var(--cream)', border: '1px solid var(--light-line)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--forest)' }}>
            Expected column format (FBA Standard template)
          </h3>
          <div style={{ fontSize: 12, color: 'var(--stone)', lineHeight: 1.8 }}>
            <strong>Required:</strong> Product Name · Slug (URL) · Artisan / Studio · Category<br />
            <strong>Matching keys (recommended):</strong> Source Product ID · Reference Code · SKU<br />
            <strong>Product:</strong> Short Description · Full Description · Technical Description · Lead Time · Shipping Origin · Images (URLs)<br />
            <strong>Fulfilment:</strong> Made to Order · Dispatch Time · Shipping Notes<br />
            <strong>Documents:</strong> Product Specification URL · Upholstery Program URL · Material &amp; Finishes URL · Tear Sheet URL · Care &amp; Maintenance URL<br />
            <strong>Pricing:</strong> Price Type (Fixed / POA) · Currency · Retail Price · Trade Price · Supplier Cost<br />
            <strong>Visibility:</strong> Visibility (Draft / Published) · Audience (Trade only / Retail and Trade)<br />
            <strong>Dimensions:</strong> Width (mm) · Depth (mm) · Height (mm) · Seat Height (mm) · Weight (kg)<br />
            <strong>Materials:</strong> Material · Finish · Fabric / Upholstery · COM Available<br />
            <strong>SEO:</strong> SEO Title · SEO Description
          </div>
        </div>
      )}
    </>
  )
}
