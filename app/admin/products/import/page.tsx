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

interface ImportResult {
  success: boolean
  inserted: number
  skipped: number
  errors: string[]
}

// Columns shown in the preview table
const PREVIEW_COLS = [
  'Product Name',
  'Slug (URL)',
  'Artisan / Studio',
  'Category',
  'Subcategory',
  'Price Type',
  'Images (URLs)',
]

export default function ImportProductsPage() {
  const [xlsxReady,  setXlsxReady]  = useState(false)
  const [driveUrl,   setDriveUrl]   = useState('')
  const [fetching,   setFetching]   = useState(false)
  const [rows,       setRows]       = useState<Row[]>([])
  const [headers,    setHeaders]    = useState<string[]>([])
  const [fileName,   setFileName]   = useState('')
  const [importing,  setImporting]  = useState(false)
  const [result,     setResult]     = useState<ImportResult | null>(null)
  const [error,      setError]      = useState('')

  useEffect(() => {
    if (window.XLSX) setXlsxReady(true)
  }, [])

  // ── Parse base64 xlsx bytes with the XLSX CDN library ─────────────────────
  function parseBase64(base64: string, label: string) {
    if (!window.XLSX) { setError('Excel parser not ready yet. Please wait a moment.'); return }
    try {
      const binary = atob(base64)
      const bytes  = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

      const wb   = window.XLSX.read(bytes, { type: 'array' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const json: Row[] = window.XLSX.utils.sheet_to_json(ws, { defval: '' })

      if (!json.length) { setError('No data rows found in the file.'); return }

      const filtered = json.filter(r => {
        const slug = r['Slug (URL)'] ?? r['Slug'] ?? ''
        const name = r['Product Name'] ?? r['Name'] ?? r['Products Product Name'] ?? ''
        return slug.trim() !== '' || name.trim() !== ''
      })

      setHeaders(Object.keys(json[0]))
      setRows(filtered)
      setFileName(label)
      setError('')
    } catch (err) {
      setError(`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Fetch from Google Drive ────────────────────────────────────────────────
  const handleFetch = async () => {
    if (!driveUrl.trim()) { setError('Paste a Google Drive link first.'); return }
    setFetching(true)
    setError('')
    setRows([])
    try {
      const res  = await fetch('/api/admin/products/fetch-drive', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ driveUrl: driveUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to fetch file.'); return }
      parseBase64(data.base64, `Drive file: ${data.fileId.slice(0, 12)}…`)
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setFetching(false)
    }
  }

  // ── Import rows into DB ────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!rows.length) return
    setImporting(true)
    setError('')
    try {
      const res  = await fetch('/api/admin/products/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rows }),
      })
      const data: ImportResult = await res.json()
      setResult(data)
      if (!data.success) setError('Import failed — see errors below.')
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setRows([]); setHeaders([]); setFileName(''); setResult(null)
    setError(''); setDriveUrl('')
  }

  const previewCols = headers.length
    ? PREVIEW_COLS.filter(c => headers.includes(c))
    : []

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
        onLoad={() => setXlsxReady(true)}
      />

      <div className="admin-header">
        <div>
          <h1 className="admin-title">Import from Google Drive</h1>
          <p className="admin-subtitle">
            Paste a Google Drive link to a supplier .xlsx file — data is fetched directly, nothing is uploaded.
          </p>
        </div>
        <Link href="/admin/products" className="btn btn-ghost btn-sm">
          ← Back to Products
        </Link>
      </div>

      {/* ── Step 1: Drive Link ───────────────────────────────────────────────── */}
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
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid var(--light-line)',
                borderRadius: 6,
                fontSize: 13,
                background: 'var(--warm-white)',
                color: 'var(--forest)',
                outline: 'none',
              }}
              onKeyDown={e => { if (e.key === 'Enter') handleFetch() }}
              disabled={fetching}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleFetch}
              disabled={fetching || !xlsxReady}
              style={{ whiteSpace: 'nowrap' }}
            >
              {fetching ? 'Fetching…' : 'Fetch & Preview'}
            </button>
          </div>

          {/* Permission tip */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 14px',
            background: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: 6,
            fontSize: 12,
            color: '#0369A1',
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>ℹ</span>
            <div>
              The file must be shared as <strong>"Anyone with the link can view"</strong> in Google Drive.
              Open the file in Drive → Share → Change access → Anyone with the link.
            </div>
          </div>

          {error && (
            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 6, color: '#B91C1C', fontSize: 13,
            }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Preview ─────────────────────────────────────────────────── */}
      {rows.length > 0 && !result && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--forest)', marginBottom: 2 }}>
                Step 2 — Review ({rows.length} products)
              </h3>
              <div style={{ fontSize: 12, color: 'var(--stone)' }}>
                {fileName} · Existing slugs will be skipped.
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={reset}>
              Use a different file
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>#</th>
                  {previewCols.map(c => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((row, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--stone)' }}>{i + 1}</td>
                    {previewCols.map(c => (
                      <td key={c} style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c === 'Images (URLs)' && row[c]
                          ? <span style={{ color: 'var(--caramel)' }}>✓ image</span>
                          : row[c] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 20 && (
            <p style={{ fontSize: 12, color: 'var(--stone)', marginTop: 8 }}>
              …and {rows.length - 20} more rows not shown in preview.
            </p>
          )}

          {error && (
            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 6, color: '#B91C1C', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? 'Importing…' : `Import all ${rows.length} products`}
            </button>
            <button className="btn btn-ghost" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Result ──────────────────────────────────────────────────── */}
      {result && (
        <div className="admin-card">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--forest)', marginBottom: 16 }}>
            Import complete
          </h3>

          <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#16A34A' }}>{result.inserted}</div>
              <div style={{ fontSize: 12, color: 'var(--stone)' }}>Imported</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--stone)' }}>{result.skipped}</div>
              <div style={{ fontSize: 12, color: 'var(--stone)' }}>Skipped (already exist)</div>
            </div>
            {result.errors.length > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#DC2626' }}>{result.errors.length}</div>
                <div style={{ fontSize: 12, color: 'var(--stone)' }}>Errors</div>
              </div>
            )}
          </div>

          {result.errors.length > 0 && (
            <div style={{
              padding: '12px 16px',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 6,
              fontSize: 12,
              marginBottom: 16,
            }}>
              <strong style={{ color: '#B91C1C', display: 'block', marginBottom: 6 }}>Errors:</strong>
              {result.errors.map((e, i) => <div key={i} style={{ color: '#7F1D1D' }}>{e}</div>)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <Link href="/admin/products" className="btn btn-primary btn-sm">
              View all products
            </Link>
            <button className="btn btn-ghost btn-sm" onClick={reset}>
              Import another file
            </button>
          </div>
        </div>
      )}

      {/* ── Format guide ────────────────────────────────────────────────────── */}
      {!rows.length && !result && (
        <div className="admin-card" style={{ background: 'var(--cream)', border: '1px solid var(--light-line)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--forest)' }}>
            Expected column format (FBA Standard template)
          </h3>
          <div style={{ fontSize: 12, color: 'var(--stone)', lineHeight: 1.8 }}>
            <strong>Required:</strong> Product Name · Slug (URL) · Artisan / Studio · Category<br />
            <strong>Product:</strong> Short Description · Full Description · Lead Time · Shipping Origin · Images (URLs)<br />
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
