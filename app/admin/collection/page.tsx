import Link from 'next/link'
import Image from 'next/image'
import { supabaseAdmin } from '@/lib/supabase'

export const metadata = { title: 'FBA Collection' }

async function getCollectionProducts() {
  const { data } = await supabaseAdmin
    .from('products')
    .select(`
      id, name, slug, images, visibility, retail_price, trade_price, price_type, currency,
      artisan:artisans(name),
      category:categories(name)
    `)
    .eq('is_fba_collection', true)
    .order('created_at', { ascending: false })
  return data ?? []
}

export default async function AdminCollectionPage() {
  const products = await getCollectionProducts()

  const published = products.filter((p: Record<string, unknown>) => p.visibility === 'published').length
  const draft     = products.filter((p: Record<string, unknown>) => p.visibility === 'draft').length

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">FBA Collection</h1>
          <p className="admin-subtitle">
            Pieces marked as FBA Collection — {published} published, {draft} draft
          </p>
        </div>
        <Link href="/admin/products/new" className="btn btn-primary btn-sm">
          + Add Collection Piece
        </Link>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total Pieces',   value: products.length, colour: 'var(--forest)' },
          { label: 'Published',      value: published,       colour: '#155724' },
          { label: 'Draft / Hidden', value: draft,           colour: 'var(--stone)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value" style={{ color: s.colour }}>{s.value}</div>
          </div>
        ))}
      </div>

      {products.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9,22 9,12 15,12 15,22"/>
          </svg>
          <h3>No collection pieces yet</h3>
          <p>Add products and mark them as FBA Collection pieces.</p>
          <Link href="/admin/products/new" className="btn btn-primary btn-sm" style={{ marginTop: 24 }}>
            Add First Piece
          </Link>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 20,
        }}>
          {products.map((p: Record<string, unknown>) => (
            <div
              key={p.id as string}
              style={{
                background: 'var(--warm-white)',
                border: '1px solid var(--light-line)',
                overflow: 'hidden',
              }}
            >
              {/* Image */}
              <div style={{ height: 200, position: 'relative', background: 'var(--sage-light)' }}>
                {(p.images as string[])?.[0] ? (
                  <Image
                    src={(p.images as string[])[0]}
                    alt={p.name as string}
                    fill
                    style={{ objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--stone)', letterSpacing: '0.1em' }}>
                      No image
                    </span>
                  </div>
                )}
                <div style={{ position: 'absolute', top: 8, right: 8 }}>
                  <span className={`status-pill status-${p.visibility}`}>
                    {p.visibility as string}
                  </span>
                </div>
              </div>

              {/* Meta */}
              <div style={{ padding: '16px 16px 20px' }}>
                <div className="label label-sage" style={{ marginBottom: 4 }}>
                  {(p.category as Record<string, string> | null)?.name ?? '—'}
                </div>
                <h3 style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 16,
                  fontWeight: 300,
                  color: 'var(--forest)',
                  marginBottom: 4,
                  lineHeight: 1.35,
                }}>
                  {p.name as string}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 12 }}>
                  by {(p.artisan as Record<string, string> | null)?.name ?? 'Unknown'}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link
                    href={`/admin/products/${p.slug}`}
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1, textAlign: 'center' }}
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/products/${p.slug}`}
                    target="_blank"
                    className="btn btn-ghost btn-sm"
                    style={{ flex: 1, textAlign: 'center' }}
                  >
                    View ↗
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
