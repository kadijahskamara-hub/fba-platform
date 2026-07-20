import type { Metadata } from 'next'
import LegalPageShell from '@/components/LegalPageShell'

export const metadata: Metadata = {
  title: 'Terms of Use',
  alternates: { canonical: '/terms' },
  description:
    'The terms governing use of the Full Bloom Artelier website, including acceptable use, intellectual property, and limits of liability.',
  // SCAFFOLD — remove this line once the finalised terms are published.
  robots: { index: false, follow: true },
}

export default function TermsPage() {
  return (
    <LegalPageShell
      eyebrow="Legal"
      title="Terms of"
      titleEmphasis="use."
      intro="The terms on which you may use this website. Separate terms apply to purchases and to trade accounts — these are published alongside this document."
      inPreparation
      sections={[
        { heading: 'About us and how to contact us' },
        { heading: 'By using our site you accept these terms' },
        { heading: 'Changes to these terms and to our site' },
        { heading: 'Your account and password' },
        { heading: 'Acceptable use of the site' },
        { heading: 'Intellectual property rights' },
        { heading: 'Product imagery, specifications and availability' },
        { heading: 'Our liability for loss or damage' },
        { heading: 'Linking to our site and third-party links' },
        { heading: 'Terms of sale — consumer purchases' },
        { heading: 'Terms of sale — trade and commercial accounts' },
        { heading: 'Governing law and jurisdiction' },
      ]}
    />
  )
}
