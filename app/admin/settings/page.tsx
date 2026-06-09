import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { getFlags } from '@/lib/flags'
import { LaunchControlsPanel } from './LaunchControlsPanel'
import { HeroImageUploader } from '@/components/admin/HeroImageUploader'
import { FounderSettingsPanel } from '@/components/admin/FounderSettingsPanel'
import { HomeHeroSettingsPanel } from '@/components/admin/HomeHeroSettingsPanel'

export const metadata = { title: 'Studio Settings' }

async function getRegionSettings() {
  const { data } = await supabaseAdmin
    .from('region_settings')
    .select('*')
    .order('country_name')
  return data ?? []
}

async function getHeroImage(key: string, fallbackAlt: string) {
  const { data } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .single()
  const val = data?.value as { url?: string; alt?: string } | null
  return { url: val?.url ?? '', alt: val?.alt ?? fallbackAlt }
}

async function getSetting(key: string) {
  const { data } = await supabaseAdmin.from('site_settings').select('value').eq('key', key).single()
  return (data?.value ?? {}) as Record<string, unknown>
}

export default async function AdminSettingsPage() {
  const [
    regions, flags,
    heroTheEdit, heroHome, heroCollection, heroArtisans, heroJournal, heroAbout,
    founderSettings, homeHeroSettings,
  ] = await Promise.all([
    getRegionSettings(),
    getFlags(),
    getHeroImage('the_edit_hero_image',   'Curated craft and design pieces'),
    getHeroImage('home_hero_image',       'Full Bloom Artelier — Design Procurement Studio'),
    getHeroImage('collection_hero_image', 'The FBA Collection — Limited Edition Pieces'),
    getHeroImage('artisans_hero_image',   'Our artisan maker network'),
    getHeroImage('journal_hero_image',    'FBA Journal — Ideas, process and craft'),
    getHeroImage('about_hero_image',      'About Full Bloom Artelier'),
    getSetting('founder_settings'),
    getSetting('home_hero_settings'),
  ])

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Studio Settings</h1>
          <p className="admin-subtitle">Platform configuration and regional settings</p>
        </div>
        <Link href="/admin/settings/staff" className="btn btn-secondary btn-sm">
          Staff &amp; Permissions →
        </Link>
      </div>

      {/* Launch Controls */}
      <LaunchControlsPanel initialFlags={flags} />

      {/* Studio info */}
      <div style={{
        background: 'var(--warm-white)', border: '1px solid var(--light-line)',
        padding: 32, marginBottom: 24,
      }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 300, marginBottom: 24 }}>
          Studio Information
        </h2>
        <div className="form-row" style={{ marginBottom: 20 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Studio Name</label>
            <input className="form-input" defaultValue="Full Bloom Artelier" readOnly style={{ background: 'var(--sage-light)' }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Location</label>
            <input className="form-input" defaultValue="London, United Kingdom" readOnly style={{ background: 'var(--sage-light)' }} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Contact Email</label>
            <input className="form-input" defaultValue="info@fullbloom.uk.com" readOnly style={{ background: 'var(--sage-light)' }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Domain</label>
            <input className="form-input" defaultValue="fullbloom.uk.com" readOnly style={{ background: 'var(--sage-light)' }} />
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--stone)', marginTop: 12 }}>
          Studio details are managed via environment configuration. Contact your developer to update these values.
        </p>
      </div>

      {/* Regional settings */}
      <div style={{
        background: 'var(--warm-white)', border: '1px solid var(--light-line)',
        padding: 32, marginBottom: 24,
      }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 300, marginBottom: 8 }}>
          Regional Settings
        </h2>
        <p style={{ fontSize: 14, color: 'var(--stone)', marginBottom: 24 }}>
          Active shipping regions and currency configuration.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Country</th>
              <th>Code</th>
              <th>Currency</th>
              <th>Language</th>
              <th>Active</th>
              <th>Shipping Note</th>
            </tr>
          </thead>
          <tbody>
            {regions.map((r: Record<string, unknown>) => (
              <tr key={r.id as string}>
                <td style={{ fontWeight: 500 }}>{r.country_name as string}</td>
                <td style={{ fontSize: 12, color: 'var(--stone)', letterSpacing: '0.05em' }}>
                  {r.country_code as string}
                </td>
                <td>
                  <span className="badge badge-sage">{r.currency as string}</span>
                </td>
                <td style={{ fontSize: 13, color: 'var(--stone)' }}>{r.language as string ?? '—'}</td>
                <td>
                  <span className={`status-pill ${r.is_active ? 'status-approved' : 'status-revoked'}`}>
                    {r.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--stone)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.shipping_message as string ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { title: 'Staff & Permissions', desc: 'Manage admin and staff user access levels.', href: '/admin/settings/staff', icon: '🔒' },
          { title: 'Product Categories',  desc: 'View and manage the product taxonomy.',      href: '/admin/products',        icon: '🗂' },
          { title: 'Database Schema',     desc: 'View the Supabase project configuration.',   href: 'https://supabase.com',   icon: '🗄', external: true },
        ].map(card => (
          <Link key={card.title} href={card.href} target={(card as { external?: boolean }).external ? '_blank' : undefined} style={{ textDecoration: 'none' }}>
            <div className="stat-card hover-lift-sm" style={{ padding: '24px 28px' }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>{card.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 500, color: 'var(--forest)', marginBottom: 6 }}>{card.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--stone)', lineHeight: 1.6 }}>{card.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Homepage Hero CMS ────────────────────────────── */}
      <div className="admin-section" style={{ marginTop: 40 }}>
        <div className="stat-card" style={{ padding: '28px 32px' }}>
          <HomeHeroSettingsPanel initialValue={homeHeroSettings as Parameters<typeof HomeHeroSettingsPanel>[0]['initialValue']} />
        </div>
      </div>

      {/* ── Page Appearance ───────────────────────────────── */}
      <div className="admin-section" style={{ marginTop: 48 }}>
        <h2 className="admin-section-title" style={{ marginBottom: 8 }}>Page Appearance</h2>
        <p style={{ fontSize: 13, color: 'var(--stone)', marginBottom: 28 }}>
          Upload a hero image for each page. A dark green tint is applied automatically. Recommended: 1600×600px minimum, landscape, JPG/PNG/WebP, max 8 MB.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>

          <div className="stat-card" style={{ padding: '28px 32px' }}>
            <HeroImageUploader pageKey="the_edit_hero_image"   label="The Edit"       initialValue={heroTheEdit} />
          </div>

          <div className="stat-card" style={{ padding: '28px 32px' }}>
            <HeroImageUploader pageKey="collection_hero_image" label="FBA Collection" initialValue={heroCollection} />
          </div>

          <div className="stat-card" style={{ padding: '28px 32px' }}>
            <HeroImageUploader pageKey="artisans_hero_image"   label="Artisans"       initialValue={heroArtisans} />
          </div>

          <div className="stat-card" style={{ padding: '28px 32px' }}>
            <HeroImageUploader pageKey="journal_hero_image"    label="Journal"        initialValue={heroJournal} />
          </div>

          <div className="stat-card" style={{ padding: '28px 32px' }}>
            <HeroImageUploader pageKey="about_hero_image"      label="About"          initialValue={heroAbout} />
          </div>

        </div>
      </div>

      {/* ── Founder Section ───────────────────────────────── */}
      <div className="admin-section" style={{ marginTop: 40 }}>
        <div className="stat-card" style={{ padding: '28px 32px' }}>
          <FounderSettingsPanel initialValue={founderSettings as Parameters<typeof FounderSettingsPanel>[0]['initialValue']} />
        </div>
      </div>
    </>
  )
}
