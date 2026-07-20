'use client'

// Gallery layout: folder tiles first, then image thumbnails with
// filenames — mirrors the reference grid, in FBA colours.

import { formatBytes, cacheBustedUrl, type MediaLibraryFile } from '@/lib/mediaShared'

const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif)$/i

type Props = {
  files: MediaLibraryFile[]
  folders: string[]
  activePath: string | null
  picked: string[]
  onFolder: (name: string) => void
  onFile: (f: MediaLibraryFile) => void
}

export default function MediaGrid({ files, folders, activePath, picked, onFolder, onFile }: Props) {
  const keyOf = (f: MediaLibraryFile) => `${f.bucket}/${f.path}`

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
      {folders.map(name => (
        <button
          key={`dir:${name}`}
          onDoubleClick={() => onFolder(name)}
          onClick={() => onFolder(name)}
          style={{
            border: '1px solid var(--light-line)', borderRadius: 6, background: 'var(--cream)',
            cursor: 'pointer', padding: 0, overflow: 'hidden', textAlign: 'left',
          }}
          title={`Open ${name}`}
        >
          <div style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--caramel)" strokeWidth="1.4">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
            </svg>
          </div>
          <div style={{ padding: '7px 10px', fontSize: 12, fontWeight: 500, color: 'var(--forest)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </div>
        </button>
      ))}

      {files.map(f => {
        const k = keyOf(f)
        const isActive = activePath === k
        const isPicked = picked.includes(k)
        return (
          <div
            key={k}
            onClick={() => onFile(f)}
            style={{
              border: isPicked ? '2px solid var(--forest)' : isActive ? '2px solid var(--caramel)' : '1px solid var(--light-line)',
              borderRadius: 6, overflow: 'hidden', cursor: 'pointer', background: 'var(--warm-white)', position: 'relative',
            }}
          >
            {isPicked && (
              <div style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: '50%', background: 'var(--forest)', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>✓</div>
            )}
            <div style={{ aspectRatio: '1', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {IMAGE_RE.test(f.name) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cacheBustedUrl(f.url, f.updatedAt)} alt={f.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 12, color: 'var(--stone)' }}>{f.name.split('.').pop()?.toUpperCase() ?? 'FILE'}</span>
              )}
            </div>
            <div style={{ padding: '7px 10px' }}>
              <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.path}>{f.name}</div>
              <div style={{ fontSize: 11, color: 'var(--stone)', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                <span>{formatBytes(f.size)}</span>
                {f.usedIn.length > 0 && (
                  <span title={f.usedIn.map(u => u.label).join('\n')} style={{ color: 'var(--caramel)' }}>used ×{f.usedIn.length}</span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
