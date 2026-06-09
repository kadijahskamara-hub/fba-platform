import type { Metadata } from 'next'
import FaqsAccordion from './FaqsAccordion'

export const metadata: Metadata = {
  title: 'FAQs — Full Bloom Artelier',
  description:
    'Answers to common questions about FBA trade access, procurement, the Technical Passport™, ordering, delivery, and working with our maker network.',
}

export default function FaqsPage() {
  return (
    <>
      {/* HERO */}
      <section style={{
        background: 'var(--forest)',
        padding: 'clamp(80px, 10vw, 120px) 0 clamp(56px, 7vw, 80px)',
      }}>
        <div className="container">
          <div className="label label-cream" style={{ marginBottom: 16 }}>Support</div>
          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(36px, 5vw, 64px)',
            fontWeight: 300,
            color: 'var(--cream)',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            maxWidth: 640,
            marginBottom: 24,
          }}>
            Frequently asked<br />
            <em>questions.</em>
          </h1>
          <p style={{
            fontSize: 15,
            color: 'rgba(247,243,238,0.65)',
            lineHeight: 1.75,
            maxWidth: 540,
          }}>
            Everything you need to know about working with FBA — from trade access and
            sourcing to the Technical Passport™, ordering, and delivery.
          </p>
        </div>
      </section>

      {/* BODY */}
      <section style={{ padding: 'clamp(64px, 8vw, 100px) 0', background: 'var(--cream)' }}>
        <div className="container">
          <div className="fba-grid-sidebar" style={{ gap: 'clamp(40px, 6vw, 96px)', alignItems: 'start' }}>

            {/* Left: accordion */}
            <div>
              <FaqsAccordion />
            </div>

            {/* Right: sticky contact cards */}
            <div style={{ position: 'sticky', top: 'calc(var(--nav-h) + 32px)' }}>
              <div style={{
                background: 'var(--forest)',
                padding: '36px 32px',
                color: 'var(--cream)',
              }}>
                <div style={{
                  fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: 'rgba(196,168,130,0.7)', marginBottom: 16,
                }}>
                  Still have questions?
                </div>
                <h3 style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 22, fontWeight: 300,
                  marginBottom: 16, lineHeight: 1.3,
                }}>
                  Speak with our procurement team
                </h3>
                <p style={{
                  fontSize: 13, color: 'rgba(247,243,238,0.6)',
                  lineHeight: 1.75, marginBottom: 28,
                }}>
                  Our team works with designers and developers every day. If you have a
                  project-specific question or just want to understand whether FBA is the
                  right partner, we're here.
                </p>
                <a href="/contact" className="btn btn-sand btn-full">
                  Send an enquiry
                </a>
                <a
                  href="mailto:info@fullbloom.uk.com"
                  style={{
                    display: 'block', textAlign: 'center', marginTop: 14,
                    fontSize: 12, color: 'rgba(247,243,238,0.45)',
                    textDecoration: 'none', letterSpacing: '0.04em',
                  }}
                >
                  info@fullbloom.uk.com
                </a>
              </div>

              <div style={{
                marginTop: 24,
                background: 'white',
                border: '1px solid var(--light-line)',
                padding: '28px 28px',
              }}>
                <div style={{
                  fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
                  color: 'var(--sand)', marginBottom: 12,
                }}>
                  Trade professionals
                </div>
                <p style={{
                  fontSize: 13, color: 'var(--stone)',
                  lineHeight: 1.75, marginBottom: 20,
                }}>
                  Apply for trade access to unlock professional pricing and dedicated support.
                </p>
                <a href="/trade/apply" className="btn btn-primary btn-full">
                  Apply for Trade Access
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>
    </>
  )
}
