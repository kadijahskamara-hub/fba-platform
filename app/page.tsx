import Link from 'next/link'
import Image from 'next/image'
import { Check, ArrowRight } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { getLiveStats } from '@/lib/liveStats'
import HomepageEnquiryForm from './HomepageEnquiryForm'

export const metadata = {
  title: { absolute: 'Full Bloom Artelier — Design Procurement Studio' },
  description:
    'A London-based design procurement studio connecting interior designers, architects and developers with exceptional handcrafted furniture, lighting and objects from our curated maker network.',
  alternates: { canonical: '/' },
}

// Live studio stats must not be frozen at build time (fix A4)
export const revalidate = 3600

const CITIES = ['Milan', 'London', 'Paris', 'Delhi', 'Lagos', 'Shanghai']
const TICKER_ITEMS = [
  'Curated Global Sourcing',
  'Technical Passport™ — Every Piece Vetted',
  'Hospitality & High-End Residential',
  'Bespoke FF&E — Concept to Installation',
  'Crib 5 Compliant · Contract Grade',
  'Trade Enquiries Welcome',
]

const PILLARS = [
  {
    num: '01',
    title: 'Curated Sourcing',
    desc: 'Access our hand-vetted global network of artisan makers across Europe, Asia, and North Africa. Every partner is chosen for craft, reliability, and the ability to meet London-grade technical standards — not for volume.',
    href: '/trade/apply',
    cta: 'Request Access',
  },
  {
    num: '02',
    title: 'The FBA Atelier',
    desc: "When a project demands a piece that doesn't exist yet, we design and engineer it. From mood board to technical shop drawings to Golden Sample sign-off — your bespoke vision, realised with absolute precision.",
    href: '/trade/apply',
    cta: 'Start a Brief',
  },
  {
    num: '03',
    title: 'Refined Procurement',
    desc: 'We take the paperwork off your desk. Material specifications, Crib 5 compliance, prototype approvals, freight management, and room-ready delivery — handled end-to-end, so you focus entirely on design.',
    href: '/about',
    cta: 'Learn More',
  },
]

const PASSPORT_BULLETS = [
  'Crib 5 fire rating compliance',
  'Kiln-dried timber & material integrity standards',
  'ISTA 3A packaging for international freight',
  'Shop drawings verified to ±2mm tolerance',
  'Golden Sample sign-off before production begins',
  'Ethical Trading Initiative (ETI) compliance',
  'Single point of contact — one invoice, zero friction',
]

const REGIONS = [
  { label: 'Southern Europe', desc: 'Italy · Portugal · Spain', img: 'https://images.pexels.com/photos/2422915/pexels-photo-2422915.jpeg?auto=compress&cs=tinysrgb&w=600' },
  { label: 'Anatolia',        desc: 'Turkey',                   img: 'https://images.pexels.com/photos/2042109/pexels-photo-2042109.jpeg?auto=compress&cs=tinysrgb&w=600' },
  { label: 'South Asia',      desc: 'India · Sri Lanka',        img: 'https://images.pexels.com/photos/2387873/pexels-photo-2387873.jpeg?auto=compress&cs=tinysrgb&w=600' },
  { label: 'Southeast Asia',  desc: 'Indonesia · Vietnam',      img: 'https://images.pexels.com/photos/2506923/pexels-photo-2506923.jpeg?auto=compress&cs=tinysrgb&w=600' },
  { label: 'North Africa',    desc: 'Morocco · Egypt',          img: 'https://images.pexels.com/photos/3889855/pexels-photo-3889855.jpeg?auto=compress&cs=tinysrgb&w=600' },
]

async function getFeaturedProducts() {
  const { data } = await supabaseAdmin
    .from('products')
    .select('id, name, slug, images, short_description, retail_price, trade_price, price_type, currency, is_fba_collection, artisan:artisans(name, slug), category:categories(name)')
    .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null)
    .limit(8)
  return data ?? []
}

async function getFeaturedArtisans() {
  const { data } = await supabaseAdmin
    .from('artisans')
    .select('id, name, slug, location, profile_image, short_bio')
    .eq('is_published', true)
    .limit(3)
  return data ?? []
}

