import { redirect, notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { resolvePrice, formatPrice, canSeeTradePricing } from '@/lib/pricing'
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
        visibility, archived_at, deleted_at,
        artisan:artisans(name, slug),
        category:categories(name)
      )
    `)
    .eq('project_id', params.id)
    .order('created_at')

  const showTrade = canSeeTradePricing(session)

  // Derive per-row pricing + a project subtotal. Unlisted (archived/
  // deleted/unpublished) products are kept visible but flagged, so a
  // saved project never breaks when a piece leaves the public catalogue.
  const rows = (items ?? []).map((item: Record<string, unknown>) => {
    const prod = (item.product ?? null) as Record<string, unknown> | null
    const missing  = !prod
    const unlisted = !!prod && (
      prod.archived_at != null || prod.deleted_at != null || prod.visibility !== 'published'
    )
    const priceD = prod ? resolvePrice(prod as Parameters<typeof resolvePrice>[0], session)
                        : { type: 'request' as const, label: 'Unavailable' }
    const qty     = (item.quantity as number) ?? 1
    const unitAmt = priceD.type === 'fixed' ? priceD.amount : null
    const total   = unitAmt != null ? unitAmt * qty : null
    return { item, prod, missing, unlisted, priceD, qty, total }
  })

  const currency  = (rows.find(r => r.priceD.type === 'fixed')?.priceD as { currency?: 'GBP' | 'EUR' | 'USD' } | undefined)?.currency ?? 'GBP'
  const subtotal  = rows.reduce((sum, r) => sum + (r.total ?? 0), 0)
  const porCount  = rows.filter(r => r.priceD.type !== 'fixed').length
  const budget    = project.budget != null ? Number(project.budget) : null
  const overBudget = budget != null && subtotal > budget

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
            <ExportScheduleButton />
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
                    {rows.map(({ item, prod, missing, unlisted, priceD, qty, total }) => (
                      <tr key={item.id as string}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ width: 56, height: 56, flexShrink: 0, overflow: 'hidden', position: 'relative', background: 'var(--sage-light)' }}>
                              {!missing && (prod!.images as string[])?.[0] && (
                                <Image src={(prod!.images as string[])[0]} alt={prod!.name as string} fill style={{ objectFit: 'cover' }} />
                              )}
                            </div>
                            <div>
                              {missing ? (
                                <span style={{ fontWeight: 500, fontSize: 14, color: 'var(--stone)' }}>Item no longer available</span>
                              ) : unlisted ? (
                                <>
                                  <span style={{ fontWeight: 500, fontSize: 14, color: 'var(--forest)' }}>{prod!.name as string}</span>
                                  <div style={{ fontSize: 11, color: 'var(--caramel)', marginTop: 2 }}>
                                    No longer publicly listed — contact FBA
                                  </div>
                                </>
                              ) : (
                                <Link href={`/products/${prod!.slug}`} style={{ fontWeight: 500, fontSize: 14, color: 'var(--forest)' }}>
                                  {prod!.name as string}
                                </Link>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--stone)' }}>
                          {(prod?.category as Record<string,string> | null)?.name ?? '—'}
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--stone)' }}>
                          {(prod?.artisan as Record<string,string> | null)?.name ?? '—'}
                        </td>
                        <td>
                          {priceD.type === 'fixed' ? priceD.label : (
                            <span style={{ fontStyle: 'italic', color: 'var(--stone)', fontSize: 12 }}>POR</span>
                          )}
                        </td>
                        <td style={{ fontSize: 14 }}>{qty}</td>
                        <td style={{ fontWeight: 500 }}>
                          {total != null ? formatPrice(total, currency) : '—'}
                        </td>
                        <td>
                          <RemoveItemButton projectId={project.id} itemId={item.id as string} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Budget summary */}
              <div style={{
                marginTop: 24, padding: '20px 24px', background: 'var(--cream)',
                border: '1px solid var(--light-line)', display: 'flex',
                justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16,
              }}>
                <div style={{ fontSize: 12, color: 'var(--stone)', lineHeight: 1.7, maxWidth: 460 }}>
                  {showTrade
                    ? 'Totals reflect your trade pricing.'
                    : 'Totals reflect indicative retail pricing. Trade pricing is available to approved trade accounts.'}
                  {porCount > 0 && (
                    <> {porCount} item{porCount !== 1 ? 's are' : ' is'} priced on request and not included in the subtotal — request a quote for a full figure.</>
                  )}
                </div>
                <div style={{ textAlign: 'right', minWidth: 200 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 32, fontSize: 14, marginBottom: budget != null ? 8 : 0 }}>
                    <span style={{ color: 'var(--stone)' }}>Subtotal{showTrade ? ' (trade)' : ''}</span>
                    <span style={{ fontWeight: 600, color: 'var(--forest)' }}>{formatPrice(subtotal, currency)}</span>
                  </div>
                  {budget != null && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 32, fontSize: 13, marginBottom: 8 }}>
                        <span style={{ color: 'var(--stone)' }}>Budget</span>
                        <span style={{ color: 'var(--stone)' }}>{formatPrice(budget, currency)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 32, fontSize: 13, paddingTop: 8, borderTop: '1px solid var(--light-line)' }}>
                        <span style={{ color: overBudget ? 'var(--danger)' : 'var(--forest)' }}>
                          {overBudget ? 'Over budget' : 'Remaining'}
                        </span>
                        <span style={{ fontWeight: 600, color: overBudget ? 'var(--danger)' : 'var(--forest)' }}>
                          {formatPrice(Math.abs(budget - subtotal), currency)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
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
