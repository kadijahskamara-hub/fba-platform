import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Coming Soon',
  description: 'This section of the Full Bloom Artelier platform is coming soon.',
  robots: { index: false, follow: false },
}

export default function ComingSoonPage() {
  return (
    <div className="page-body">

      {/* Hero */}
      <section style={{
        minHeight: '70vh',
        background: 'var(--forest)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative background mark */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          opacity: 0.04,
        }}>
          <span style={{
            fontFamily: 'var(--font-logo)',
            fontSize: 'clamp(180px, 30vw, 380px)',
            color: 'var(--cream)',
            userSelect: 'none',
            lineHeight: 1,
          }}>
            FBA
          </span>
        </div>

        <div className="container" style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          {/* Eyebrow */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 32,
          }}>
            <span style={{
              display: 'block',
              width: 32,
              height: 1,
              background: 'var(--sand)',
              opacity: 0.6,
            }} />
            <span style={{
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--sand)',
              opacity: 0.8,
            }}>
              Full Bloom Artelier
            </span>
            <span style={{
              display: 'block',
              width: 32,
              height: 1,
              background: 'var(--sand)',
              opacity: 0.6,
            }} />
          </div>

          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(40px, 7vw, 88px)',
            fontWeight: 300,
            color: 'var(--cream)',
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
            marginBottom: 28,
          }}>
            Coming Soon
          </h1>

          <p style={{
            fontSize: 'clamp(15px, 2vw, 18px)',
            lineHeight: 1.75,
            color: 'rgba(247,243,238,0.65)',
            maxWidth: 480,
            margin: '0 auto 48px',
          }}>
            We&apos;re putting the finishing touches on this section.
            Check back shortly — something considered is on its way.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/" className="btn btn-primary">
              Return Home
            </Link>
            <Link href="/contact" className="btn btn-outline-light">
              Get in Touch
            </Link>
          </div>
        </div>
      </section>

      {/* Footer strip */}
      <section style={{
        padding: '48px 0',
        background: 'var(--warm-white)',
        borderTop: '1px solid var(--light-line)',
      }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--stone)', letterSpacing: '0.04em' }}>
            In the meantime, explore{' '}
            <Link href="/products" style={{ color: 'var(--caramel)', textDecoration: 'none' }}>
              The Edit
            </Link>
            {' '}or learn{' '}
            <Link href="/about" style={{ color: 'var(--caramel)', textDecoration: 'none' }}>
              about the studio
            </Link>
            .
          </p>
        </div>
      </section>

    </div>
  )
}
