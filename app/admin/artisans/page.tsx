import Link from 'next/link'
import Image from 'next/image'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Artisans' }

export default async function AdminArtisansPage() {
  const { data: artisans } = await supabaseAdmin
    .from('artisans')
    .select('id, name, slug, location, profile_image, is_active, created_at')
    .order('name')

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Artisans</h1>
          <p className="admin-subtitle">{artisans?.length ?? 0} artisan studio{artisans?.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/admin/artisans/new" className="btn btn-primary btn-sm">
          + Add Artisan
        </Link>
      </div>

      {!artisans?.length ? (
        <div className="empty-state">
          <h3>No artisans yet</h3>
          <p>Add your first artisan or studio to start linking products.</p>
          <div style={{ marginTop: 24 }}>
            <Link href="/admin/artisans/new" className="btn btn-primary btn-sm">Add Artisan</Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
          {artisans.map((a: Record<string, unknown>) => (
            <div key={a.id as string} style={{
              background: 'var(--warm-white)',
              border: '1px solid var(--light-line)',
              overflow: 'hidden',
            }}>
              <div style={{ height: 160, position: 'relative', background: 'var(--sage-light)' }}>
                {!!a.profile_image && (
                  <Image
                    src={a.profile_image as string}
                    alt={a.name as string}
                    fill
                    style={{ objectFit: 'cover' }}
                  />
                )}
                {!a.is_active && (
                  <div style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'rgba(0,0,0,0.6)', color: '#fff',
                    fontSize: 10, padding: '2px 8px', letterSpacing: '0.1em',
                  }}>
                    INACTIVE
                  </div>
                )}
              </div>
              <div style={{ padding: '20px 20px 24px' }}>
                <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 4 }}>{a.name as string}</div>
                {!!a.location && (
                  <div style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 16 }}>
                    📍 {a.location as string}
                  </div>
                )}
                <Link href={`/admin/artisans/${a.slug}`} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
                  Edit profile
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
