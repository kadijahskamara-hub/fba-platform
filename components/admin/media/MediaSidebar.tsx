'use client'

// Media Library sidebar: Upload, Home (recents), buckets, Trash,
// storage usage bar. FBA palette throughout.

import { storageBarLevel, formatBytes } from '@/lib/mediaShared'
import type { MediaView } from './MediaLibrary'

type Props = {
  view: MediaView
  bucket: string
  buckets: string[]
  stats: { usedBytes: number; capMb: number } | null
  uploading: boolean
  onUploadClick: () => void
  onHome: () => void
  onBucket: (b: string) => void
  onTrash: () => void
}

const BUCKET_LABELS: Record<string, string> = {
  'product-media': 'Product media',
  'site-assets': 'Site assets',
}

export default function MediaSidebar({
  view, bucket, buckets, stats, uploading, onUploadClick, onHome, onBucket, onTrash,
}: Props) {
  const item = (selected: boolean): React.CSSProperties => ({
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13,
    background: selected ? 'var(--cream)' : 'none', border: 'none',
    borderLeft: selected ? '3px solid var(--caramel)' : '3px solid transparent',
    cursor: 'pointer', color: 'var(--forest)', fontWeight: selected ? 600 : 400,
  })
  const sectionLabel: React.CSSProperties = {
    fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--stone)', padding: '14px 12px 6px',
  }

  const level = stats ? storageBarLevel(stats.usedBytes, stats.capMb) : 'ok'
  const barColor = level === 'critical' ? '#a03030' : level === 'warn' ? '#b98a2f' : 'var(--forest-mid)'
  const pct = stats ? Math.min(100, (stats.usedBytes / (stats.capMb * 1024 * 1024)) * 100) : 0

  return (
    <div style={{ borderRight: '1px solid var(--light-line)', background: 'var(--warm-white)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 14 }}>
        <button className="btn btn-primary btn-sm" style={{ width: '100%' }} disabled={uploading} onClick={onUploadClick}>
          {uploading ? 'Uploading…' : '+ Upload Media'}
        </button>
      </div>

      <button style={item(view === 'recents')} onClick={onHome}>Home</button>

      <div style={sectionLabel}>Manage</div>
      {buckets.map(b => (
        <button key={b} style={item(view === 'browse' && bucket === b)} onClick={() => onBucket(b)}>
          {BUCKET_LABELS[b] ?? b}
        </button>
      ))}
      <button style={item(view === 'trash')} onClick={onTrash}>Trash</button>

      <div style={{ marginTop: 'auto', padding: 14, borderTop: '1px solid var(--light-line)' }}>
        {stats ? (
          <>
            <div style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 6 }} title="Trash still counts toward storage — empty it to free space.">
              {formatBytes(stats.usedBytes)} used of {stats.capMb >= 1024 ? `${(stats.capMb / 1024).toFixed(stats.capMb % 1024 === 0 ? 0 : 1)} GB` : `${stats.capMb} MB`}
            </div>
            <div style={{ height: 4, background: 'var(--cream)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ width: `${pct}%`, height: '100%', background: barColor }} />
            </div>
            <button onClick={onTrash} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--caramel)' }}>
              Manage storage
            </button>
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--stone)' }}>Calculating storage…</div>
        )}
      </div>
    </div>
  )
}