async function getRecentJournalPosts() {
  const { data } = await supabaseAdmin
    .from('journal_posts')
    .select('id, title, slug, featured_image, excerpt, published_at, category')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(3)
  return data ?? []
}

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
  tags?:          string
  previously?:    string
}

async function getFounderSettings(): Promise<FounderSettings> {
  const { data } = await supabaseAdmin.from('site_settings').select('value').eq('key', 'founder_settings').single()
  return (data?.value ?? {}) as FounderSettings
}

interface HomeHeroSettings {
  images?:            { url: string; alt: string }[]
  headline_1?:        string
  headline_2?:        string
  headline_3?:        string
  subtitle?:          string
  cta_primary?:       string
  cta_primary_href?:  string
  cta_secondary?:     string
  cta_secondary_href?: string
  overlay_opacity?:   number
}

async function getHomeHeroSettings(): Promise<HomeHeroSettings> {
  const { data } = await supabaseAdmin.from('site_settings').select('value').eq('key', 'home_hero_settings').single()
  return (data?.value ?? {}) as HomeHeroSettings
}

interface RegionCard { label: string; desc: string; img: string; alt: string; href: string }

async function getNetworkRegions(): Promise<RegionCard[]> {
  const { data } = await supabaseAdmin.from('site_settings').select('value').eq('key', 'network_regions').single()
  const cards = (data?.value as { cards?: Array<{ label?: string; desc?: string; url?: string; alt?: string; href?: string }> } | null)?.cards
  if (!cards?.length) {
    // Fallback to built-in defaults if the setting is missing.
    return REGIONS.map(r => ({ label: r.label, desc: r.desc, img: r.img, alt: r.label, href: '' }))
  }
  return cards
    .filter(c => (c.url || '').trim() || (c.label || '').trim())
    .map(c => ({
      label: c.label ?? '',
      desc:  c.desc ?? '',
      img:   c.url ?? '',
      alt:   c.alt || c.label || 'Maker network region',
      // Only allow internal paths or http(s) links — never javascript: etc.
      href:  /^\/(?!\/)|^https?:\/\//.test((c.href ?? '').trim()) ? (c.href ?? '').trim() : '',
    }))
}

const FOUNDER_DEFAULTS = {
  show_on_home: true,
  show_image:   true,
  name:         'Kadijahta Kamara',
  title:        'Founder & Creative Director',
  bio:          'A luxury FF&E specialist with over a decade of experience across high-end residential, hospitality, and cruise line interiors. Kadijahta has delivered projects from £2M to £20M across the UK, Europe, Asia, and West Africa.',
  tags:         'FF&E Specialist,Global Sourcing,Hospitality,Interior Architecture,Bespoke Design',
  previously:   'KCA International · SMC Design · GA Group · Russell Sage Studio',
}

