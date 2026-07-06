'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ============================================================
// Row action menu: Edit / View public / Publish / Unpublish /
// Duplicate / Archive / Restore / Delete permanently.
// Calls POST /api/admin/products/[id]/lifecycle
// ============================================================

interface Props {
  productId: string
  slug: string
  name: string
  visibility: string
  isArchived: boolean
  isAdmin: boolean
}

export default function ProductRowActions({ productId, slug, name, visibility, isArchived, isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/products/${productId}/lifecycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const json = await res.json()
      if (!json.success) {
        alert(json.error ?? 'Action failed')
      } else {
        setOpen(false)
        router.refresh()
      }
    } catch {
      alert('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  function onArchive() {
    if (confirm(`Archive "${name}"?\n\nThis will remove it from the public catalogue but keep the product record for admin history, project boards, imports, and quote references.`)) {
      run('archive')
    }
  }

  function onDelete() {
    const typed = prompt(`Permanently delete "${name}"?\n\nThis cannot be undone. Use Archive unless this is a mistaken test product or duplicate import.\n\nType DELETE to confirm:`)
    if (typed === null) return
    if (typed !== 'DELETE') {
      alert('Deletion cancelled — confirmation text did not match.')
      return
    }
    run('delete', { confirm: 'DELETE' })
  }

  const itemStyle: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px',
    fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--ink, #1a1a1a)', textDecoration: 'none',
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen(!open)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${name}`}
      >
        {busy ? '…' : '⋯'}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', right: 0, top: '100%', zIndex: 50, minWidth: 190,
            background: 'var(--warm-white, #fff)', border: '1px solid var(--light-line, #e5e0d8)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          }}
        >
          <Link href={`/admin/products/${slug}`} style={itemStyle} role="menuitem">Edit</Link>
          <Link href={`/products/${slug}`} target="_blank" style={itemStyle} role="menuitem">View public page ↗</Link>
          {!isArchived && visibility !== 'published' && (
            <button style={itemStyle} role="menuitem" onClick={() => run('publish')}>Publish</button>
          )}
          {!isArchived && visibility === 'published' && (
            <button style={itemStyle} role="menuitem" onClick={() => run('unpublish')}>Unpublish</button>
          )}
          <button style={itemStyle} role="menuitem" onClick={() => run('duplicate')}>Duplicate</button>
          {!isArchived ? (
            <button style={{ ...itemStyle, color: 'var(--caramel, #a05a2c)' }} role="menuitem" onClick={onArchive}>Archive</button>
          ) : (
            <button style={itemStyle} role="menuitem" onClick={() => run('unarchive')}>Restore</button>
          )}
          {isAdmin && (
            <button style={{ ...itemStyle, color: '#a03030', borderTop: '1px solid var(--light-line, #e5e0d8)' }} role="menuitem" onClick={onDelete}>
              Delete permanently
            </button>
          )}
        </div>
      )}
    </div>
  )
}
