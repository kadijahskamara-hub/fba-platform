import { NextResponse } from 'next/server'

// GET /api/trade/application-form.pdf
// Generates a trade applicant information pack using jsPDF.
// jsPDF is a CommonJS module — import via require to avoid ESM issues in Next.js.

export const runtime = 'nodejs'

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { jsPDF } = require('jspdf')

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const W = 210
  const margin = 20

  // ── Palette ──────────────────────────────────────────────
  const forest:  [number,number,number] = [26,  43,  24]
  const caramel: [number,number,number] = [163, 112, 67]
  const stone:   [number,number,number] = [158, 149, 137]
  const ink:     [number,number,number] = [38,  32,  28]
  const cream:   [number,number,number] = [253, 250, 247]

  // ── Cover page ───────────────────────────────────────────
  doc.setFillColor(...forest)
  doc.rect(0, 0, W, 297, 'F')

  // Wordmark
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(28)
  doc.setTextColor(253, 250, 247)
  doc.setCharSpace(3)
  doc.text('Full Bloom Artelier', margin, 80)
  doc.setCharSpace(0)

  // Subtitle
  doc.setFontSize(11)
  doc.setTextColor(...caramel)
  doc.setCharSpace(2)
  doc.text('TRADE PROGRAMME', margin, 94)
  doc.setCharSpace(0)

  // Rule
  doc.setDrawColor(...caramel)
  doc.setLineWidth(0.4)
  doc.line(margin, 102, W - margin, 102)

  // Tagline
  doc.setFontSize(16)
  doc.setTextColor(253, 250, 247)
  doc.setFont('times', 'italic')
  doc.text('Access. Intelligence. Partnership.', margin, 118)
  doc.setFont('helvetica', 'normal')

  // Body intro
  doc.setFontSize(10)
  doc.setTextColor(210, 205, 198)
  doc.setLineHeightFactor(1.6)
  const intro = doc.splitTextToSize(
    'Full Bloom Artelier is a London-based design procurement studio connecting ' +
    'interior designers, architects and hospitality developers with the world\'s finest ' +
    'hand-vetted makers. Our Trade Programme is designed for professionals who demand ' +
    'precision, compliance and exceptional craft at scale.',
    W - margin * 2
  )
  doc.text(intro, margin, 138)

  // Footer rule
  doc.setDrawColor(255, 255, 255, 0.2)
  doc.setLineWidth(0.2)
  doc.line(margin, 265, W - margin, 265)

  doc.setFontSize(9)
  doc.setTextColor(...stone)
  doc.text('fullbloom.uk.com  ·  info@fullbloom.uk.com  ·  London, UK', margin, 272)

  // ── Page 2 — About the programme ─────────────────────────
  doc.addPage()
  doc.setFillColor(...cream)
  doc.rect(0, 0, W, 297, 'F')

  let y = 32

  const sectionHeader = (text: string) => {
    doc.setFillColor(...forest)
    doc.rect(margin, y, W - margin * 2, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(253, 250, 247)
    doc.setCharSpace(1.5)
    doc.text(text.toUpperCase(), margin + 4, y + 5.5)
    doc.setCharSpace(0)
    y += 14
  }

  const para = (text: string, indent = 0) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...ink)
    doc.setLineHeightFactor(1.55)
    const lines = doc.splitTextToSize(text, W - margin * 2 - indent)
    doc.text(lines, margin + indent, y)
    y += lines.length * 5.5 + 4
  }

  const bullet = (text: string) => {
    doc.setFillColor(...caramel)
    doc.circle(margin + 2, y - 1, 0.9, 'F')
    para(text, 6)
    y -= 2
  }

  // Wordmark small
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(13)
  doc.setTextColor(...forest)
  doc.setCharSpace(1.5)
  doc.text('Full Bloom Artelier', margin, y)
  doc.setCharSpace(0)
  doc.setFontSize(9)
  doc.setTextColor(...caramel)
  doc.setCharSpace(2)
  doc.text('TRADE PROGRAMME', margin, y + 7)
  doc.setCharSpace(0)
  y += 22

  sectionHeader('What is the Trade Programme?')
  para(
    'Our Trade Programme gives approved studios and designers access to exclusive trade pricing, ' +
    'early access to new maker partnerships, project folder management tools, and a dedicated ' +
    'studio contact for all procurement queries.'
  )

  sectionHeader('Who is eligible?')
  bullet('Interior designers and design studios — residential and commercial')
  bullet('Architects with active FF&E procurement requirements')
  bullet('Hospitality developers and operators')
  bullet('Property developers with specification and interior design departments')
  bullet('Purchasing agents working on behalf of qualifying principals')
  y += 4

  sectionHeader('What you receive')
  bullet('Trade pricing across the full Edit — typically 15–25% below retail')
  bullet('FF&E project folders with live budgeting and PDF schedule export')
  bullet('Technical Passport™ documentation for every product')
  bullet('Dedicated studio contact and lead time management')
  bullet('Early access to new maker introductions and exclusive pieces')
  bullet('Single invoice, single point of contact — regardless of maker')
  y += 4

  sectionHeader('The Technical Passport™')
  para(
    'Every product in the Full Bloom Artelier Edit carries a pre-completed compliance ' +
    'dossier: Crib 5 fire rating certification, kiln-dried timber specification, ISTA 3A ' +
    'packaging compliance, shop drawings to ±2mm tolerance, Golden Sample sign-off ' +
    'protocol, and ETI supply chain compliance. This is our commitment to zero surprises ' +
    'on site.'
  )

  // ── Page 3 — Application process & checklist ─────────────
  doc.addPage()
  doc.setFillColor(...cream)
  doc.rect(0, 0, W, 297, 'F')
  y = 32

  // Header
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(13)
  doc.setTextColor(...forest)
  doc.setCharSpace(1.5)
  doc.text('Full Bloom Artelier', margin, y)
  doc.setCharSpace(0)
  doc.setFontSize(9)
  doc.setTextColor(...caramel)
  doc.setCharSpace(2)
  doc.text('APPLICATION CHECKLIST', margin, y + 7)
  doc.setCharSpace(0)
  y += 22

  sectionHeader('Application process')
  const steps = [
    ['Submit your application', 'Complete the online form at fullbloom.uk.com/trade/apply'],
    ['Studio review',           'Our team reviews your application within 3 business days'],
    ['Detailed form',           'Approved applicants receive a detailed onboarding form'],
    ['Account activation',      'Your trade account is activated with pricing visible immediately'],
  ]
  steps.forEach(([title, desc], i) => {
    // Step number circle
    doc.setFillColor(...forest)
    doc.circle(margin + 3.5, y - 1, 3.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(253, 250, 247)
    doc.text(String(i + 1), margin + 3.5, y + 0.5, { align: 'center' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...ink)
    doc.text(title, margin + 10, y)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...stone)
    doc.text(desc, margin + 10, y + 5)
    y += 16
  })
  y += 4

  sectionHeader('What to have ready')
  para('The online application takes approximately 3 minutes. For the detailed onboarding form, please have the following available:')
  y += 2
  const checklist = [
    'Company registration number (if applicable)',
    'VAT registration number',
    'Your company website or portfolio URL',
    'Two trade references (supplier or client)',
    'Estimated annual FF&E spend range',
    'Business address and billing details',
  ]
  checklist.forEach(item => bullet(item))
  y += 8

  sectionHeader('Contact')
  para('To discuss the Trade Programme before applying, or for bespoke procurement enquiries, please reach us at:')
  y += 2
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...caramel)
  doc.text('info@fullbloom.uk.com', margin, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...stone)
  doc.text('fullbloom.uk.com/trade/apply', margin, y)

  // Footer on all pages
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setDrawColor(...stone)
    doc.setLineWidth(0.2)
    doc.line(margin, 285, W - margin, 285)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...stone)
    doc.text('Full Bloom Artelier  ·  Trade Programme', margin, 291)
    doc.text(`${p} / ${totalPages}`, W - margin, 291, { align: 'right' })
  }

  const pdfBuffer = doc.output('arraybuffer') as ArrayBuffer

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': 'attachment; filename="FBA-Trade-Programme.pdf"',
      'Cache-Control':       'public, max-age=86400',
    },
  })
}
