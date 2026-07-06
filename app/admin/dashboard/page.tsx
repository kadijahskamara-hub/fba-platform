import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'

export const metadata = { title: 'Dashboard' }

async function getMetrics() {
  const [
    { count: totalApps },
    { count: pendingApps },
    { count: approvedTrade },
    { count: openQuotes },
    { count: totalProducts },
    { count: totalContacts },
    { data: recentApps },
    { count: missingImages },
    { count: missingLeadTime },
    { count: missingSpecDoc },
    { count: lowCompleteness },
    { count: draftProducts },
    { count: archivedProducts },
    { count: importedThisWeek },
  ] = await Promise.all([
    supabaseAdmin.from('trade_applications').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('trade_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('role', 'trade_user'),
    supabaseAdmin.from('quote_requests').select('*', { count: 'exact', head: true }).eq('status', 'new'),
    supabaseAdmin.from('products').select('*', { count: 'exact', head: true }).eq('visibility', 'published').is('archived_at', null).is('deleted_at', null),
    supabaseAdmin.from('contacts').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('trade_applications')
      .select('id, company_name, status, created_at, user:users(first_name, last_name, email)')
      .order('created_at', { ascending: false })
      .limit(5),
    // Product data health (product_health view)
    supabaseAdmin.from('product_health').select('*', { count: 'exact', head: true }).is('archived_at', null).is('deleted_at', null).eq('image_count', 0),
    supabaseAdmin.from('product_health').select('*', { count: 'exact', head: true }).is('archived_at', null).is('deleted_at', null).eq('has_lead_time', false),
    supabaseAdmin.from('product_health').select('*', { count: 'exact', head: true }).is('archived_at', null).is('deleted_at', null).eq('has_spec_doc', false),
    supabaseAdmin.from('product_health').select('*', { count: 'exact', head: true }).is('archived_at', null).is('deleted_at', null).lt('completeness', 80),
    supabaseAdmin.from('products').select('*', { count: 'exact', head: true }).eq('visibility', 'draft').is('archived_at', null),
    supabaseAdmin.from('products').select('*', { count: 'exact', head: true }).not('archived_at', 'is', null),
    supabaseAdmin.from('products').select('*', { count: 'exact', head: true }).gte('last_imported_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
  ])

  return {
    totalApps, pendingApps, approvedTrade, openQuotes, totalProducts, totalContacts, recentApps,
    missingImages, missingLeadTime, missingSpecDoc, lowCompleteness,
    draftProducts, archivedProducts, importedThisWeek,
  }
}

interface Props {
  searchParams: { error?: string }
}

export default async function AdminDashboardPage({ searchParams }: Props) {
  const m = await getMetrics()

  const statCards = [
    { label: 'Trade Applications', value: m.totalApps ?? 0,    link: '/admin/trade-applications', colour: 'var(--forest)' },
    { label: 'Pending Review',     value: m.pendingApps ?? 0,  link: '/admin/trade-applications?status=pending', colour: '#856404' },
    { label: 'Approved Trade Users', value: m.approvedTrade ?? 0, link: '/admin/trade-applications?status=approved', colour: '#155724' },
    { label: 'Open Quotes',        value: m.openQuotes ?? 0,   link: '/admin/quotes', colour: '#004085' },
    { label: 'Published Products', value: m.totalProducts ?? 0, link: '/admin/products', colour: 'var(--caramel)' },
    { label: 'Total Contacts',     value: m.totalContacts ?? 0, link: '/admin/contacts', colour: 'var(--stone)' },
  ]

  return (
    <>
      {/* Access-denied notice (shown when redirected from a gated route) */}
      {searchParams.error === 'no_settings_access' && (
        <div style={{
          background: '#FFF3CD', border: '1px solid #FFEAA7',
          color: '#856404', padding: '12px 20px', marginBottom: 24,
          fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          You don&rsquo;t have permission to access Studio Settings. Contact your admin to have this permission granted.
        </div>
      )}

      <div className="admin-header">
        <div>
          <h1 className="admin-title">Dashboard</h1>
          <p className="admin-subtitle">Business overview — {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <Link href="/admin/products/new" className="btn btn-primary btn-sm">
          + Add Product
        </Link>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 40 }}>
        {statCards.map(s => (
          <Link key={s.label} href={s.link} style={{ textDecoration: 'none' }}>
            <div className="stat-card hover-lift-sm">
              <div className="stat-card-label">{s.label}</div>
              <div className="stat-card-value" style={{ color: s.colour, fontSize: 44 }}>{s.value}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Product data health */}
      <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 28, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 className="h3">Product Data Health</h2>
          <Link href="/admin/imports" style={{ fontSize: 12, color: 'var(--caramel)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Import history →
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {[
            { label: 'Missing images', value: m.missingImages ?? 0, link: '/admin/products?images=none', warn: true },
            { label: 'Missing lead times', value: m.missingLeadTime ?? 0, link: '/admin/products', warn: true },
            { label: 'Missing spec documents', value: m.missingSpecDoc ?? 0, link: '/admin/products', warn: true },
            { label: 'Completeness below 80%', value: m.lowCompleteness ?? 0, link: '/admin/products?completeness=low', warn: true },
            { label: 'Draft products', value: m.draftProducts ?? 0, link: '/admin/products?status=draft', warn: false },
            { label: 'Archived products', value: m.archivedProducts ?? 0, link: '/admin/products?status=archived', warn: false },
            { label: 'Imported this week', value: m.importedThisWeek ?? 0, link: '/admin/imports', warn: false },
          ].map(card => (
            <Link key={card.label} href={card.link} style={{ textDecoration: 'none' }}>
              <div style={{ border: '1px solid var(--light-line)', padding: '14px 16px', background: card.warn && (card.value as number) > 0 ? '#FFFBEB' : 'var(--cream)' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: card.warn && (card.value as number) > 0 ? '#B45309' : 'var(--forest)' }}>
                  {card.value}
                </div>
                <div style={{ fontSize: 11, color: 'var(--stone)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>

        {/* Recent trade applications */}
        <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h2 className="h3">Recent Applications</h2>
            <Link href="/admin/trade-applications" style={{ fontSize: 12, color: 'var(--caramel)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              View all →
            </Link>
          </div>
          {!m.recentApps?.length ? (
            <p style={{ fontSize: 14, color: 'var(--stone)' }}>No applications yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {m.recentApps.map((a: Record<string, unknown>) => (
                  <tr key={a.id as string}>
                    <td style={{ fontSize: 13 }}>
                      {(a.user as Record<string,string> | null)?.first_name} {(a.user as Record<string,string> | null)?.last_name}
                    </td>
                    <td style={{ fontSize: 13 }}>{a.company_name as string}</td>
                    <td>
                      <span className={`status-pill status-${a.status}`}>
                        {(a.status as string).replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--stone)' }}>
                      {new Date(a.created_at as string).toLocaleDateString('en-GB')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', padding: 28 }}>
            <h3 className="h4" style={{ marginBottom: 20 }}>Quick Actions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link href="/admin/products/new" className="btn btn-primary btn-sm btn-full">Add Product</Link>
              <Link href="/admin/artisans/new" className="btn btn-secondary btn-sm btn-full">Add Artisan</Link>
              <Link href="/admin/trade-applications" className="btn btn-secondary btn-sm btn-full">Review Applications</Link>
              <Link href="/admin/journals/new" className="btn btn-secondary btn-sm btn-full">Write Journal Post</Link>
            </div>
          </div>

          <div style={{ background: 'var(--forest)', padding: 28, color: 'var(--cream)' }}>
            <div className="label" style={{ color: 'rgba(196,168,130,0.7)', marginBottom: 12 }}>Pending action</div>
            <div style={{ fontSize: 28, fontFamily: 'var(--font-serif)', fontWeight: 300, marginBottom: 8 }}>
              {m.pendingApps ?? 0}
            </div>
            <p style={{ fontSize: 13, color: 'rgba(247,243,238,0.6)', marginBottom: 20 }}>
              Trade applications awaiting review
            </p>
            <Link href="/admin/trade-applications?status=pending"
              style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--sand)', display: 'inline-block' }}>
              Review now →
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
