import Link from 'next/link'
import Image from 'next/image'
import { supabaseAdmin } from '@/lib/supabase'
import { getLiveStats } from '@/lib/liveStats'

export const metadata = {
  title: 'About',
  description: 'Full Bloom Artelier is a London-based FF&E procurement studio founded by Kadijahta Kamara — curated global sourcing, Technical Passport™ compliance and end-to-end procurement for design professionals.',
  alternates: { canonical: '/about' },
}

// Live stats must not be frozen at build time (fix A1)
export const revalidate = 3600


const SERVICES = [
  {
    num: '01',
    title: 'Technical Passport™',
    desc: 'Every product arrives with a full compliance document — fire retardancy rating, Martindale rub count, material provenance, IP rating (lighting), and installation guide. Your QS will thank you.',
  },
  {
    num: '02',
    title: 'Curated Finish Selector',
    desc: "FBA pre-approves every finish option — not everything the maker offers, only what we've tested and graded. Select marble, timber, fabric, or metal on each product card. Your selection carries through to the quote.",
  },
  {
    num: '03',
    title: 'Custom Match Service',
    desc: "Already have a marble spec from another supplier? A client-supplied timber or fabric? Our Custom Match service briefs the maker directly — grain alignment, stain matching, gloss level — so your scheme stays cohesive.",
  },
]

const PASSPORT_CRITERIA = [
  'Fire retardancy — UK Crib 5 or equivalent',
  'Fabric durability — minimum 40,000 Martindale rubs',
  'Material provenance documentation',
  'Electrical certification (CE / BS EN 60598 where applicable)',
  'IP rating for bathroom and exterior applications',
  'Structural load test results for seating',
  'Stain protection specification and reapplication schedule',
  'Full care and maintenance instruction sheet',
  'ISTA 3A packaging compliance for international freight',
]


const PROCESS_STEPS = [
  {
    num: '01',
    title: 'Trade Application',
    desc: 'Apply for a trade account. We review all applications within 5 working days and provide access to trade pricing and the full Edit.',
  },
  {
    num: '02',
    title: 'Browse & Specify',
    desc: "Browse the Edit, select finishes using FBA's curated swatch system, and save items to your Project Board to build your FF&E schedule.",
  },
  {
    num: '03',
    title: 'Quote & Schedule',
    desc: 'Request a quote — your selected finishes carry through automatically. We issue a proforma alongside your full Item Schedule and Specification Sheets within 48 hours.',
  },
  {
    num: '04',
    title: 'Production & Delivery',
    desc: 'We manage production directly with the maker, provide milestone updates, and coordinate delivery to site or to your preferred warehouse.',
  },
]

async function getHeroImage(key: string, fallbackAlt: string) {
  const { data } = await supabaseAdmin.from('site_settings').select('value').eq('key', key).single()
  const val = data?.value as { url?: string; alt?: string } | null
  return { url: val?.url ?? '', alt: val?.alt ?? fallbackAlt }
}

interface FounderSettings {
  show_on_about?: boolean
  show_on_home?:  boolean
  show_image?:    boolean
  name?:          string
  title?:         string
  bio?:           string
  bio_2?:         string
  tags?:          string
  previously?:    string
}

async function getFounderSettings(): Promise<FounderSettings> {
  const { data } = await supabaseAdmin.from('site_settings').select('value').eq('key', 'founder_settings').single()
  return (data?.value ?? {}) as FounderSettings
}

const FOUNDER_DEFAULTS: Required<FounderSettings> = {
  show_on_about: true,
  show_on_home:  true,
  show_image:    true,
  name:          'Kadijahta Kamara',
  title:         'Founder & Creative Director',
  bio:           'A luxury FF&E specialist with over a decade of experience across high-end residential, hospitality, and cruise line interiors. Kadijahta has delivered projects from £2M to £20M across the UK, Europe, Asia, and West Africa — building a deeply personal network of global makers that is the foundation of everything Full Bloom Artelier does.',
  bio_2:         'She brings a rare combination of creative vision, technical precision, and the kind of relationships with manufacturers that take years to build properly.',
  tags:          'FF&E Specialist,Global Sourcing,Hospitality,Interior Architecture,Bespoke Design',
  previously:    'KCA International · SMC Design · GA Group · Russell Sage Studio',
}

