'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ============================================================
// Row action menu: Edit / View public / Publish / Unpublish /
// Duplicate / Archive / Restore / Delete permanently.
// Calls POST /api/admin/products/[id]/lifecycle
//
// The menu is rendered in a portal with fixed positioning so it
// is never clipped by the table's overflow container (which
// previously hid the menu on lower rows).
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
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => setMounted(true), [])

  const positionMenu = useCallback(() => {
    const btn = btnRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    setCoords({ top: r.bottom + 4, right: window.innerWidth - r.right })
  }, [])

  const openMenu = () => {
    positionMenu()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node
      if (menuRef.current?.contains(t)) return
      if (btnRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function reposition() {
      // If the menu scrolls out of the viewport, close it rather than
      // leaving it floating in a stale position.
      setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

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

  const menu = open && coords ? (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed', top: coords.top, right: coords.right, zIndex: 1000, minWidth: 190,
        background: 'var(--warm-white, #fff)', border: '1px solid var(--light-line, #e5e0d8)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
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
  ) : null

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        className="btn btn-ghost btn-sm"
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${name}`}
      >
        {busy ? '…' : '⋯'}
      </button>
      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
