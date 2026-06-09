'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Post {
  id: string
  title: string
  slug: string
  excerpt?: string
  content: string
  featured_image?: string
  category?: string
  tags?: string[]
  status: 'draft' | 'published'
  seo_title?: string
  seo_description?: string
}

interface JournalPostFormProps {
  post?: Post
}

const CATEGORIES = [
  'Studio Notes', 'Maker Profiles', 'Design Thinking',
  'Project Stories', 'Materials & Craft', 'News & Events',
]

export function JournalPostForm({ post }: JournalPostFormProps) {
  const router = useRouter()
  const isEdit = !!post

  const [form, setForm] = useState({
    title:           post?.title           ?? '',
    slug:            post?.slug            ?? '',
    excerpt:         post?.excerpt         ?? '',
    content:         post?.content         ?? '',
    featured_image:  post?.featured_image  ?? '',
    category:        post?.category        ?? '',
    tags:            post?.tags?.join(', ') ?? '',
    status:          post?.status          ?? 'draft',
    seo_title:       post?.seo_title       ?? '',
    seo_description: post?.seo_description ?? '',
  })

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const autoSlug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const handleTitleChange = (v: string) => {
    set('title', v)
    if (!isEdit) set('slug', autoSlug(v))
  }

  const save = async (status: 'draft' | 'published') => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        status,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        ...(status === 'published' && !post?.status?.includes('published')
          ? { published_at: new Date().toISOString() }
          : {}),
      }

      const url    = isEdit ? `/api/admin/journals/${post!.id}` : '/api/admin/journals'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? 'Something went wrong')
        return
      }

      router.push('/admin/journals')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 320px',
      gap: 32,
      alignItems: 'start',
    }}>
      {/* Main content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {error && (
          <div style={{
            background: '#F8D7DA', border: '1px solid #F5C6CB',
            color: '#721C24', padding: '12px 16px', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Post Title *</label>
          <input
            className="form-input"
            value={form.title}
            onChange={e => handleTitleChange(e.target.value)}
            placeholder="Give this post a compelling title"
          />
        </div>

        <div className="form-group">
          <label className="form-label">URL Slug *</label>
          <input
            className="form-input"
            value={form.slug}
            onChange={e => set('slug', e.target.value)}
            placeholder="url-friendly-slug"
          />
          <p className="form-hint">Will be: /journal/{form.slug || 'your-slug'}</p>
        </div>

        <div className="form-group">
          <label className="form-label">Excerpt</label>
          <textarea
            className="form-textarea"
            value={form.excerpt}
            onChange={e => set('excerpt', e.target.value)}
            placeholder="A short summary shown in listings and previews…"
            style={{ minHeight: 80 }}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Content *</label>
          <textarea
            className="form-textarea"
            value={form.content}
            onChange={e => set('content', e.target.value)}
            placeholder="Write your post content here. Markdown is supported."
            style={{ minHeight: 400, fontFamily: 'monospace', fontSize: 13 }}
          />
          <p className="form-hint">Markdown is supported — use **bold**, *italic*, ## headings, etc.</p>
        </div>

        {/* SEO */}
        <div style={{
          padding: 24, background: 'var(--warm-white)',
          border: '1px solid var(--light-line)',
        }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 20 }}>
            SEO (optional)
          </h3>
          <div className="form-group">
            <label className="form-label">SEO Title</label>
            <input
              className="form-input"
              value={form.seo_title}
              onChange={e => set('seo_title', e.target.value)}
              placeholder="Overrides post title in search results"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">SEO Description</label>
            <textarea
              className="form-textarea"
              value={form.seo_description}
              onChange={e => set('seo_description', e.target.value)}
              placeholder="155 characters max"
              style={{ minHeight: 80 }}
            />
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'sticky', top: 32 }}>
        {/* Actions */}
        <div style={{
          background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 24,
        }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 20 }}>
            Publish
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => save('published')}
              disabled={saving || !form.title || !form.content}
              className="btn btn-primary btn-full"
            >
              {saving ? 'Saving…' : (isEdit ? 'Update & Publish' : 'Publish Now')}
            </button>
            <button
              onClick={() => save('draft')}
              disabled={saving || !form.title || !form.content}
              className="btn btn-secondary btn-full"
            >
              {saving ? 'Saving…' : 'Save as Draft'}
            </button>
          </div>
          {isEdit && (
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--stone)' }}>
              Status: <span className={`status-pill status-${post!.status}`}>{post!.status}</span>
            </div>
          )}
        </div>

        {/* Meta */}
        <div style={{
          background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 24,
        }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 20 }}>
            Post Details
          </h3>
          <div className="form-group">
            <label className="form-label">Category</label>
            <select
              className="form-select"
              value={form.category}
              onChange={e => set('category', e.target.value)}
            >
              <option value="">Select category…</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Tags</label>
            <input
              className="form-input"
              value={form.tags}
              onChange={e => set('tags', e.target.value)}
              placeholder="craft, sourcing, Italy (comma-separated)"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Cover Image URL</label>
            <input
              className="form-input"
              value={form.featured_image}
              onChange={e => set('featured_image', e.target.value)}
              placeholder="https://images.pexels.com/..."
            />
            <p className="form-hint">Use Pexels CDN URLs (w=800)</p>
          </div>
        </div>
      </div>
    </div>
  )
}
