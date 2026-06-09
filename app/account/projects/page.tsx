import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const metadata = { title: 'My Projects' }

export default async function MyProjectsPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/account/projects')

  const { data: projects } = await supabaseAdmin
    .from('projects')
    .select(`
      *,
      items:project_items(id, product_id)
    `)
    .eq('user_id', session.id)
    .order('updated_at', { ascending: false })

  return (
    <div className="page-body">
      <div className="page-hero" style={{ paddingTop: 'calc(var(--nav-h) + 60px)', paddingBottom: 60 }}>
        <div className="page-hero-inner">
          <div className="label page-hero-label">My Account</div>
          <h1 className="page-hero-title">My Projects</h1>
          <p className="page-hero-desc">Your saved FF&amp;E schedules and product shortlists.</p>
        </div>
      </div>

      <div className="section">
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
            <p style={{ fontSize: 14, color: 'var(--stone)' }}>
              {projects?.length ?? 0} project{projects?.length !== 1 ? 's' : ''}
            </p>
            <Link href="/account/projects/new" className="btn btn-primary btn-sm">
              + New Project
            </Link>
          </div>

          {!projects?.length ? (
            <div className="empty-state">
              <h3>No projects yet</h3>
              <p>Browse the Edit and save pieces to start building your first project folder.</p>
              <div style={{ marginTop: 24 }}>
                <Link href="/products" className="btn btn-primary">Browse the Edit</Link>
              </div>
            </div>
          ) : (
            <div className="grid-3">
              {projects.map((p: Record<string, unknown>) => (
                <Link key={p.id as string} href={`/account/projects/${p.id}`}
                  style={{ display: 'block', textDecoration: 'none' }}>
                  <div className="card hover-lift" style={{ cursor: 'pointer' }}>
                    {/* Colour strip */}
                    <div style={{ height: 4, background: 'var(--forest)' }} />
                    <div className="card-body">
                      <div className="label label-sage" style={{ marginBottom: 10 }}>
                        {(p.items as unknown[])?.length ?? 0} piece{(p.items as unknown[])?.length !== 1 ? 's' : ''}
                      </div>
                      <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 300, marginBottom: 6 }}>
                        {p.name as string}
                      </h3>
                      {!!p.location && (
                        <p style={{ fontSize: 12, color: 'var(--stone)', marginBottom: 10 }}>📍 {p.location as string}</p>
                      )}
                      {!!p.budget && (
                        <p style={{ fontSize: 12, color: 'var(--stone)' }}>
                          Budget: £{Number(p.budget).toLocaleString()}
                        </p>
                      )}
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--light-line)', fontSize: 11, color: 'var(--stone)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        Updated {new Date(p.updated_at as string).toLocaleDateString('en-GB')}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
