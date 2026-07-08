'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Artisan = {
  id: string
  name: string
  slug: string
  location: string | null
  short_bio: string | null
  bio: string | null
  craft_category: string | null
  profile_image: string | null
  gallery_images: string[] | null
  website: string | null
  instagram_handle: string | null
  is_active: boolean
}

export function ArtisanEditForm({ artisan }: { artisan: Artisan }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDelete] = useTransition()
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: artisan.name ?? '',
    slug: artisan.slug ?? '',
    location: artisan.location ?? '',
    shortBio: artisan.short_bio ?? '',
    bio: artisan.bio ?? '',
    craftCategory: artisan.craft_category ?? '',
    profileImage: artisan.profile_image ?? '',
    galleryImages: (artisan.gallery_images ?? []).join('\n'),
    website: artisan.website ?? '',
    instagramHandle: artisan.instagram_handle ?? '',
    isActive: artisan.is_active ?? true,
  })

  const update = (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const val = (e.target as HTMLInputElement).type === 'checkbox'
        ? (e.target as HTMLInputElement).checked
        : e.target.value
      setForm(f => ({ ...f, [field]: val }))
    }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.slug) { setError('Name and slug are required.'); return }
    setError('')

    startTransition(async () => {
      const res = await fetch(`/api/admin/artisans/${artisan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:            form.name,
          slug:            form.slug,
          location:        form.location || null,
          short_bio:       form.shortBio || null,
          bio:             form.bio || null,
          craft_category:  form.craftCategory || null,
          profile_image:   form.profileImage || null,
          gallery_images:  form.galleryImages.split('\n').map(s => s.trim()).filter(Boolean),
          website:         form.website || null,
          instagram_handle:form.instagramHandle || null,
          is_active:       form.isActive,
        }),
      })
      const data = await res.json()
      if (!data.success) { setError(data.error ?? 'Failed to save.'); return }
      router.push('/admin/artisans')
      router.refresh()
    })
  }

  const handleDelete = () => {
    if (!confirm(`Delete artisan "${form.name}"? This cannot be undone.`)) return
    startDelete(async () => {
      const res = await fetch(`/api/admin/artisans/${artisan.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.success) { setError(data.error ?? 'Failed to delete.'); return }
      router.push('/admin/artisans')
      router.refresh()
    })
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Edit Artisan</h1>
          <p className="admin-subtitle">{form.name || 'Artisan profile'}</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/admin/artisans" className="btn btn-secondary btn-sm">Cancel</Link>
          <button type="submit" form="artisan-form" className="btn btn-primary btn-sm" disabled={isPending}>
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#F8D7DA', color: '#721C24', padding: '12px 16px', marginBottom: 24, fontSize: 14 }}>
          {error}
        </div>
      )}

      <form id="artisan-form" onSubmit={handleSubmit}>
        <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 40 }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Artisan / Studio name *</label>
              <input type="text" required className="form-input" value={form.name} onChange={update('name')} />
            </div>
            <div className="form-group">
              <label className="form-label">Slug *</label>
              <input type="text" required className="form-input" value={form.slug}
                onChange={update('slug')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Location</label>
              <input type="text" className="form-input" value={form.location}
                onChange={update('location')} placeholder="e.g. Oaxaca, Mexico" />
            </div>
            <div className="form-group">
              <label className="form-label">Craft category</label>
              <input type="text" className="form-input" value={form.craftCategory}
                onChange={update('craftCategory')} placeholder="e.g. Ceramics, Furniture, Lighting" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Short bio (one line for cards)</label>
            <input type="text" className="form-input" value={form.shortBio}
              onChange={update('shortBio')} maxLength={160} />
          </div>
          <div className="form-group">
            <label className="form-label">Full biography</label>
            <textarea className="form-textarea" rows={6} value={form.bio} onChange={update('bio')} />
          </div>
          <div className="form-group">
            <label className="form-label">Profile image URL (Pexels)</label>
            <input type="url" className="form-input" value={form.profileImage}
              onChange={update('profileImage')}
              placeholder="https://images.pexels.com/photos/123456/pexels-photo-123456.jpeg?auto=compress&cs=tinysrgb&w=800" />
          </div>
          <div className="form-group">
            <label className="form-label">Gallery images (one URL per line)</label>
            <textarea className="form-textarea" rows={4} value={form.galleryImages}
              onChange={update('galleryImages')} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Website</label>
              <input type="url" className="form-input" value={form.website}
                onChange={update('website')} placeholder="https://example.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Instagram handle</label>
              <input type="text" className="form-input" value={form.instagramHandle}
                onChange={update('instagramHandle')} placeholder="@studioname" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-checkbox">
              <input type="checkbox" checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
              <span style={{ fontSize: 13 }}>Active (visible on website)</span>
            </label>
          </div>
        </div>
      </form>

      <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--light-line)' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={handleDelete}
          disabled={isDeleting} style={{ color: '#B00020' }}>
          {isDeleting ? 'Deleting…' : 'Delete artisan'}
        </button>
      </div>
    </>
  )
}
