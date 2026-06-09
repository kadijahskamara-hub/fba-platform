'use client'

import { useState, useEffect, useTransition } from 'react'
import type { Product, Project, SessionUser } from '@/lib/types'

interface ProjectSaveModalProps {
  product: Product
  session: SessionUser | null
  onClose: () => void
}

export function ProjectSaveModal({ product, session, onClose }: ProjectSaveModalProps) {
  const [projects,    setProjects]    = useState<Project[]>([])
  const [loading,     setLoading]     = useState(true)
  const [selectedId,  setSelectedId]  = useState<string>('')
  const [newName,     setNewName]     = useState('')
  const [mode,        setMode]        = useState<'select' | 'new'>('select')
  const [saved,       setSaved]       = useState(false)
  const [isPending,   startTransition] = useTransition()

  useEffect(() => {
    if (!session) return
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => { setProjects(d.data ?? []); setLoading(false) })
  }, [session])

  if (!session) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>✕</button>
          <div style={{ padding: 40, textAlign: 'center' }}>
            <h2 className="h2" style={{ marginBottom: 16 }}>Save to Project</h2>
            <p className="body-sm" style={{ marginBottom: 28 }}>
              Sign in or create an account to save products to your project folders.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <a href={`/login?next=/products/${product.slug}`} className="btn btn-primary">Sign In</a>
              <a href={`/register`} className="btn btn-secondary">Create Account</a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (saved) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
            <h2 className="h2" style={{ marginBottom: 12 }}>Saved!</h2>
            <p className="body-sm" style={{ marginBottom: 24 }}>
              {product.name} has been added to your project.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <a href="/account/projects" className="btn btn-primary btn-sm">View My Projects</a>
              <button className="btn btn-secondary btn-sm" onClick={onClose}>Continue Browsing</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const handleSave = async () => {
    startTransition(async () => {
      let projectId = selectedId

      // Create new project if needed
      if (mode === 'new') {
        if (!newName.trim()) return
        const res  = await fetch('/api/projects', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim() }),
        })
        const data = await res.json()
        if (!data.success) return
        projectId = data.data.id
      }

      if (!projectId) return

      const res = await fetch(`/api/projects/${projectId}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      })
      const data = await res.json()
      if (data.success) setSaved(true)
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div style={{ padding: 40 }}>
          <div className="label label-sage" style={{ marginBottom: 12 }}>Save to Project</div>
          <h2 className="h2" style={{ marginBottom: 8 }}>{product.name}</h2>
          <p className="body-sm" style={{ marginBottom: 28 }}>
            Choose an existing project folder or create a new one.
          </p>

          {/* Mode toggle */}
          <div className="tab-bar" style={{ marginBottom: 24 }}>
            <button className={`tab-btn${mode === 'select' ? ' active' : ''}`} onClick={() => setMode('select')}>
              Existing project
            </button>
            <button className={`tab-btn${mode === 'new' ? ' active' : ''}`} onClick={() => setMode('new')}>
              New project
            </button>
          </div>

          {mode === 'select' && (
            <div>
              {loading ? (
                <p className="body-sm">Loading projects…</p>
              ) : projects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <p className="body-sm" style={{ marginBottom: 16 }}>You don't have any projects yet.</p>
                  <button className="btn btn-secondary btn-sm" onClick={() => setMode('new')}>
                    Create your first project
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                  {projects.map(p => (
                    <label key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                      border: `1px solid ${selectedId === p.id ? 'var(--forest)' : 'var(--light-line)'}`,
                      cursor: 'pointer', transition: 'border-color 0.2s',
                      background: selectedId === p.id ? 'var(--sage-light)' : 'var(--warm-white)',
                    }}>
                      <input type="radio" name="project" value={p.id}
                        checked={selectedId === p.id}
                        onChange={() => setSelectedId(p.id)} />
                      <span style={{ fontSize: 14 }}>{p.name}</span>
                      {p.location && <span style={{ fontSize: 12, color: 'var(--stone)', marginLeft: 'auto' }}>{p.location}</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === 'new' && (
            <div className="form-group" style={{ marginBottom: 24 }}>
              <label className="form-label">Project name</label>
              <input type="text" className="form-input" placeholder="e.g. Marylebone Residence"
                value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
            </div>
          )}

          <button
            className="btn btn-primary btn-full"
            onClick={handleSave}
            disabled={isPending || (mode === 'select' && !selectedId) || (mode === 'new' && !newName.trim())}
          >
            {isPending ? 'Saving…' : 'Save to Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
