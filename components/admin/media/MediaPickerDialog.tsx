'use client'

// "Choose media files" dialog (Phase 2) — the Wix-style picker.
// Wraps MediaLibrary in a modal with a Cancel / Add Media footer;
// Add Media stays disabled until at least one file is selected.

import { useState } from 'react'
import MediaLibrary from './MediaLibrary'
import type { MediaLibraryFile } from '@/lib/mediaShared'

type Props = {
  multiple?: boolean
  startBucket?: string
  startFolder?: string
  onClose: () => void
  onSelect: (files: MediaLibraryFile[]) => void | Promise<void>
}

export default function MediaPickerDialog({ multiple = false, startBucket, startFolder, onClose, onSelect }: Props) {
  const [selection, setSelection] = useState<MediaLibraryFile[]>([])
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    if (selection.length === 0) return
    setBusy(true)
    try { await onSelect(selection) } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 60 }}>
      <div
        className="modal" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 1080, width: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--light-line)' }}>
          <h2 className="h3">Choose media files</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--stone)' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <MediaLibrary
            mode="picker"
            pickMultiple={multiple}
            selection={selection}
            onSelectionChange={setSelection}
            startBucket={startBucket}
            startFolder={startFolder}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--light-line)', background: 'var(--warm-white)' }}>
          {selection.length > 0 && (
            <span style={{ fontSize: 13, color: 'var(--stone)', marginRight: 'auto' }}>
              {selection.length} file{selection.length > 1 ? 's' : ''} selected
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={confirm} disabled={busy || selection.length === 0}>
            {busy ? 'Adding…' : 'Add Media'}
          </button>
        </div>
      </div>
    </div>
  )
}
