'use client'

// /admin/media — Media Library (Phase 2 rebuild).
// Thin wrapper: all behaviour lives in components/admin/media/.

import MediaLibrary from '@/components/admin/media/MediaLibrary'

export default function AdminMediaPage() {
  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Media Library</h1>
          <p className="admin-subtitle">Upload, organise and assign the images used across the site</p>
        </div>
      </div>
      <MediaLibrary mode="page" />
    </>
  )
}
