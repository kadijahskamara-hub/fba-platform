'use client'

// List layout: the same content as the gallery, as a data table
// (thumb, name, folder, size, updated, used-in count).

import { formatBytes, parentFolder, type MediaLibraryFile } from '@/lib/mediaShared'

const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif)$/i

type Props = {
  files: MediaLibraryFile[]
  folders: string[]
  activePath: string | null
  picked: string[]
  onFolder: (name: string) => void
  onFile: (f: MediaLibraryFile) => void
}

export default function MediaList({ files, folders, activePath, picked, onFolder, onFile }: Props) {
  const keyOf = (f: MediaLibraryFile) => `${f.bucket}/${f.path}`

  return (
    <table className="data-table">
      <thead><tr><th style={{ width: 46 }}></th><th>Name</th><th>Folder</th><th>Size</th><th>Updated</th><th>Used</th></tr></thead>
      <tbody>
        {folders.map(name => (
          <tr key={`dir:${name}`} onClick={() => onFolder(name)} style={{ cursor: 'pointer' }}>
            <td>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--caramel)" strokeWidth="1.4">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
              </svg>
            </td>
            <td style={{ fontSize: 13, fontWeight: 600 }}>{name}</td>
            <td colSpan={4} style={{ fontSize: 12, color: 'var(--stone)' }}>Folder</td>
          </tr>
        ))}
        {files.map(f => {
          const k = keyOf(f)
          const isActive = activePath === k
          const isPicked = picked.includes(k)
          return (
            <tr
              key={k}
              onClick={() => onFile(f)}
              style={{ cursor: 'pointer', background: isPicked ? 'var(--cream)' : isActive ? 'var(--cream)' : undefined }}
            >
              <td>
                <div style={{ width: 34, height: 34, background: 'var(--cream)', borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: isPicked ? '2px solid var(--forest)' : undefined }}>
                  {IMAGE_RE.test(f.name) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 9, color: 'var(--stone)' }}>{f.name.split('.').pop()?.toUpperCase()}</span>
                  )}
                </div>
              </td>
              <td style={{ fontSize: 13, fontWeight: 500, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.path}>{f.name}</td>
              <td style={{ fontSize: 12, color: 'var(--stone)' }}>{parentFolder(f.path) || '—'}</td>
              <td style={{ fontSize: 12, color: 'var(--stone)' }}>{formatBytes(f.size)}</td>
              <td style={{ fontSize: 12, color: 'var(--stone)' }}>{f.updatedAt ? new Date(f.updatedAt).toLocaleDateString('en-GB') : '—'}</td>
              <td style={{ fontSize: 12 }}>
                {f.usedIn.length > 0
                  ? <span style={{ color: 'var(--caramel)' }} title={f.usedIn.map(u => u.label).join('\n')}>×{f.usedIn.length}</span>
                  : <span style={{ color: 'var(--stone)' }}>—</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
