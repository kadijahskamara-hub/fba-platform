import type { Metadata } from 'next'
import LegalPageShell from '@/components/LegalPageShell'

export const metadata: Metadata = {
  title: 'Cookie Policy',
  alternates: { canonical: '/cookies' },
  description:
    'The cookies Full Bloom Artelier sets, what each is used for, and how to control them in your browser.',
  // SCAFFOLD — remove this line once the finalised policy is published.
  robots: { index: false, follow: true },
}

export default function CookiesPage() {
  return (
    <LegalPageShell
      eyebrow="Legal"
      title="Cookie"
      titleEmphasis="policy."
      intro="The cookies this site sets, what each one does, and how you can control them."
      inPreparation
      sections={[
        { heading: 'What cookies are' },
        { heading: 'Strictly necessary cookies we set' },
        { heading: 'Cookies set by our payment provider' },
        { heading: 'Analytics and tracking' },
        { heading: 'How to control and delete cookies' },
        { heading: 'Changes to this policy' },
      ]}
    />
  )
}
