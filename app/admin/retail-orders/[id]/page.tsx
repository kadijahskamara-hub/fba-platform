import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { OrderStatusActions } from './OrderStatusActions'

interface Props { params: { id: string } }

const STATUS_COLOURS: Record<string, string> = {
  pending:    'status-pending',
  paid:       'status-approved',
  processing: 'status-form-sent',
  shipped:    'status-review',
  completed:  'status-approved',
  cancelled:  'status-declined',
  refunded:   'status-revoked',
}

const STATUS_TIMELINE = ['pending', 'paid', 'processing', 'shipped', 'completed']

async function getOrder(id: string) {
  const { data } = await supabaseAdmin
    .from('retail_orders')
    .select(`
      id, order_number, status, total_amount, currency,
      shipping_name, shipping_addr, tracking_number, shipped_at,
      stripe_pi_id, notes, created_at, updated_at,
      user:users(id, first_name, last_name, email, phone),
      items:retail_order_items(
        id, product_name, quantity, unit_price, total_price,
        product:products(slug, images)
      )
    `)
    .eq('id', id)
    .single()
  return data
}

export default async function AdminOrderDetailPage({ params }: Props) {
  const order = await getOrder(params.id)
  if (!order) notFound()

  const user    = (order.user as unknown) as Record<string, string> | null
  const items   = order.items as Array<Record<string, unknown>> ?? []
  const sym     = order.currency === 'EUR' ? '€' : order.currency === 'USD' ? '$' : '£'
  const statusIdx = STATUS_TIMELINE.indexOf(order.status as string)

  return (
    <>
      {/* Header */}
      <div className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/admin/retail-orders" style={{ fontSize: 13, color: 'var(--stone)', textDecoration: 'none' }}>
            ← Orders
          </Link>
          <h1 className="admin-title" style={{ margin: 0 }}>#{order.order_number}</h1>
          <span className={`status-pill ${STATUS_COLOURS[order.status as string] ?? 'status-pending'}`}>
            {(order.status as string).replace('_', ' ')}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--stone)' }}>
          {new Date(order.created_at as string).toLocaleString('en-GB')}
        </div>
      </div>

      {/* Status timeline */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        background: 'var(--warm-white)', border: '1px solid var(--light-line)',
        padding: '20px 24px', marginBottom: 32, overflowX: 'auto',
      }}>
        {STATUS_TIMELINE.map((s, i) => {
          const done    = i <= statusIdx
          const current = i === statusIdx
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STATUS_TIMELINE.length - 1 ? 1 : 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: done ? 'var(--forest)' : 'var(--light-line)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: current ? '2px solid var(--caramel)' : 'none',
                }}>
                  {done && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                         stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span style={{
                  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: done ? 'var(--forest)' : 'var(--stone)',
                  fontWeight: current ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}>
                  {s}
                </span>
              </div>
              {i < STATUS_TIMELINE.length - 1 && (
                <div style={{
                  flex: 1, height: 2, minWidth: 32,
                  background: i < statusIdx ? 'var(--forest)' : 'var(--light-line)',
                  margin: '0 4px', marginBottom: 22,
                }} />
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Line items */}
          <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 24 }}>
            <h3 className="h4" style={{ marginBottom: 20 }}>Items</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ textAlign: 'center' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id as string}>
                    <td style={{ fontWeight: 500, fontSize: 14 }}>{item.product_name as string}</td>
                    <td style={{ textAlign: 'center' }}>{item.quantity as number}</td>
                    <td style={{ textAlign: 'right' }}>
                      {sym}{Number(item.unit_price).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>
                      {sym}{Number(item.total_price).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600, paddingTop: 16, borderTop: '2px solid var(--light-line)' }}>
                    Order total
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, paddingTop: 16, borderTop: '2px solid var(--light-line)', fontSize: 16 }}>
                    {sym}{Number(order.total_amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Shipping info */}
          <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 24 }}>
            <h3 className="h4" style={{ marginBottom: 16 }}>Shipping</h3>
            <div style={{ fontSize: 14, lineHeight: 1.8 }}>
              {order.shipping_name && (
                <div style={{ fontWeight: 500, marginBottom: 4 }}>{order.shipping_name as string}</div>
              )}
              {order.shipping_addr && (
                <div style={{ color: 'var(--stone)', fontSize: 13 }}>{order.shipping_addr as string}</div>
              )}
              {order.tracking_number && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--sage-light)', display: 'inline-block' }}>
                  <span style={{ fontSize: 11, color: 'var(--stone)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Tracking:
                  </span>{' '}
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{order.tracking_number as string}</span>
                </div>
              )}
              {order.shipped_at && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--stone)' }}>
                  Shipped {new Date(order.shipped_at as string).toLocaleString('en-GB')}
                </div>
              )}
            </div>
          </div>

          {/* Stripe reference */}
          {order.stripe_pi_id && (
            <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 20 }}>
              <span style={{ fontSize: 11, color: 'var(--stone)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Stripe payment intent
              </span>
              <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--forest)', marginTop: 4 }}>
                {order.stripe_pi_id as string}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Customer */}
          <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 24 }}>
            <h3 className="h4" style={{ marginBottom: 16 }}>Customer</h3>
            {user ? (
              <div style={{ fontSize: 14, lineHeight: 1.8 }}>
                <div style={{ fontWeight: 500 }}>{user.first_name} {user.last_name}</div>
                <div style={{ color: 'var(--stone)', fontSize: 13 }}>{user.email}</div>
                {user.phone && (
                  <div style={{ color: 'var(--stone)', fontSize: 13 }}>{user.phone}</div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--stone)' }}>Guest order</p>
            )}
          </div>

          {/* Actions */}
          <OrderStatusActions
            orderId={params.id}
            currentStatus={order.status as string}
            trackingNumber={order.tracking_number as string | null}
          />

        </div>
      </div>
    </>
  )
}