export default async function AboutPage() {
  // Live stats — shared with the homepage via lib/liveStats (fix A1/A4)
  const { stats: STATS, countries: COUNTRIES } = await getLiveStats()

  const [heroImage, founderRaw, makerImage] = await Promise.all([
    getHeroImage('about_hero_image', 'About Full Bloom Artelier'),
    getFounderSettings(),
    getHeroImage('about_maker_image', 'FBA maker studio'),
  ])
  const f = { ...FOUNDER_DEFAULTS, ...founderRaw }
  return (
    <div className="page-body">

      {/* HERO */}
      <section style={{
        position: 'relative',
        height: 'calc(100vh - var(--nav-h))',
        minHeight: 520,
        maxHeight: 900,
        overflow: 'hidden',
        background: 'var(--forest)',
        display: 'flex',
        alignItems: 'flex-end',
      }}>
        <Image
          src={heroImage.url || 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1920'}
          alt={heroImage.alt || 'Full Bloom Artelier studio'}
          fill priority
          style={{ objectFit: 'cover', objectPosition: 'center 55%', opacity: heroImage.url ? 0.55 : 0.32 }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(26,43,24,0.95) 0%, rgba(26,43,24,0.45) 50%, rgba(26,43,24,0.15) 100%)',
        }} />
        <div className="container" style={{ position: 'relative', zIndex: 1, paddingBottom: 80 }}>
          <div style={{ maxWidth: 680 }}>
            <div className="label" style={{ color: 'rgba(196,168,130,0.7)', marginBottom: 20 }}>
              London · Design Procurement Studio
            </div>
            <h1 style={{
              fontFamily: 'var(--font-serif)', fontSize: 'clamp(36px, 5vw, 60px)',
              fontWeight: 300, color: 'var(--cream)', letterSpacing: '-0.01em', lineHeight: 1.02,
            }}>
              Sourced with intention.<br />
              <em>Specified with precision.</em>
            </h1>
          </div>
        </div>
      </section>

      {/* STATS STRIP */}
      <section style={{ background: 'var(--forest)', borderTop: '1px solid rgba(196,168,130,0.12)', padding: '48px 0' }}>
        <div className="container">
          <div className="fba-grid-3" style={{ gap: 2 }}>
            {STATS.map(s => (
              <div key={s.label} style={{
                padding: '32px 40px', background: 'rgba(255,255,255,0.03)',
                borderLeft: '1px solid rgba(196,168,130,0.12)', textAlign: 'center',
              }}>
                <div style={{
                  fontFamily: 'var(--font-serif)', fontSize: 'clamp(32px, 4vw, 52px)',
                  fontWeight: 300, color: 'var(--cream)', marginBottom: 8,
                }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(196,168,130,0.6)' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MISSION */}
      <section style={{ padding: 'clamp(56px, 7vw, 80px) 0', background: 'var(--cream)' }}>
        <div className="container">
          <div className="fba-grid-2" style={{ gap: 80, alignItems: 'center' }}>
            <div>
              <div className="label label-sage" style={{ marginBottom: 20 }}>Our Mission</div>
              <h2 style={{
                fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px, 3.5vw, 48px)',
                fontWeight: 300, color: 'var(--forest)', letterSpacing: '0',
                marginBottom: 28, lineHeight: 1.15,
              }}>
                Sourcing should be as inspiring<br />
                as <em>designing.</em>
              </h2>
              <p style={{ fontSize: 15, color: 'var(--stone)', lineHeight: 1.85, marginBottom: 20 }}>
                We created a platform where interior designers, architects, and developers can discover
                beautifully curated furniture, lighting, and bespoke pieces that are not only design-led,
                but commercially viable, technically compliant, and price-conscious.
              </p>
              <p style={{ fontSize: 15, color: 'var(--stone)', lineHeight: 1.85, marginBottom: 20 }}>
                Too often, designers lose valuable time navigating thousands of products, checking regulations,
                value engineering specifications, creating countless mock-ups, and coordinating multiple
                suppliers. The procurement process becomes a barrier to creativity. We are changing that.
              </p>
              <p style={{ fontSize: 15, color: 'var(--stone)', lineHeight: 1.85, marginBottom: 20 }}>
                Full Bloom Artelier connects designers with trusted suppliers, artisans, and manufacturers
                from around the world through one carefully curated platform. From sourcing and product
                development to manufacturing, logistics, and final delivery, we help manage the journey —
                making commercial procurement simpler, faster, and more transparent.
              </p>
              <p style={{ fontSize: 15, color: 'var(--stone)', lineHeight: 1.85, marginBottom: 32 }}>
                But we are building more than a marketplace. We are creating a global design community where
                independent designers can showcase bespoke collections adapted for commercial projects
                worldwide — while supporting the next generation of designers with guidance on responsible
                sourcing, material selection, compliance, procurement, and sustainable manufacturing.
              </p>
            </div>
            <div>
              <div style={{ position: 'relative', aspectRatio: '4/5', overflow: 'hidden', marginBottom: 24 }}>
                <Image
                  src={makerImage.url || 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=800'}
                  alt={makerImage.alt || 'FBA maker studio'} fill style={{ objectFit: 'cover' }}
                />
              </div>
              <blockquote style={{
                borderLeft: '2px solid var(--sand)', paddingLeft: 24,
                fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 300,
                color: 'var(--forest)', fontStyle: 'italic', lineHeight: 1.5,
              }}>
                &ldquo;The brief was beautiful — and buildable, both.&rdquo;
              </blockquote>
            </div>
          </div>
        </div>
      </section>

      {/* VISION + PILLARS */}
      <section style={{ padding: 'clamp(56px, 7vw, 80px) 0', background: 'var(--warm-white)', borderTop: '1px solid var(--light-line)' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <div className="label label-sage" style={{ marginBottom: 16 }}>Built by designers for designers</div>
          <h2 style={{
            fontFamily: 'var(--font-serif)', fontSize: 'clamp(24px, 3vw, 40px)',
            fontWeight: 300, color: 'var(--forest)', maxWidth: 820, margin: '0 auto 56px', lineHeight: 1.35,
          }}>
            Our vision is simple: to make exceptional commercial design accessible, sustainable, and
            effortless — connecting creativity with craftsmanship on a <em>global scale.</em>
          </h2>
          <div className="fba-grid-3" style={{ gap: 32, textAlign: 'left' }}>
            {[
              { title: 'Curate',  body: 'Beautiful, commercially viable furniture and lighting from trusted global manufacturers.' },
              { title: 'Create',  body: 'Bespoke furniture and lighting developed with designers and manufactured to commercial standards.' },
              { title: 'Connect', body: 'Bringing together designers, suppliers, artisans, and manufacturers on one intelligent platform while educating the next generation of design professionals.' },
            ].map(pillar => (
              <div key={pillar.title} style={{ padding: 32, background: 'var(--cream)', border: '1px solid var(--light-line)' }}>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 300, color: 'var(--forest)', marginBottom: 12 }}>
                  {pillar.title}
                </h3>
                <p style={{ fontSize: 14, color: 'var(--stone)', lineHeight: 1.75 }}>{pillar.body}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: 'var(--stone)', marginTop: 40, letterSpacing: '0.04em' }}>
            Beautifully curated furniture for every contract requirement.
          </p>
        </div>
      </section>

      {/* WHAT WE DO */}
      <section style={{ padding: 'clamp(56px, 7vw, 80px) 0', background: 'var(--warm-white)', borderTop: '1px solid var(--light-line)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="label label-sage" style={{ marginBottom: 16 }}>What We Do</div>
            <h2 style={{
              fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px, 3vw, 44px)',
              fontWeight: 300, color: 'var(--forest)', letterSpacing: '0',
            }}>
              Three reasons designers<br />
              come back to <em>the Edit.</em>
            </h2>
          </div>
          <div className="fba-grid-3" style={{ gap: 32 }}>
            {SERVICES.map(s => (
              <div key={s.num} className="service-card">
                <div className="service-card-num">{s.num}</div>
                <h3 className="service-card-title">{s.title}</h3>
                <p className="service-card-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOUNDER */}
      {f.show_on_about !== false && (
      <section style={{ padding: 'clamp(56px, 7vw, 80px) 0', background: 'var(--cream)', borderTop: '1px solid var(--light-line)' }}>
        <div className="container">
          <div className={f.show_image ? 'fba-grid-img-text-lg' : undefined} style={{ display: 'grid', gap: 72, alignItems: 'start' }}>
            {f.show_image && (
              <div style={{ position: 'relative', aspectRatio: '3/4', overflow: 'hidden' }}>
                <Image
                  src="/images/founder.jpeg" alt={f.name + ', Founder'} fill
                  style={{ objectFit: 'cover', objectPosition: 'center top' }}
                />
              </div>
            )}
            <div style={{ paddingTop: 8 }}>
              <div className="label label-sage" style={{ marginBottom: 16 }}>The Founder</div>
              <div style={{
                fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
                color: 'var(--stone)', marginBottom: 16,
              }}>
                {f.title}
              </div>
              <h2 style={{
                fontFamily: 'var(--font-serif)', fontSize: 'clamp(32px, 4vw, 52px)',
                fontWeight: 300, color: 'var(--forest)', letterSpacing: '0',
                lineHeight: 1.1, marginBottom: 32,
              }}>
                {f.name.includes(' ') ? (
                  <>{f.name.split(' ')[0]}<br />{f.name.split(' ').slice(1).join(' ')}</>
                ) : f.name}
              </h2>
              {f.bio && <p style={{ fontSize: 15, color: 'var(--stone)', lineHeight: 1.85, marginBottom: 20 }}>{f.bio}</p>}
              {f.bio_2 && <p style={{ fontSize: 15, color: 'var(--stone)', lineHeight: 1.85, marginBottom: 32 }}>{f.bio_2}</p>}
              {f.tags && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
                  {f.tags.split(',').map(tag => tag.trim()).filter(Boolean).map(tag => (
                    <span key={tag} className="badge badge-sage">{tag}</span>
                  ))}
                </div>
              )}
              {f.previously && (
                <>
                  <div style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 10 }}>
                    Previously
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--forest)', fontWeight: 400 }}>
                    {f.previously}
                  </div>
                </>
              )}
              <div style={{ marginTop: 40 }}>
                <a href="mailto:info@fullbloom.uk.com" className="btn btn-primary">
                  Get in touch →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* TECHNICAL PASSPORT */}
      <section id="technical-passport" style={{ padding: 'clamp(56px, 7vw, 80px) 0', background: 'var(--forest)' }}>
        <div className="container">
          <div className="fba-grid-2" style={{ gap: 80, alignItems: 'start' }}>
            <div>
              <div className="label" style={{ color: 'rgba(196,168,130,0.7)', marginBottom: 20 }}>
                Technical Passport™
              </div>
              <h2 style={{
                fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px, 3vw, 44px)',
                fontWeight: 300, color: 'var(--cream)', letterSpacing: '0',
                lineHeight: 1.2, marginBottom: 28,
              }}>
                Every piece. Every<br />
                <em>certification. Every time.</em>
              </h2>
              <p style={{ fontSize: 15, color: 'rgba(247,243,238,0.65)', lineHeight: 1.85, marginBottom: 28 }}>
                The Technical Passport is FBA&apos;s proprietary compliance framework. Before any product enters
                the Edit, its maker submits to a full audit — material sourcing, fire-retardancy testing,
                structural load testing, and electrical certification where relevant.
              </p>
              <p style={{ fontSize: 15, color: 'rgba(247,243,238,0.65)', lineHeight: 1.85, marginBottom: 40 }}>
                When you specify from the Edit, you receive the Passport document alongside the quote —
                ready to hand to your project QS or contractor without any additional legwork.
              </p>
              <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(196,168,130,0.5)', marginBottom: 16 }}>
                Countries of Origin
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {COUNTRIES.length === 0 && (
                  <span style={{ fontSize: 13, color: 'rgba(247,243,238,0.6)', fontStyle: 'italic' }}>
                    Supplier locations coming soon.
                  </span>
                )}
                {COUNTRIES.map(c => (
                  <span key={c} style={{
                    padding: '6px 16px', border: '1px solid rgba(196,168,130,0.25)',
                    fontSize: 13, color: 'rgba(247,243,238,0.7)', letterSpacing: '0.04em',
                  }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(196,168,130,0.15)', padding: 40 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(196,168,130,0.6)', marginBottom: 8 }}>
                Technical Passport™ — Criteria
              </div>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 300, color: 'var(--cream)', marginBottom: 28, lineHeight: 1.3 }}>
                What every FBA product<br />must demonstrate
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {PASSPORT_CRITERIA.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 0',
                    borderBottom: i < PASSPORT_CRITERIA.length - 1 ? '1px solid rgba(196,168,130,0.1)' : 'none',
                  }}>
                    <span style={{
                      width: 20, height: 20, flexShrink: 0,
                      background: 'rgba(196,168,130,0.15)', border: '1px solid rgba(196,168,130,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
                    }}>
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="rgba(196,168,130,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <span style={{ fontSize: 13, color: 'rgba(247,243,238,0.7)', lineHeight: 1.6 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW WE WORK */}
      <section style={{ padding: 'clamp(56px, 7vw, 80px) 0', background: 'var(--warm-white)', borderTop: '1px solid var(--light-line)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="label label-sage" style={{ marginBottom: 16 }}>How We Work</div>
            <h2 style={{
              fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px, 3vw, 44px)',
              fontWeight: 300, color: 'var(--forest)', letterSpacing: '0',
            }}>
              From brief to<br />
              <em>delivery</em> — our process.
            </h2>
          </div>
          <div className="fba-grid-4" style={{ gap: 2 }}>
            {PROCESS_STEPS.map((step, i) => (
              <div key={step.num} style={{
                padding: '40px 32px', background: 'var(--cream)',
                borderLeft: i === 0 ? 'none' : '1px solid var(--light-line)', position: 'relative',
              }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 48, fontWeight: 300, color: 'var(--sage-bg)', lineHeight: 1, marginBottom: 16 }}>
                  {step.num}
                </div>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 300, color: 'var(--forest)', marginBottom: 16, lineHeight: 1.3 }}>
                  {step.title}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--stone)', lineHeight: 1.8 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(56px, 7vw, 80px) 0', background: 'var(--forest)', textAlign: 'center' }}>
        <div className="container" style={{ maxWidth: 560 }}>
          <div className="label" style={{ color: 'rgba(196,168,130,0.7)', marginBottom: 20 }}>
            Ready to source without compromise?
          </div>
          <h2 style={{
            fontFamily: 'var(--font-serif)', fontSize: 'clamp(30px, 4vw, 50px)',
            fontWeight: 300, color: 'var(--cream)', letterSpacing: '0', marginBottom: 20, lineHeight: 1.15,
          }}>
            Work with us.
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(247,243,238,0.6)', lineHeight: 1.8, marginBottom: 40 }}>
            Full Bloom Artelier works with interior designers, architects, and hospitality developers
            on a trade basis. Every enquiry receives a personal response within 48 hours.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/trade/apply" className="btn btn-sand">Apply for Trade Access</Link>
            <Link href="/products" className="btn btn-outline-light">Browse the Edit</Link>
          </div>
        </div>
      </section>

    </div>
  )
}
