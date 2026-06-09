import Link from 'next/link'
import { Mail, MapPin, ArrowUpRight } from 'lucide-react'

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer style={{
      background: 'var(--deep-brown)',
      color: 'rgba(247,243,238,0.55)',
      paddingTop: 72,
      paddingBottom: 40,
    }}>
      <div className="container">

        {/* Main grid — 4-col desktop, 2-col tablet, 1-col mobile */}
        <div className="footer-grid" style={{
          paddingBottom: 56,
          borderBottom: '1px solid rgba(196,168,130,0.12)',
          marginBottom: 40,
        }}>

          {/* Brand column */}
          <div>
            {/* Logo */}
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontFamily: 'var(--font-logo)',
                fontSize: 28,
                color: 'var(--cream)',
                letterSpacing: '0.04em',
                lineHeight: 1,
              }}>
                FBA
              </div>
              <div style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 10,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'rgba(196,168,130,0.6)',
                marginTop: 4,
              }}>
                Full Bloom / Artelier
              </div>
            </div>

            <p style={{ fontSize: 13, lineHeight: 1.8, maxWidth: 280, marginBottom: 28 }}>
              A London-based design procurement studio. We source and procure exceptional
              handcrafted furniture, lighting and objects for interior designers, architects
              and property developers.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <a
                href="mailto:info@fullbloom.uk.com"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  color: 'rgba(196,168,130,0.8)', textDecoration: 'none', fontSize: 13,
                }}
              >
                <Mail size={14} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                info@fullbloom.uk.com
              </a>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                color: 'rgba(247,243,238,0.35)', fontSize: 13,
              }}>
                <MapPin size={14} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                London, United Kingdom
              </div>
            </div>
          </div>

          {/* The Platform */}
          <div>
            <div style={{
              fontSize: 10,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'rgba(196,168,130,0.6)',
              marginBottom: 20,
            }}>
              The Platform
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Browse the Edit',    href: '/products' },
                { label: 'The Collection',     href: '/collection' },
                { label: 'FBA Home',           href: '/home' },
                { label: 'Artisans',           href: '/artisans' },
                { label: 'The Journal',        href: '/journal' },
                { label: 'About FBA',          href: '/about' },
              ].map(l => (
                <Link key={l.href} href={l.href} style={{
                  fontSize: 13,
                  color: 'rgba(247,243,238,0.55)',
                  textDecoration: 'none',
                  transition: 'color 0.15s',
                }}>
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Services */}
          <div>
            <div style={{
              fontSize: 10,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'rgba(196,168,130,0.6)',
              marginBottom: 20,
            }}>
              Services
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Trade Procurement',    href: '/trade/apply' },
                { label: 'Product Sourcing',     href: '/contact' },
                { label: 'Atelier Commissions',  href: '/contact' },
                { label: 'Technical Passport™',  href: '/about#technical-passport' },
                { label: 'Apply for Trade Access', href: '/trade/apply' },
                { label: 'FAQs',                 href: '/faqs' },
              ].map(l => (
                <Link key={l.label} href={l.href} style={{
                  fontSize: 13,
                  color: 'rgba(247,243,238,0.55)',
                  textDecoration: 'none',
                }}>
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Account */}
          <div>
            <div style={{
              fontSize: 10,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'rgba(196,168,130,0.6)',
              marginBottom: 20,
            }}>
              Account
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Sign in',          href: '/login' },
                { label: 'Register',         href: '/register' },
                { label: 'My Projects',      href: '/account/projects' },
                { label: 'My Account',       href: '/account' },
                { label: 'Cart',             href: '/cart' },
              ].map(l => (
                <Link key={l.label} href={l.href} style={{
                  fontSize: 13,
                  color: 'rgba(247,243,238,0.55)',
                  textDecoration: 'none',
                }}>
                  {l.label}
                </Link>
              ))}
            </nav>

            {/* Enquiry CTA */}
            <div style={{ marginTop: 32 }}>
              <a
                href="/contact"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: 'var(--sand)', textDecoration: 'none',
                }}
              >
                Send an enquiry
                <ArrowUpRight size={13} strokeWidth={1.5} />
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}>
          <p style={{ fontSize: 11, color: 'rgba(247,243,238,0.3)', letterSpacing: '0.04em' }}>
            © {year} Full Bloom Artelier Ltd. All rights reserved.
          </p>
          <div style={{ display: 'flex', gap: 24 }}>
            {[
              { label: 'Privacy Policy',    href: '/privacy' },
              { label: 'Terms of Use',      href: '/terms' },
              { label: 'Cookie Policy',     href: '/cookies' },
            ].map(l => (
              <Link key={l.label} href={l.href} style={{
                fontSize: 11,
                color: 'rgba(247,243,238,0.3)',
                textDecoration: 'none',
                letterSpacing: '0.04em',
              }}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>

      </div>
    </footer>
  )
}
