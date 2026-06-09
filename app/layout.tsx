import type { Metadata } from 'next'
import './globals.css'
import { Nav } from '@/components/Nav'
import { Footer } from '@/components/Footer'
import { MobileOverlay } from '@/components/MobileOverlay'
import { getSession } from '@/lib/auth'
import { getFlags } from '@/lib/flags'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fullbloom.uk.com'),
  title: {
    default: 'Full Bloom Artelier — Luxury Furniture, Trade Procurement & Design Sourcing, London',
    template: '%s — Full Bloom Artelier',
  },
  description: 'London-based design procurement studio and artisan product platform. Trade accounts, FF&E sourcing, retail and bespoke atelier pieces for interior designers, architects and hospitality developers.',
  keywords: [
    'contract furniture supplier London',
    'trade furniture supplier London',
    'FF&E procurement London',
    'luxury furniture procurement',
    'artisan furniture supplier',
    'interior designer furniture sourcing',
    'bespoke furniture sourcing',
    'furniture supplier for interior designers',
    'furniture procurement for architects',
    'Full Bloom Artelier',
  ],
  openGraph: {
    siteName:  'Full Bloom Artelier',
    locale:    'en_GB',
    type:      'website',
    images: ['/images/og-default.jpg'],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@fullbloomartelier',
  },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [session, flags] = await Promise.all([getSession(), getFlags()])

  return (
    <html lang="en">
      <body>
        <Nav session={session} flags={flags} />
        <MobileOverlay session={session} />
        <main>
          {children}
          <Footer />
        </main>
      </body>
    </html>
  )
}
