'use client'

import { useRouter } from 'next/navigation'
import { appConfirm } from '@/lib/appConfirm'
import { useState } from 'react'

export function RemoveItemButton({ projectId, itemId }: { projectId: string; itemId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleRemove = async () => {
    if (!await appConfirm('Remove this piece from the project?')) return
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
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    if (!await appConfirm('This will submit a quote request to Full Bloom Artelier for all items in this project. Continue?')) return
    setState('sending')
    setError(null)
    try {
      const res = await fetch('/api/quote-requests', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Could not submit quote request.')
      setState('sent')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setState('idle')
    }
  }

  if (state === 'sent') {
    return <button className="btn btn-primary btn-sm" disabled>✓ Quote requested</button>
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <button className="btn btn-primary btn-sm" onClick={handleClick} disabled={state === 'sending'}>
        {state === 'sending' ? 'Submitting…' : 'Request Quote for All Items'}
      </button>
      {error && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</span>}
    </span>
  )
}

export function ExportScheduleButton() {
  const csv  = () => { window.location.href = `${window.location.pathname}/export?format=csv` }
  const pdf  = () => { window.open(`${window.location.pathname}/export?format=pdf`, '_blank') }
  const html = () => { window.open(`${window.location.pathname}/export?format=html`, '_blank') }

  return (
    <span style={{ display: 'inline-flex', gap: 8 }}>
      <button className="btn btn-secondary btn-sm" onClick={csv}>Export CSV</button>
      <button className="btn btn-secondary btn-sm" onClick={pdf}>Export PDF</button>
      <button className="btn btn-secondary btn-sm" onClick={html}>Print</button>
    </span>
  )
}
