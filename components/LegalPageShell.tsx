import Link from 'next/link'

/**
 * Shared shell for the site's legal pages (/privacy, /terms, /cookies).
 *
 * SCAFFOLD STATE — 2026-07-20
 * These pages exist so the footer links resolve instead of 404ing. The final
 * legal copy is being drafted separately and is NOT in place yet. Until then
 * each page renders its intended section structure plus an honest notice that
 * the document is in preparation, and every page is set to `noindex` via its
 * own metadata export so search engines do not index placeholder legal text.
 *
 * When the real copy lands: replace the `sections` content, remove the
 * `inPreparation` flag, set a real `lastUpdated`, and drop the robots/noindex
 * line from the page's metadata export.
 */

export type LegalSection = {
  heading: string
  /** Paragraphs of finished copy. Empty while the section is still a stub. */
  body?: string[]
}

type Props = {
  eyebrow: string
  title: string
  titleEmphasis?: string
  intro: string
  /** ISO date of the last substantive revision. Null while in preparation. */
  lastUpdated?: string | null
  /** When true, renders the "document in preparation" notice. */
  inPreparation?: boolean
  sections: LegalSection[]
}

export default function LegalPageShell({
  eyebrow,
  title,
  titleEmphasis,
  intro,
  lastUpdated = null,
  inPreparation = false,
  sections,
}: Props) {
  return (
    <>
      {/* HERO */}
      <section style={{
        background: 'var(--forest)',
        padding: 'clamp(80px, 10vw, 120px) 0 clamp(64px, 8vw, 80px)',
      }}>
        <div className="container">
          <div className="label label-cream" style={{ marginBottom: 16 }}>{eyebrow}</div>
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
            {title}
            {titleEmphasis && <><br /><em>{titleEmphasis}</em></>}
          </h1>
          <p style={{
            fontSize: 15,
            color: 'rgba(247,243,238,0.65)',
            lineHeight: 1.75,
            maxWidth: 540,
          }}>
            {intro}
          </p>
          {lastUpdated && (
            <p style={{
              marginTop: 28,
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(196,168,130,0.7)',
            }}>
              Last updated — {lastUpdated}
            </p>
          )}
        </div>
      </section>

      {/* BODY */}
      <section style={{ padding: 'clamp(64px, 8vw, 100px) 0', background: 'var(--cream)' }}>
        <div className="container">
          <div className="fba-grid-sidebar" style={{ gap: 'clamp(40px, 6vw, 96px)', alignItems: 'start' }}>

            {/* Left: document body */}
            <div style={{ maxWidth: 720 }}>

              {inPreparation && (
                <div style={{
                  background: 'white',
                  border: '1px solid var(--light-line)',
                  borderLeft: '3px solid var(--sand)',
                  padding: '28px 32px',
                  marginBottom: 48,
                }}>
                  <div style={{
                    fontSize: 10,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--sand)',
                    marginBottom: 12,
                  }}>
                    Document in preparation
                  </div>
                  <p style={{
                    fontSize: 14,
                    color: 'var(--stone)',
                    lineHeight: 1.8,
                    marginBottom: 16,
                  }}>
                    This policy is currently being finalised and is not yet in force. The
                    outline below shows the matters it will cover. We have published the
                    structure in the interest of transparency rather than leave the page empty.
                  </p>
                  <p style={{
                    fontSize: 14,
                    color: 'var(--stone)',
                    lineHeight: 1.8,
                    margin: 0,
                  }}>
                    If you need information on any of these points before the full document is
                    published, please contact us at{' '}
                    <a
                      href="mailto:info@fullbloom.uk.com"
                      style={{ color: 'var(--forest)', textDecoration: 'underline' }}
                    >
                      info@fullbloom.uk.com
                    </a>{' '}
                    and we will answer directly.
                  </p>
                </div>
              )}

              {sections.map((section, i) => (
                <div key={section.heading} style={{ marginBottom: 40 }}>
                  <h2 style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: 'clamp(20px, 2.4vw, 26px)',
                    fontWeight: 300,
                    color: 'var(--forest)',
                    lineHeight: 1.35,
                    marginBottom: 16,
                    paddingBottom: 12,
                    borderBottom: '1px solid var(--light-line)',
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-sans, inherit)',
                      fontSize: 12,
                      letterSpacing: '0.1em',
                      color: 'var(--sand)',
                      marginRight: 14,
                      verticalAlign: 'middle',
                    }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {section.heading}
                  </h2>

                  {section.body && section.body.length > 0 ? (
                    section.body.map((para, j) => (
                      <p key={j} style={{
                        fontSize: 14,
                        color: 'var(--stone)',
                        lineHeight: 1.85,
                        marginBottom: 14,
                      }}>
                        {para}
                      </p>
                    ))
                  ) : (
                    <p style={{
                      fontSize: 13,
                      color: 'rgba(90,90,84,0.55)',
                      lineHeight: 1.8,
                      fontStyle: 'italic',
                      margin: 0,
                    }}>
                      This section is being drafted.
                    </p>
                  )}
                </div>
              ))}

            </div>

            {/* Right: sticky contact card */}
            <div style={{ position: 'sticky', top: 'calc(var(--nav-h) + 32px)' }}>
              <div style={{
                background: 'var(--forest)',
                padding: '36px 32px',
                color: 'var(--cream)',
              }}>
                <div style={{
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'rgba(196,168,130,0.7)',
                  marginBottom: 16,
                }}>
                  Questions about this policy
                </div>
                <h3 style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 22,
                  fontWeight: 300,
                  marginBottom: 16,
                  lineHeight: 1.3,
                }}>
                  Speak with the studio
                </h3>
                <p style={{
                  fontSize: 13,
                  color: 'rgba(247,243,238,0.6)',
                  lineHeight: 1.75,
                  marginBottom: 28,
                }}>
                  If anything here is unclear, or you want to exercise a right described in
                  this document, write to us and a member of the team will respond.
                </p>
                <a href="mailto:info@fullbloom.uk.com" className="btn btn-sand btn-full">
                  Contact the studio
                </a>
              </div>

              <div style={{
                marginTop: 24,
                background: 'white',
                border: '1px solid var(--light-line)',
                padding: '28px',
              }}>
                <div style={{
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--sand)',
                  marginBottom: 14,
                }}>
                  Related documents
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {[
                    { label: 'Privacy Policy', href: '/privacy' },
                    { label: 'Terms of Use',   href: '/terms' },
                    { label: 'Cookie Policy',  href: '/cookies' },
                  ].map(l => (
                    <li key={l.href} style={{ marginBottom: 10 }}>
                      <Link
                        href={l.href}
                        style={{
                          fontSize: 13,
                          color: 'var(--stone)',
                          textDecoration: 'none',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

          </div>
        </div>
      </section>
    </>
  )
}
