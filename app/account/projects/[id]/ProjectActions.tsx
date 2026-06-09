'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function RemoveItemButton({ projectId, itemId }: { projectId: string; itemId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleRemove = async () => {
    if (!confirm('Remove this piece from the project?')) return
    setLoading(true)
    await fetch(`/api/projects/${projectId}/items/${itemId}`, { method: 'DELETE' })
    router.refresh()
    setLoading(false)
  }

  return (
    <button
      className="btn btn-ghost btn-sm"
      style={{ color: 'var(--danger)', fontSize: 11 }}
      onClick={handleRemove}
      disabled={loading}
    >
      {loading ? '…' : 'Remove'}
    </button>
  )
}

export function RequestQuoteButton({ projectId }: { projectId: string }) {
  const [sent, setSent] = useState(false)

  const handleClick = async () => {
    // In production, this opens the quote request flow
    // For now show a placeholder confirm
    if (confirm('This will submit a quote request for all items in this project. Continue?')) {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <button className="btn btn-primary btn-sm" disabled>
        ✓ Quote requested
      </button>
    )
  }

  return (
    <button className="btn btn-primary btn-sm" onClick={handleClick}>
      Request Quote for All Items
    </button>
  )
}

export function ExportScheduleButton({ projectName }: { projectName: string }) {
  const handleExport = () => {
    window.open(`${window.location.pathname}/export`, '_blank')
  }

  return (
    <button className="btn btn-secondary btn-sm" onClick={handleExport}>
      Export Schedule
    </button>
  )
}
