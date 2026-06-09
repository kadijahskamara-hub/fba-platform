import type { Metadata } from 'next'
import HomepageEnquiryForm from '@/app/HomepageEnquiryForm'

export const metadata: Metadata = {
  title: 'Contact — Full Bloom Artelier',
  description: 'Get in touch with the Full Bloom Artelier studio for product sourcing, atelier commissions, trade access enquiries, and bespoke procurement.',
}

const CONTACT_DETAILS = [
  {
    label: 'Studio',
    value: 'London, United Kingdom',
  },
  {
    label: 'General Enquiries',
    value: 'info@fullbloom.uk.com',
    href: 'mailto:info@fullbloom.uk.com',
  },
  {
    label: 'Trade & Procurement',
    value: 'trade@fullbloom.uk.com',
    href: 'mailto:trade@fullbloom.uk.com',
  },
  {
    label: 'Response Time',
    value: 'Within 2 business days',
  },
]

const SERVICES = [
  {
    title: 'Product Sourcing',
    desc: 'Curated FF&E procurement from our vetted global maker network. We match the right piece to your project spec, finish, and timeline.',
  },
  {
    title: 'Atelier Commissions',
    desc: 'Bespoke pieces designed and produced in collaboration with our artisan studios. From concept to Technical Passport™ documentation.',
  },
  {
    title: 'Trade Access',
    desc: 'Apply for a trade account to access net pricing, full product specifications, and your personal project board.',
  },
  {
    title: 'General Procurement',
    desc: 'End-to-end procurement management for hospitality, residential, and commercial interiors projects.',
  },
]

export default function ContactPage() {
  return (
    <main style={{ background: 'var(--cream)', minHeight: '100vh' }}>

      {/* ── Hero ── */}
      <section style={{
        background: 'var(--forest)',
        padding: '96px 24px 80px',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div className="label label-sage" style={{ marginBottom: 16 }}>
            Get in touch
          </div>
          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(36px, 5vw, 56px)',
            fontWeight: 300,
            color: 'var(--cream)',
            lineHeight: 1.2,
            margin: '0 0 20px',
          }}>
            Let&rsquo;s talk about your project
          </h1>
          <p style={{
            fontSize: 16,
            color: 'rgba(247,243,238,0.65)',
            lineHeight: 1.75,
            maxWidth: 480,
            margin: '0 auto',
          }}>
            Whether you&rsquo;re sourcing for a hospitality scheme, commissioning a bespoke
            piece, or exploring trade access — we&rsquo;d love to hear from you.
          </p>
        </div>
      </section>

      {/* ── Services grid ── */}
      <section style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '72px 24px 0',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 1,
          background: 'var(--sand)',
          border: '1px solid var(--sand)',
          marginBottom: 72,
        }}>
          {SERVICES.map((s) => (
            <div key={s.title} style={{
              background: 'var(--cream)',
              padding: '32px 28px',
            }}>
              <h3 style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 18,
                fontWeight: 400,
                color: 'var(--forest)',
                marginBottom: 10,
              }}>
                {s.title}
              </h3>
              <p className="body-sm" style={{ color: 'var(--stone)', lineHeight: 1.7 }}>
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Main content: form + contact details ── */}
      <section style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '0 24px 100px',
        display: 'grid',
        gridTemplateColumns: '1fr 380px',
        gap: 64,
        alignItems: 'start',
      }}>

        {/* Form */}
        <div>
          <div style={{ marginBottom: 36 }}>
            <div className="label label-sage" style={{ marginBottom: 10 }}>Send an enquiry</div>
            <h2 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(26px, 3vw, 34px)',
              fontWeight: 300,
              color: 'var(--forest)',
              margin: 0,
            }}>
              Tell us about your project
            </h2>
          </div>

          {/* Wrap form in dark background to match homepage usage */}
          <div style={{
            background: 'var(--forest)',
            padding: '40px',
          }}>
            <HomepageEnquiryForm />
          </div>
        </div>

        {/* Contact details sidebar */}
        <div style={{ paddingTop: 8 }}>
          <div style={{ marginBottom: 36 }}>
            <div className="label label-sage" style={{ marginBottom: 10 }}>Studio details</div>
            <h2 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 26,
              fontWeight: 300,
              color: 'var(--forest)',
              margin: 0,
            }}>
              How to reach us
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginBottom: 48 }}>
            {CONTACT_DETAILS.map((item) => (
              <div key={item.label} style={{
                paddingBottom: 28,
                borderBottom: '1px solid var(--sand)',
              }}>
                <div style={{
                  fontSize: 11,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: 'var(--stone)',
                  marginBottom: 6,
                }}>
                  {item.label}
                </div>
                {item.href ? (
                  <a href={item.href} style={{
                    fontSize: 15,
                    color: 'var(--forest)',
                    textDecoration: 'none',
                    borderBottom: '1px solid var(--caramel)',
                  }}>
                    {item.value}
                  </a>
                ) : (
                  <span style={{ fontSize: 15, color: 'var(--forest)' }}>{item.value}</span>
                )}
              </div>
            ))}
          </div>

          {/* Trade CTA */}
          <div style={{
            background: 'var(--sage-light, #E4EAE3)',
            padding: '28px 24px',
          }}>
            <h4 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 17,
              fontWeight: 400,
              color: 'var(--forest)',
              marginBottom: 10,
            }}>
              Interior professionals
            </h4>
            <p className="body-sm" style={{ color: 'var(--stone)', marginBottom: 20, lineHeight: 1.7 }}>
              Apply for a trade account to unlock net pricing, full specifications,
              and your personal project board.
            </p>
            <a href="/trade/apply" className="btn btn-primary btn-sm" style={{ display: 'inline-block' }}>
              Apply for Trade Access
            </a>
          </div>
        </div>
      </section>

      {/* ── Mobile responsive override ── */}
      <style>{`
        @media (max-width: 768px) {
          section:last-of-type {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  )
}
