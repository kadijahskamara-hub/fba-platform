import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import type { BrandIntegration } from '@/lib/syncEngine'

export const metadata = { title: 'Brand Integrations' }

const SOURCE_LABELS: Record<string, string> = {
  shopify:     'Shopify',
  woocommerce: 'WooCommerce',
  rest_api:    'REST API',
  csv_url:     'CSV Feed URL',
  manual_csv:  'Manual CSV Upload',
}

const STATUS_COLOURS: Record<string, string> = {
  success: '#155724',
  partial: '#856404',
  error:   '#721c24',
}

export default async function IntegrationsPage() {
  const { data: integrations } = await supabaseAdmin
    .from('brand_integrations').select('*').order('brand_name')

  const list = (integrations ?? []) as BrandIntegration[]

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Brand Integrations</h1>
          <p className="admin-subtitle">Connect brand APIs and CSV feeds — imported products land as drafts for your curation review.</p>
        </div>
        <Link href="/admin/integrations/new" className="btn btn-primary btn-sm">+ Add Integration</Link>
      </div>

      {!list.length ? (
        <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: '64px 48px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 300, color: 'var(--forest)', marginBottom: 12 }}>
            No integrations yet
          </div>
          <p style={{ fontSize: 14, color: 'var(--stone)', marginBottom: 32, maxWidth: 480, margin: '0 auto 32px' }}>
            Add your first brand integration to start auto-ingesting products. Each imported product lands as a draft — you approve what goes live.
          </p>
          <Link href="/admin/integrations/new" className="btn btn-primary">Add your first integration</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--light-line)' }}>
          {list.map(intg => (
            <div key={intg.id} style={{
              background: 'var(--warm-white)',
              padding: '24px 28px',
              display: 'grid',
              gridTemplateColumns: '1fr auto auto auto',
              gap: 24,
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontWeight: 500, color: 'var(--forest)', marginBottom: 4 }}>{intg.brand_name}</div>
                <div style={{ fontSize: 12, color: 'var(--stone)', display: 'flex', gap: 16 }}>
                  <span>{SOURCE_LABELS[intg.source_type] ?? intg.source_type}</span>
                  {intg.api_endpoint && (
                    <span style={{ color: 'var(--sage)' }}>{intg.api_endpoint.replace(/^https?:\/\//, '').slice(0, 50)}</span>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'var(--stone)' }}>
                  {intg.products_imported} imported
                </div>
                {intg.last_synced_at && (
                  <div style={{ fontSize: 11, color: 'var(--stone)', marginTop: 2 }}>
                    Last synced {new Date(intg.last_synced_at).toLocaleDateString('en-GB')}
                  </div>
                )}
                {intg.last_sync_status && (
                  <div style={{ fontSize: 11, color: STATUS_COLOURS[intg.last_sync_status] ?? 'var(--stone)', marginTop: 2 }}>
                    {intg.last_sync_status}
                  </div>
                )}
              </div>

              <div>
                <span style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  background: intg.sync_enabled ? 'rgba(21,87,36,0.08)' : 'rgba(0,0,0,0.05)',
                  color: intg.sync_enabled ? '#155724' : 'var(--stone)',
                }}>
                  {intg.sync_enabled ? intg.sync_frequency : 'manual only'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <Link href={`/admin/integrations/${intg.id}`} className="btn btn-secondary btn-sm">Edit</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 40, background: 'var(--forest)', padding: 28, color: 'var(--cream)' }}>
        <div className="label" style={{ color: 'rgba(196,168,130,0.7)', marginBottom: 12 }}>How it works</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
          {[
            { n: '01', t: 'Connect', d: 'Add a brand API endpoint or CSV feed with credentials. Supports Shopify, WooCommerce, custom REST, and CSV.' },
            { n: '02', t: 'Map fields', d: 'Configure which source fields map to FBA fields — title, description, price, images, lead time, origin.' },
            { n: '03', t: 'Curate & publish', d: 'Every import lands as a draft. Your team reviews, enriches, and publishes only what meets the FBA standard.' },
          ].map(s => (
            <div key={s.n}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'rgba(196,168,130,0.4)', marginBottom: 8 }}>{s.n}</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, marginBottom: 8 }}>{s.t}</div>
              <p style={{ fontSize: 13, color: 'rgba(247,243,238,0.6)', lineHeight: 1.7 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
