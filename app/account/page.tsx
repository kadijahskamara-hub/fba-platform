import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const metadata = { title: 'My Account' }

export default async function AccountPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/account')

  // Fetch project count and recent activity
  const [{ count: projectCount }, { count: savedItems }] = await Promise.all([
    supabaseAdmin.from('projects').select('*', { count: 'exact', head: true }).eq('user_id', session.id),
    supabaseAdmin.from('project_items')
      .select('project_id, projects!inner(user_id)', { count: 'exact', head: true })
      .eq('projects.user_id', session.id),
  ])

  const isTradeUser  = session.role === 'trade_user'
  const isApplicant  = session.role === 'trade_applicant'
  const isAdmin      = ['admin', 'staff'].includes(session.role)

  const roleLabel: Record<string, string> = {
    retail_customer: 'Retail Account',
    trade_applicant: 'Trade Applicant',
    trade_user:      'Approved Trade Member',
    admin:           'Administrator',
    staff:           'Staff',
  }

  return (
    <div className="page-body">
      {/* Hero */}
      <div className="page-hero" style={{ paddingTop: 'calc(var(--nav-h) + 60px)', paddingBottom: 60 }}>
        <div className="page-hero-inner">
          <div className="label page-hero-label">Account</div>
          <h1 className="page-hero-title">
            {session.firstName ? `Hello, ${session.firstName}.` : 'My Account'}
          </h1>
          <p className="page-hero-desc">
            {roleLabel[session.role] ?? session.role}
          </p>
        </div>
      </div>

      <div className="section">
        <div className="container">

          {/* Trade status banner */}
          {isApplicant && (
            <div style={{
              background: 'var(--cream)',
              border: '1px solid var(--light-line)',
              borderLeft: '4px solid #856404',
              padding: '20px 24px',
              marginBottom: 32,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Trade application pending</div>
                <p style={{ fontSize: 13, color: 'var(--stone)' }}>
                  Your trade application is under review. We'll be in touch within 3–5 business days.
                </p>
              </div>
              <Link href="/trade/apply" className="btn btn-secondary btn-sm">
                Check status
              </Link>
            </div>
          )}

          {isTradeUser && (
            <div style={{
              background: 'var(--forest)',
              padding: '20px 24px',
              marginBottom: 32,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--cream)', marginBottom: 4 }}>
                  ✓ Trade access active
                </div>
                <p style={{ fontSize: 13, color: 'rgba(247,243,238,0.6)' }}>
                  You have access to trade pricing, project tools and priority sourcing.
                </p>
              </div>
              <Link href="/products" style={{
                fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--sand)', textDecoration: 'none',
              }}>
                Browse the Edit →
              </Link>
            </div>
          )}

          {/* Account cards grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20, marginBottom: 48 }}>

            {/* My Projects */}
            <Link href="/account/projects" style={{ textDecoration: 'none' }}>
              <div className="card hover-lift" style={{ height: '100%' }}
              >
                <div style={{ height: 4, background: 'var(--forest)' }} />
                <div className="card-body">
                  <div style={{ fontSize: 28, marginBottom: 16 }}>📁</div>
                  <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 300, marginBottom: 8 }}>
                    My Projects
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 16 }}>
                    {projectCount ?? 0} project folder{projectCount !== 1 ? 's' : ''} ·{' '}
                    {savedItems ?? 0} piece{savedItems !== 1 ? 's' : ''} saved
                  </p>
                  <span style={{ fontSize: 12, color: 'var(--caramel)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    View projects →
                  </span>
                </div>
              </div>
            </Link>

            {/* Browse products */}
            <Link href="/products" style={{ textDecoration: 'none' }}>
              <div className="card hover-lift" style={{ height: '100%' }}
              >
                <div style={{ height: 4, background: 'var(--caramel)' }} />
                <div className="card-body">
                  <div style={{ fontSize: 28, marginBottom: 16 }}>🪑</div>
                  <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 300, marginBottom: 8 }}>
                    Browse the Edit
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 16 }}>
                    {isTradeUser
                      ? 'Explore the catalogue with your trade pricing active.'
                      : 'Discover curated furniture, lighting and objects.'}
                  </p>
                  <span style={{ fontSize: 12, color: 'var(--caramel)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Browse now →
                  </span>
                </div>
              </div>
            </Link>

            {/* Trade access — only show for retail/guest */}
            {!isTradeUser && !isApplicant && !isAdmin && (
              <Link href="/trade/apply" style={{ textDecoration: 'none' }}>
                <div className="card hover-lift" style={{ height: '100%' }}
                >
                  <div style={{ height: 4, background: 'var(--sage)' }} />
                  <div className="card-body">
                    <div style={{ fontSize: 28, marginBottom: 16 }}>🔑</div>
                    <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 300, marginBottom: 8 }}>
                      Apply for Trade Access
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 16 }}>
                      Interior designers, architects and developers can apply for trade pricing and sourcing tools.
                    </p>
                    <span style={{ fontSize: 12, color: 'var(--caramel)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Apply now →
                    </span>
                  </div>
                </div>
              </Link>
            )}

            {/* Admin shortcut */}
            {isAdmin && (
              <Link href="/admin/dashboard" style={{ textDecoration: 'none' }}>
                <div className="card hover-lift" style={{ height: '100%', background: 'var(--forest)' }}
                >
                  <div style={{ height: 4, background: 'var(--sand)' }} />
                  <div className="card-body">
                    <div style={{ fontSize: 28, marginBottom: 16 }}>⚙️</div>
                    <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 300, marginBottom: 8, color: 'var(--cream)' }}>
                      Admin Dashboard
                    </h3>
                    <p style={{ fontSize: 13, color: 'rgba(247,243,238,0.6)', marginBottom: 16 }}>
                      Manage products, trade applications, orders and studio settings.
                    </p>
                    <span style={{ fontSize: 12, color: 'var(--sand)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Go to admin →
                    </span>
                  </div>
                </div>
              </Link>
            )}
          </div>

          {/* Account details */}
          <div style={{
            background: 'var(--warm-white)',
            border: '1px solid var(--light-line)',
            padding: 32,
            maxWidth: 560,
          }}>
            <h2 className="h4" style={{ marginBottom: 24 }}>Account details</h2>
            <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '12px 0', fontSize: 14 }}>
              <dt style={{ color: 'var(--stone)' }}>Name</dt>
              <dd>{session.firstName} {session.lastName}</dd>
              <dt style={{ color: 'var(--stone)' }}>Email</dt>
              <dd>{session.email}</dd>
              <dt style={{ color: 'var(--stone)' }}>Account type</dt>
              <dd>{roleLabel[session.role] ?? session.role}</dd>
            </dl>
            <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--light-line)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link href="/account/change-password" className="btn btn-secondary btn-sm">
                Change password
              </Link>
              <form action="/api/auth/logout" method="POST">
                <button type="submit" className="btn btn-secondary btn-sm">
                  Sign out
                </button>
              </form>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
