import Link from 'next/link'
import Image from 'next/image'
import { supabaseAdmin } from '@/lib/supabase'

export const metadata = { title: 'Journals' }

async function getJournalPosts() {
  const { data } = await supabaseAdmin
    .from('journal_posts')
    .select('id, title, slug, status, category, excerpt, featured_image, published_at, created_at')
    .order('created_at', { ascending: false })
  return data ?? []
}

export default async function AdminJournalsPage() {
  const posts = await getJournalPosts()
  const published = posts.filter((p: Record<string, unknown>) => p.status === 'published').length
  const draft     = posts.filter((p: Record<string, unknown>) => p.status === 'draft').length

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Journal</h1>
          <p className="admin-subtitle">{published} published · {draft} drafts</p>
        </div>
        <Link href="/admin/journals/new" className="btn btn-primary btn-sm">
          + New Post
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          <h3>No journal posts yet</h3>
          <p>Write your first post to share studio thinking and making.</p>
          <Link href="/admin/journals/new" className="btn btn-primary btn-sm" style={{ marginTop: 24 }}>
            Write First Post
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {posts.map((post: Record<string, unknown>) => (
            <div
              key={post.id as string}
              style={{
                background: 'var(--warm-white)',
                border: '1px solid var(--light-line)',
                display: 'grid',
                gridTemplateColumns: '80px 1fr auto',
                gap: 20,
                padding: '16px 20px',
                alignItems: 'center',
              }}
            >
              {/* Thumbnail */}
              <div style={{
                width: 80, height: 56,
                position: 'relative',
                background: 'var(--sage-light)',
                overflow: 'hidden',
                flexShrink: 0,
              }}>
                {post.featured_image ? (
                  <Image
                    src={post.featured_image as string}
                    alt={post.title as string}
                    fill
                    style={{ objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 9, color: 'var(--stone)', letterSpacing: '0.08em' }}>No image</span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                  <h3 style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: 16,
                    fontWeight: 300,
                    color: 'var(--forest)',
                  }}>
                    {post.title as string}
                  </h3>
                  <span className={`status-pill status-${post.status}`}>
                    {post.status as string}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--stone)' }}>
                  {!!post.category && <span>{post.category as string}</span>}
                  {post.published_at ? (
                    <span>
                      Published {new Date(post.published_at as string).toLocaleDateString('en-GB')}
                    </span>
                  ) : (
                    <span>
                      Created {new Date(post.created_at as string).toLocaleDateString('en-GB')}
                    </span>
                  )}
                </div>
                {!!post.excerpt && (
                  <p style={{
                    fontSize: 13, color: 'var(--stone)', marginTop: 6,
                    display: '-webkit-box',
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical' as const,
                    overflow: 'hidden',
                  }}>
                    {post.excerpt as string}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <Link
                  href={`/admin/journals/${post.slug}`}
                  className="btn btn-secondary btn-sm"
                >
                  Edit
                </Link>
                {post.status === 'published' && (
                  <Link
                    href={`/journal/${post.slug}`}
                    target="_blank"
                    className="btn btn-ghost btn-sm"
                  >
                    View ↗
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
