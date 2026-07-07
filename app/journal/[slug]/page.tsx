import Link from 'next/link'
import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { getFlags } from '@/lib/flags'
import { MarkdownBody } from '@/components/MarkdownBody'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const { data } = await supabaseAdmin
    .from('journal_posts')
    .select('title, seo_description, excerpt')
    .eq('slug', params.slug)
    .single()
  if (!data) return {}
  return {
    title: `${data.title} — The Journal`,
    description: data.seo_description ?? data.excerpt ?? '',
    alternates: { canonical: `/journal/${params.slug}` },
  }
}

export default async function JournalPostPage({ params }: { params: { slug: string } }) {
  const flags = await getFlags()
  if (!flags.show_journal) redirect('/coming-soon')

  const { data: post } = await supabaseAdmin
    .from('journal_posts')
    .select('*')
    .eq('slug', params.slug)
    .eq('status', 'published')
    .single()

  if (!post) notFound()

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type':    'Article',
    headline:   post.title,
    image:      post.featured_image ?? undefined,
    datePublished: post.published_at ?? post.created_at ?? undefined,
    dateModified:  post.updated_at ?? undefined,
    author:    { '@type': 'Organization', name: 'Full Bloom Artelier' },
    publisher: { '@type': 'Organization', name: 'Full Bloom Artelier' },
    description: post.seo_description ?? post.excerpt ?? undefined,
  }

  return (
    <div className="page-body">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      {/* Hero */}
      <section style={{
        position: 'relative',
        height: 480,
        overflow: 'hidden',
        background: 'var(--forest)',
      }}>
        {post.featured_image && (
          <Image
            src={post.featured_image}
            alt={post.title}
            fill
            priority
            style={{ objectFit: 'cover', opacity: 0.45 }}
          />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(26,43,24,0.92) 0%, rgba(26,43,24,0.3) 100%)',
        }} />
        <div className="container" style={{
          position: 'relative', zIndex: 1,
          height: '100%', display: 'flex', alignItems: 'flex-end', paddingBottom: 64,
          maxWidth: 760,
        }}>
          <div>
            <Link href="/journal" style={{
              fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'rgba(196,168,130,0.7)', textDecoration: 'none', display: 'block', marginBottom: 16,
            }}>
              ← The Journal
            </Link>
            {post.category && (
              <div className="label" style={{ color: 'var(--sand)', marginBottom: 14 }}>
                {post.category}
              </div>
            )}
            <h1 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(28px, 4vw, 52px)',
              fontWeight: 300,
              color: 'var(--cream)',
              letterSpacing: '-0.01em',
              lineHeight: 1.15,
              marginBottom: 16,
            }}>
              {post.title}
            </h1>
            {post.published_at && (
              <time style={{ fontSize: 11, letterSpacing: '0.1em', color: 'rgba(247,243,238,0.5)', textTransform: 'uppercase' }}>
                {new Date(post.published_at).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </time>
            )}
          </div>
        </div>
      </section>

      {/* Content */}
      <section style={{ padding: '72px 0 96px', background: 'var(--cream)' }}>
        <div className="container" style={{ maxWidth: 720 }}>
          {post.excerpt && (
            <p style={{
              fontSize: 18,
              lineHeight: 1.8,
              color: 'var(--forest)',
              fontFamily: 'var(--font-serif)',
              fontWeight: 300,
              marginBottom: 40,
              paddingBottom: 40,
              borderBottom: '1px solid var(--light-line)',
            }}>
              {post.excerpt}
            </p>
          )}
          <MarkdownBody content={post.content as string} />

          {/* Tags */}
          {post.tags && (post.tags as string[]).length > 0 && (
            <div style={{
              marginTop: 56,
              paddingTop: 32,
              borderTop: '1px solid var(--light-line)',
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}>
              {(post.tags as string[]).map((tag: string) => (
                <span key={tag} style={{
                  fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
                  padding: '5px 12px',
                  border: '1px solid var(--light-line)',
                  color: 'var(--stone)',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div style={{ marginTop: 48 }}>
            <Link href="/journal" style={{
              fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--caramel)', textDecoration: 'none',
            }}>
              ← Back to Journal
            </Link>
          </div>
        </div>
      </section>

    </div>
  )
}
