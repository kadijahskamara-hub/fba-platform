import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Products' }

export default async function AdminProductsPage() {
  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, name, slug, visibility, audience, retail_price, trade_price, price_type, category:categories(name), created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Products</h1>
          <p className="admin-subtitle">{products?.length ?? 0} products total</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/products/import" className="btn btn-ghost btn-sm">
            ↑ Import from Drive
          </Link>
          <Link href="/admin/products/new" className="btn btn-primary btn-sm">
            + Add Product
          </Link>
        </div>
      </div>

      {!products?.length ? (
        <div className="empty-state">
          <h3>No products yet</h3>
          <p>Add your first product to the catalogue.</p>
        </div>
      ) : (
        <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Retail price</th>
                <th>Trade price</th>
                <th>Audience</th>
                <th>Status</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p: Record<string,unknown>) => (
                <tr key={p.id as string}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{p.name as string}</div>
                    <div style={{ fontSize: 11, color: 'var(--stone)' }}>{p.slug as string}</div>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--stone)' }}>
                    {(p.category as Record<string,string> | null)?.name ?? '—'}
                  </td>
                  <td>
                    {p.price_type === 'price_on_request' ? (
                      <span style={{ fontStyle: 'italic', color: 'var(--stone)', fontSize: 12 }}>POR</span>
                    ) : p.retail_price ? (
                      <span>£{Number(p.retail_price).toLocaleString()}</span>
                    ) : '—'}
                  </td>
                  <td>
                    {p.trade_price ? (
                      <span style={{ color: 'var(--caramel)' }}>£{Number(p.trade_price).toLocaleString()}</span>
                    ) : '—'}
                  </td>
                  <td>
                    <span className="badge badge-sage" style={{ fontSize: 10 }}>
                      {(p.audience as string).replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill status-${p.visibility}`}>
                      {p.visibility as string}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--stone)' }}>
                    {new Date(p.created_at as string).toLocaleDateString('en-GB')}
                  </td>
                  <td>
                    <Link href={`/admin/products/${p.slug}`} className="btn btn-ghost btn-sm">Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
