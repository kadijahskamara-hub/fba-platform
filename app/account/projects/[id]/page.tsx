import { redirect, notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { resolvePrice } from '@/lib/pricing'
import { RemoveItemButton, RequestQuoteButton, ExportScheduleButton } from './ProjectActions'

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login?next=/account/projects')

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', session.id)
    .single()

  if (!project) notFound()

  const { data: items } = await supabaseAdmin
    .from('project_items')
    .select(`
      *,
      product:products(
        id, name, slug, images, short_description,
        retail_price, trade_price, price_type, currency,
        artisan:artisans(name, slug),
        category:categories(name)
      )
    `)
    .eq('project_id', params.id)
    .order('created_at')

  return (
    <div className="page-body">
      <div className="page-hero" style={{ paddingTop: 'calc(var(--nav-h) + 60px)', paddingBottom: 60 }}>
        <div className="page-hero-inner">
          <div style={{ marginBottom: 12 }}>
            <Link href="/account/projects" style={{ fontSize: 12, color: 'rgba(196,168,130,0.7)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              ← My Projects
            </Link>
          </div>
          <h1 className="page-hero-title">{project.name}</h1>
          <p className="page-hero-desc" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {project.location && <span>📍 {project.location}</span>}
            {project.budget   && <span>Budget: £{Number(project.budget).toLocaleString()}</span>}
            <span>{items?.length ?? 0} piece{items?.length !== 1 ? 's' : ''} saved</span>
          </p>
        </div>
      </div>

      <div className="section">
        <div className="container">

          {/* Actions row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 40 }}>
            <RequestQuoteButton projectId={project.id} />
            <ExportScheduleButton projectName={project.name} />
          </div>

          {!items?.length ? (
            <div className="empty-state">
              <h3>No items yet</h3>
              <p>Browse the Edit and save pieces to this project.</p>
              <div style={{ marginTop: 24 }}>
                <Link href="/products" className="btn btn-primary">Browse the Edit</Link>
              </div>
            </div>
          ) : (
            <div>
              {/* Items table */}
              <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Artisan</th>
                      <th>Price</th>
                      <th>Qty</th>
                      <th>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: Record<string, unknown>) => {
                      const prod = item.product as Record<string,unknown>
                      const priceD = resolvePrice(prod as Parameters<typeof resolvePrice>[0], session)
                      const unitAmt = priceD.type === 'fixed' ? priceD.amount : null
                      const qty     = item.quantity as number
                      const total   = unitAmt ? unitAmt * qty : null

                      return (
                        <tr key={item.id as string}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                              <div style={{ width: 56, height: 56, flexShrink: 0, overflow: 'hidden', position: 'relative', background: 'var(--sage-light)' }}>
                                {(prod.images as string[])?.[0] && (
                                  <Image src={(prod.images as string[])[0]} alt={prod.name as string} fill style={{ objectFit: 'cover' }} />
                                )}
                              </div>
                              <div>
                                <Link href={`/products/${prod.slug}`} style={{ fontWeight: 500, fontSize: 14, color: 'var(--forest)' }}>
                                  {prod.name as string}
                                </Link>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontSize: 13, color: 'var(--stone)' }}>
                            {(prod.category as Record<string,string> | null)?.name ?? '—'}
                          </td>
                          <td style={{ fontSize: 13, color: 'var(--stone)' }}>
                            {(prod.artisan as Record<string,string> | null)?.name ?? '—'}
                          </td>
                          <td>
                            {priceD.type === 'fixed' ? priceD.label : (
                              <span style={{ fontStyle: 'italic', color: 'var(--stone)', fontSize: 12 }}>POR</span>
                            )}
                          </td>
                          <td style={{ fontSize: 14 }}>{qty}</td>
                          <td style={{ fontWeight: 500 }}>
                            {total ? `£${total.toLocaleString()}` : '—'}
                          </td>
                          <td>
                            <RemoveItemButton projectId={project.id} itemId={item.id as string} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Notes */}
              {project.notes && (
                <div style={{ marginTop: 32, padding: 24, background: 'var(--cream)', border: '1px solid var(--light-line)' }}>
                  <div className="label label-sage" style={{ marginBottom: 8 }}>Project Notes</div>
                  <p style={{ fontSize: 14, color: 'var(--stone)', lineHeight: 1.7 }}>{project.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