export default async function HomePage() {
  const [session, featuredProducts, artisans, journalPosts, heroImage, founderRaw, heroSettingsRaw, regions, pillarsImage, liveStats] = await Promise.all([
    getSession(),
    getFeaturedProducts(),
    getFeaturedArtisans(),
    getRecentJournalPosts(),
    getHeroImage('home_hero_image', 'Full Bloom Artelier — Design Procurement Studio'),
    getFounderSettings(),
    getHomeHeroSettings(),
    getNetworkRegions(),
    getHeroImage('home_pillars_image', 'Luxury hotel — Full Bloom Artelier'),
    getLiveStats(),
  ])
  const f  = { ...FOUNDER_DEFAULTS, ...founderRaw }
  const hs = heroSettingsRaw as HomeHeroSettings
  const heroSrc = hs.images?.[0]?.url || heroImage.url || 'https://images.pexels.com/photos/29649745/pexels-photo-29649745.jpeg?auto=compress&cs=tinysrgb&w=1920'
  const heroAlt = hs.images?.[0]?.alt || heroImage.alt || 'Full Bloom Artelier — curated interiors'
  const pillarsSrc = pillarsImage.url || 'https://images.pexels.com/photos/1838554/pexels-photo-1838554.jpeg?auto=compress&cs=tinysrgb&w=1920'

  const isTradeOrAdmin = session && ['trade_user', 'admin', 'staff'].includes(session.role)
  const tickerFull = [...TICKER_ITEMS, ...TICKER_ITEMS]
  const citiesFull = [...CITIES, ...CITIES, ...CITIES, ...CITIES]
  const overlayOpacity = hs.overlay_opacity ?? 0.80
  const overlayMid     = Math.round(overlayOpacity * 0.31 * 100) / 100

  return (
    <div className="page-body">

      {/* HERO */}
      <section style={{
        position: 'relative', height: '82vh', minHeight: 560,
        display: 'flex', alignItems: 'flex-end', overflow: 'hidden',
      }}>
        <Image
          src={heroSrc}
          alt={heroAlt}
          fill priority
          style={{ objectFit: 'cover', objectPosition: 'center 30%' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(to top, rgba(26,43,24,${overlayOpacity}) 0%, rgba(26,43,24,${overlayMid}) 55%, transparent 100%)`,
        }} />

        {/* Vertical cities — right side (hidden on mobile) */}
        <div className="hero-cities" style={{
          position: 'absolute', right: 56, top: '50%', transform: 'translateY(-50%)',
          display: 'flex', flexDirection: 'column', gap: 12, zIndex: 2, alignItems: 'flex-end',
        }}>
          {CITIES.map((city, i) => (
            <span key={city} style={{
              fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase',
              color: i === 1 ? 'rgba(196,168,130,0.9)' : 'rgba(247,243,238,0.35)',
              fontWeight: i === 1 ? 500 : 300,
            }}>
              {city}
            </span>
          ))}
        </div>

        <div className="container" style={{ position: 'relative', zIndex: 1, paddingBottom: 100 }}>
          <div style={{ maxWidth: 660 }}>
            <div style={{
              fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'rgba(196,168,130,0.85)', marginBottom: 20,
            }}>
              London Design Procurement Studio
            </div>
            <h1 style={{
              fontFamily: 'var(--font-serif)', fontSize: 'clamp(44px, 6.5vw, 88px)',
              fontWeight: 300, lineHeight: 1.06, color: 'var(--cream)',
              marginBottom: 28, letterSpacing: '-0.01em',
            }}>
              {hs.headline_1 ?? 'Global Craft.'}<br />
              <em>{hs.headline_2 ?? 'Delivered'}</em><br />
              {hs.headline_3 ?? 'Precisely.'}
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: 'rgba(247,243,238,0.70)', marginBottom: 44, maxWidth: 500 }}>
              {hs.subtitle ?? "Beautiful design, delivered without compromise. Full Bloom Artelier connects interior designers, architects, and hospitality developers with curated furniture, lighting, finishes, and bespoke pieces — hand-vetted, technically compliant, and ready for commercial projects."}
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Link href={hs.cta_primary_href ?? '/trade/apply'} className="btn btn-sand">
                {hs.cta_primary ?? 'Request Trade Access'}
              </Link>
              <Link href={hs.cta_secondary_href ?? '/products'} className="btn btn-outline-light">
                {hs.cta_secondary ?? 'Browse the Edit'}
              </Link>
            </div>
            <p style={{ fontSize: 12, letterSpacing: '0.08em', color: 'rgba(196,168,130,0.75)', marginTop: 28 }}>
              Built by designers for designers · Curated furniture for every contract requirement
            </p>
          </div>
        </div>

        <div style={{
          position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 1,
        }}>
          <div style={{ width: 1, height: 48, background: 'linear-gradient(to bottom, rgba(196,168,130,0) 0%, rgba(196,168,130,0.5) 100%)' }} />
        </div>
      </section>

      {/* SERVICES MARQUEE */}
      <div style={{
        background: 'var(--forest)',
        borderTop: '1px solid rgba(196,168,130,0.12)', borderBottom: '1px solid rgba(196,168,130,0.12)',
        padding: '18px 0', overflow: 'hidden',
      }}>
        <div className="marquee-track">
          <div className="marquee-inner">
            {tickerFull.map((item, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center',
                fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
                color: 'rgba(247,243,238,0.5)', padding: '0 36px', whiteSpace: 'nowrap',
              }}>
                {item}
                <span style={{
                  display: 'inline-block', width: 3, height: 3, borderRadius: '50%',
                  background: 'rgba(196,168,130,0.5)', marginLeft: 36,
                }} />
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* STUDIO INTRO */}
      <section style={{ padding: 'clamp(56px, 7vw, 80px) 0', background: 'var(--cream)' }}>
        <div className="container">
          <div className="fba-grid-2" style={{ gap: 80, alignItems: 'center' }}>
            <div>
              <div className="label label-sage" style={{ marginBottom: 20 }}>The Studio</div>
              <h2 style={{
                fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px, 3.5vw, 50px)',
                fontWeight: 300, color: 'var(--forest)', letterSpacing: '-0.01em',
                marginBottom: 28, lineHeight: 1.15,
              }}>
                Beautiful design,<br />
                <em>delivered without<br />compromise.</em>
              </h2>
              <p style={{ fontSize: 15, color: 'var(--stone)', lineHeight: 1.85, marginBottom: 20 }}>
                We built Full Bloom Artelier around a single observation: the world&apos;s most extraordinary
                craftsmanship too often gets lost in translation — delayed by compliance gaps, distorted
                by distance, and let down by procurement systems not built for design professionals.
              </p>
              <p style={{ fontSize: 15, color: 'var(--stone)', lineHeight: 1.85, marginBottom: 40 }}>
                From first sourcing conversation to room-ready delivery, we manage the complete journey
                — with technical precision and the discerning eye of a specialist who has delivered it at every scale.
              </p>
              <Link href="/about" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Our story <ArrowRight size={14} strokeWidth={1.5} /></Link>
            </div>
            <div>
              <div className="fba-grid-3" style={{ gap: 2, marginBottom: 40 }}>
                {liveStats.stats.map(s => (
                  <div key={s.label} style={{
                    padding: '28px 24px', background: 'var(--warm-white)',
                    border: '1px solid var(--light-line)', textAlign: 'center',
                  }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(24px, 3vw, 38px)', fontWeight: 300, color: 'var(--forest)', marginBottom: 6 }}>
                      {s.value}
                    </div>
                    <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--stone)' }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
              <blockquote style={{
                borderLeft: '2px solid var(--sand)', paddingLeft: 24,
                fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 300,
                fontStyle: 'italic', color: 'var(--forest)', lineHeight: 1.55,
              }}>
                &ldquo;Every piece we offer has a provenance, a maker, and a passport.&rdquo;
              </blockquote>
              <div style={{ marginTop: 32, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--stone)' }}>
                Est. London · 2026
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      <section style={{ padding: 'clamp(56px, 7vw, 80px) 0', background: 'var(--warm-white)', borderTop: '1px solid var(--light-line)' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
            <div>
              <div className="label label-sage" style={{ marginBottom: 12 }}>The Edit</div>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px, 3vw, 40px)', fontWeight: 300, color: 'var(--forest)', letterSpacing: '-0.01em' }}>
                A hand-selected gallery of<br />
                <em>silhouettes and textures.</em>
              </h2>
            </div>
            <Link href="/products" style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--caramel)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              View all <ArrowRight size={13} strokeWidth={1.5} />
            </Link>
          </div>

          {/* Cities marquee */}
          <div style={{ overflow: 'hidden', marginBottom: 40, borderTop: '1px solid var(--light-line)', borderBottom: '1px solid var(--light-line)', padding: '14px 0' }}>
            <div className="marquee-track">
              <div className="marquee-inner cities">
                {citiesFull.map((city, i) => (
                  <span key={i} style={{
                    display: 'inline-block', fontSize: 11, letterSpacing: '0.22em',
                    textTransform: 'uppercase', color: 'var(--stone)', padding: '0 32px', whiteSpace: 'nowrap',
                  }}>
                    {city}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {featuredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--stone)', fontSize: 14 }}>
              <p>Products coming soon — the Edit is being curated. Check back shortly.</p>
            </div>
          ) : (
            <div className="fba-edit-grid" style={{ gap: 24 }}>
              {featuredProducts.map((p: Record<string, unknown>) => (
                <Link key={p.id as string} href={`/products/${p.slug}`} style={{ textDecoration: 'none' }}>
                  <div style={{ cursor: 'pointer' }}>
                    <div className="img-zoom-wrap" style={{ aspectRatio: '3/4', position: 'relative', background: 'var(--sage-light)', marginBottom: 16 }}>
                      {(p.images as string[])?.[0] ? (
                        <Image src={(p.images as string[])[0]} alt={p.name as string} fill style={{ objectFit: 'cover' }} />
                      ) : (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--stone)', letterSpacing: '0.1em' }}>FBA</span>
                        </div>
                      )}
                      {!!p.is_fba_collection && (
                        <div style={{ position: 'absolute', top: 12, left: 12, background: 'var(--forest)', color: 'var(--sand)', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '4px 8px' }}>
                          FBA Collection
                        </div>
                      )}
                    </div>
                    <div className="label label-sage" style={{ marginBottom: 6 }}>
                      {(p.category as Record<string, string> | null)?.name ?? ''}
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 300, color: 'var(--forest)', marginBottom: 4 }}>
                      {p.name as string}
                    </h3>
                    <p style={{ fontSize: 12, color: 'var(--stone)' }}>
                      by {(p.artisan as Record<string, string> | null)?.name ?? 'Unknown maker'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* THREE PILLARS */}
      <section style={{ padding: 'clamp(56px, 7vw, 80px) 0', position: 'relative', overflow: 'hidden' }}>
        <Image
          src={pillarsSrc}
          alt={pillarsImage.alt || 'Luxury hotel — Full Bloom Artelier'}
          fill
          style={{ objectFit: 'cover', objectPosition: 'center 40%' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(18,30,16,0.80)' }} />
        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div className="label" style={{ color: 'rgba(196,168,130,0.7)', marginBottom: 16 }}>What We Do</div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px, 3vw, 44px)', fontWeight: 300, color: 'var(--cream)', letterSpacing: '-0.01em' }}>
              Three pillars.<br />
              One <em>seamless</em> studio.
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(247,243,238,0.55)', lineHeight: 1.7, maxWidth: 500, margin: '20px auto 0' }}>
              Every service is built to protect your creative vision — from first brief to room-ready installation.
            </p>
          </div>
          <div className="fba-grid-3" style={{ gap: 2 }}>
            {PILLARS.map(pillar => (
              <div key={pillar.num} className="service-strip-card" style={{ padding: '48px 36px' }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 48, fontWeight: 300, color: 'rgba(196,168,130,0.2)', lineHeight: 1, marginBottom: 20 }}>
                  {pillar.num}
                </div>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 300, color: 'var(--cream)', marginBottom: 16 }}>
                  {pillar.title}
                </h3>
                <p style={{ fontSize: 14, color: 'rgba(247,243,238,0.55)', lineHeight: 1.8, marginBottom: 28 }}>
                  {pillar.desc}
                </p>
                <Link href={pillar.href} style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--sand)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {pillar.cta} <ArrowRight size={12} strokeWidth={1.5} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GLOBAL NETWORK */}
      <section style={{ padding: 'clamp(56px, 7vw, 80px) 0', background: 'var(--cream)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div className="label label-sage" style={{ marginBottom: 16 }}>Our Network</div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px, 3vw, 44px)', fontWeight: 300, color: 'var(--forest)', letterSpacing: '-0.01em' }}>
              A global reach,<br />
              held to a <em>London standard.</em>
            </h2>
            <p style={{ fontSize: 15, color: 'var(--stone)', lineHeight: 1.7, maxWidth: 540, margin: '20px auto 0' }}>
              We&apos;ve spent years building relationships with makers who combine artisanal excellence
              with the compliance that UK and international hospitality projects demand.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, marginBottom: 40 }}>
            {regions.map((region, i) => {
              const inner = (
                <div style={{ height: 200, position: 'relative', background: 'var(--sage-light)' }}>
                  {region.img && <Image src={region.img} alt={region.alt || region.label} fill style={{ objectFit: 'cover' }} />}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(26,43,24,0.75) 0%, transparent 60%)' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 20px 18px' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cream)', marginBottom: 3 }}>{region.label}</div>
                    <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'rgba(196,168,130,0.75)' }}>{region.desc}</div>
                  </div>
                </div>
              )
              return (
                <div key={`${region.label}-${i}`} style={{ position: 'relative', overflow: 'hidden' }}>
                  {region.href
                    ? <Link href={region.href} style={{ display: 'block' }}>{inner}</Link>
                    : inner}
                </div>
              )
            })}
          </div>

          <div className="fba-grid-2" style={{ background: 'var(--forest)', padding: '48px 56px', gap: 40, alignItems: 'center' }}>
            <div>
              <div className="label" style={{ color: 'rgba(196,168,130,0.7)', marginBottom: 16 }}>Technical Passport™</div>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(22px, 2.5vw, 32px)', fontWeight: 300, color: 'var(--cream)', lineHeight: 1.3, marginBottom: 16 }}>
                Every piece is vetted<br />before it enters your project.
              </h3>
              <Link href="/about" style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--sand)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                Learn how it works <ArrowRight size={12} strokeWidth={1.5} />
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {PASSPORT_BULLETS.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                  borderBottom: i < PASSPORT_BULLETS.length - 1 ? '1px solid rgba(196,168,130,0.1)' : 'none',
                }}>
                  <Check size={13} strokeWidth={2} style={{ color: 'var(--sand)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'rgba(247,243,238,0.65)', lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ARTISANS */}
      {artisans.length > 0 && (
        <section style={{ padding: 'clamp(56px, 7vw, 80px) 0', background: 'var(--warm-white)', borderTop: '1px solid var(--light-line)' }}>
          <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40 }}>
              <div>
                <div className="label label-sage" style={{ marginBottom: 12 }}>Our Maker Network</div>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px, 3vw, 40px)', fontWeight: 300, color: 'var(--forest)', letterSpacing: '-0.01em' }}>
                  The artisans behind the work
                </h2>
              </div>
              <Link href="/artisans" style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--caramel)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                Meet them all <ArrowRight size={13} strokeWidth={1.5} />
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
              {artisans.map((a: Record<string, unknown>) => (
                <Link key={a.id as string} href={`/artisans/${a.slug}`} style={{ textDecoration: 'none' }}>
                  <div className="hover-lift" style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', overflow: 'hidden' }}>
                    <div style={{ height: 220, position: 'relative', background: 'var(--sage-light)' }}>
                      {!!a.profile_image && (
                        <Image src={a.profile_image as string} alt={a.name as string} fill style={{ objectFit: 'cover' }} />
                      )}
                    </div>
                    <div style={{ padding: '24px 24px 28px' }}>
                      <div className="label label-sage" style={{ marginBottom: 8 }}>{(a.location as string) ?? 'Studio'}</div>
                      <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 300, color: 'var(--forest)', marginBottom: 10 }}>
                        {a.name as string}
                      </h3>
                      {!!a.short_bio && (
                        <p style={{
                          fontSize: 13, color: 'var(--stone)', lineHeight: 1.65,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                        }}>
                          {a.short_bio as string}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* JOURNAL */}
      {journalPosts.length > 0 && (
        <section style={{ padding: 'clamp(56px, 7vw, 80px) 0', background: 'var(--cream)', borderTop: '1px solid var(--light-line)' }}>
          <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40 }}>
              <div>
                <div className="label label-sage" style={{ marginBottom: 12 }}>Thinking &amp; Making</div>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px, 3vw, 40px)', fontWeight: 300, color: 'var(--forest)', letterSpacing: '-0.01em' }}>
                  The Journal
                </h2>
              </div>
              <Link href="/journal" style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--caramel)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                All posts <ArrowRight size={13} strokeWidth={1.5} />
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
              {journalPosts.map((post: Record<string, unknown>) => (
                <Link key={post.id as string} href={`/journal/${post.slug}`} style={{ textDecoration: 'none' }}>
                  <article>
                    <div className="img-zoom-wrap" style={{ height: 220, position: 'relative', background: 'var(--sage-light)', marginBottom: 20 }}>
                      {!!post.featured_image && (
                        <Image src={post.featured_image as string} alt={post.title as string} fill style={{ objectFit: 'cover' }} />
                      )}
                    </div>
                    {!!post.category && (
                      <div className="label label-sage" style={{ marginBottom: 8 }}>{post.category as string}</div>
                    )}
                    <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 300, color: 'var(--forest)', marginBottom: 10, lineHeight: 1.3 }}>
                      {post.title as string}
                    </h3>
                    {!!post.excerpt && (
                      <p style={{
                        fontSize: 13, color: 'var(--stone)', lineHeight: 1.65, marginBottom: 12,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                      }}>
                        {post.excerpt as string}
                      </p>
                    )}
                    {!!post.published_at && (
                      <time style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--stone)', textTransform: 'uppercase' }}>
                        {new Date(post.published_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </time>
                    )}
                  </article>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FOUNDER STRIP */}
      {f.show_on_home !== false && (
      <section style={{ background: 'var(--warm-white)', borderTop: '1px solid var(--light-line)', borderBottom: '1px solid var(--light-line)', padding: 'clamp(48px, 5vw, 64px) 0' }}>
        <div className="container">
          <div className={f.show_image ? 'fba-grid-img-text' : undefined} style={{ display: 'grid', gap: 56, alignItems: 'center' }}>
            {f.show_image && (
              <div style={{ position: 'relative', aspectRatio: '3/4', overflow: 'hidden' }}>
                <Image src="/images/founder.jpeg" alt={f.name + ', Founder'} fill style={{ objectFit: 'cover', objectPosition: 'center top' }} />
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--stone)', marginBottom: 8 }}>
                {f.title}
              </div>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(24px, 3vw, 38px)', fontWeight: 300, color: 'var(--forest)', letterSpacing: '-0.01em', marginBottom: 20 }}>
                {f.name}
              </h2>
              {f.bio && (
                <p style={{ fontSize: 15, color: 'var(--stone)', lineHeight: 1.85, marginBottom: 20, maxWidth: 600 }}>
                  {f.bio}
                </p>
              )}
              {f.tags && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
                  {f.tags.split(',').map(tag => tag.trim()).filter(Boolean).map(tag => (
                    <span key={tag} className="badge badge-sage">{tag}</span>
                  ))}
                </div>
              )}
              <Link href="/about" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>About the studio <ArrowRight size={14} strokeWidth={1.5} /></Link>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* TRADE BANNER */}
      {!isTradeOrAdmin && (
        <section style={{ background: 'var(--forest)', padding: 'clamp(48px, 5vw, 64px) 0' }}>
          <div className="container" style={{ maxWidth: 800, textAlign: 'center' }}>
            <div className="label" style={{ color: 'rgba(196,168,130,0.7)', marginBottom: 16 }}>Trade professionals</div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(26px, 3vw, 40px)', fontWeight: 300, color: 'var(--cream)', marginBottom: 20, letterSpacing: '-0.01em' }}>
              Access trade pricing &amp; exclusive sourcing
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(247,243,238,0.6)', lineHeight: 1.75, marginBottom: 36 }}>
              Interior designers, architects and property developers can apply for a trade account —
              unlocking net pricing, dedicated procurement support, and priority access to new arrivals.
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/trade/apply" className="btn btn-sand">Apply for Trade Access</Link>
              <Link href="/about" className="btn btn-outline-light">How it works</Link>
            </div>
          </div>
        </section>
      )}

      {/* ENQUIRY FORM */}
      <section id="enquiry" style={{ padding: 'clamp(56px, 7vw, 80px) 0', background: isTradeOrAdmin ? 'var(--forest)' : 'var(--warm-white)' }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: isTradeOrAdmin ? 'rgba(196,168,130,0.7)' : 'var(--caramel)', marginBottom: 16 }}>
              Work With Us
            </div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(28px, 3vw, 44px)', fontWeight: 300, color: isTradeOrAdmin ? 'var(--cream)' : 'var(--forest)', letterSpacing: '-0.01em', marginBottom: 16 }}>
              Ready to source<br />
              <em>without</em> compromise?
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.75, color: isTradeOrAdmin ? 'rgba(247,243,238,0.6)' : 'var(--stone)' }}>
              Full Bloom Artelier works exclusively with interior designers, architects, and hospitality
              developers on a trade basis. Every enquiry receives a personal response within 48 hours.
            </p>
          </div>
          <HomepageEnquiryForm dark={!!isTradeOrAdmin} />
        </div>
      </section>

    </div>
  )
}
