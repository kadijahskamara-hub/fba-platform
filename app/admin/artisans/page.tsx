import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import ArtisansIndex, { type ArtisanRow } from './ArtisansIndex'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Artisans' }

// Final amendments §3: management-oriented index — bulk selection,
// publish/hide/archive/delete, search, filters, sort, table/card views.

export default async function AdminArtisansPage() {
  const session = await getSession()
  const isAdmin = session?.role === 'admin'

  const [{ data: artisans }, { data: productRefs }] = await Promise.all([
    supabaseAdmin
      .from('artisans')
      .select('id, name, slug, location, craft_category, profile_image, is_active, archived_at, created_at')
      .order('name'),
    supabaseAdmin.from('products').select('artisan_id').not('artisan_id', 'is', null),
  ])

  const counts = new Map<string, number>()
  for (const r of (productRefs ?? []) as Array<{ artisan_id: string }>) {
    counts.set(r.artisan_id, (counts.get(r.artisan_id) ?? 0) + 1)
  }

  const rows: ArtisanRow[] = (artisans ?? []).map((a: Record<string, unknown>) => ({
    id: a.id as string,
    name: a.name as string,
    slug: a.slug as string,
    location: (a.location as string | null) ?? null,
    craft_category: (a.craft_category as string | null) ?? null,
    profile_image: (a.profile_image as string | null) ?? null,
    is_active: a.is_active === true,
    archived_at: (a.archived_at as string | null) ?? null,
    created_at: a.created_at as string,
    product_count: counts.get(a.id as string) ?? 0,
  }))

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Artisans</h1>
          <p className="admin-subtitle">{rows.length} artisan studio{rows.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/admin/artisans/new" className="btn btn-primary btn-sm">
          + Add Artisan
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <h3>No artisans yet</h3>
          <p>Add your first artisan or studio to start linking products.</p>
          <div style={{ marginTop: 24 }}>
            <Link href="/admin/artisans/new" className="btn btn-primary btn-sm">Add Artisan</Link>
          </div>
        </div>
      ) : (
        <ArtisansIndex artisans={rows} isAdmin={isAdmin} />
      )}
    </>
  )
}
