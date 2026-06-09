import Link from 'next/link'

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

        {/* Main grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr',
          gap: 48,
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

            <div style={{ fontSize: 12, marginBottom: 8 }}>
              <a href="mailto:info@fullbloom.uk.com"
                style={{ color: 'rgba(196,168,130,0.8)', textDecoration: 'none' }}>
                info@fullbloom.uk.com
              </a>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(247,243,238,0.35)' }}>
              London, United Kingdom
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
                { label: 'Trade Procurement', href: '/trade/apply' },
                { label: 'Product Sourcing',  href: '/contact' },
                { label: 'Atelier Commissions', href: '/contact' },
                { label: 'Technical Passport™', href: '/about#technical-passport' },
                { label: 'Apply for Trade Access', href: '/trade/apply' },
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
