import type { Metadata } from 'next'
import LegalPageShell from '@/components/LegalPageShell'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  alternates: { canonical: '/privacy' },
  description:
    'How Full Bloom Artelier collects, uses, stores and protects personal data, and the rights available to you under UK data protection law.',
  // SCAFFOLD — remove this line once the finalised policy is published.
  robots: { index: false, follow: true },
}

export default function PrivacyPage() {
  return (
    <LegalPageShell
      eyebrow="Legal"
      title="Privacy"
      titleEmphasis="policy."
      intro="How we collect, use and protect your personal data — and the rights you hold over it under UK data protection law."
      inPreparation
      sections={[
        { heading: 'Who we are and how to contact us' },
        { heading: 'The personal data we collect' },
        { heading: 'How we collect your data' },
        { heading: 'Why we use your data and our lawful basis' },
        { heading: 'Who we share your data with' },
        { heading: 'Service providers and international transfers' },
        { heading: 'How long we keep your data' },
        { heading: 'How we keep your data secure' },
        { heading: 'Your rights under UK GDPR' },
        { heading: 'Marketing and your right to opt out' },
        { heading: 'Cookies and similar technologies' },
        { heading: 'Complaints and the Information Commissioner' },
        { heading: 'Changes to this policy' },
      ]}
    />
  )
}
