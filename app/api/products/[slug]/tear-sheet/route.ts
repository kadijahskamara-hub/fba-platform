import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/products/:slug/tear-sheet
// Generates a one-page A4 product tear sheet as a real PDF (jsPDF).
// The product image is fetched and transcoded to JPEG via sharp so any
// source format (WebP/AVIF/PNG/JPEG) embeds reliably.

export const runtime = 'nodejs'

type RGB = [number, number, number]
const forest:  RGB = [26, 43, 24]
const caramel: RGB = [163, 112, 67]
const stone:   RGB = [158, 149, 137]
const ink:     RGB = [38, 32, 28]

// Fetch a remote image and return base64 JPEG (or null on any failure).
async function fetchImageJpeg(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) })
    if (!res.ok) return null
    const input = Buffer.from(await res.arrayBuffer())
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp')
    const out = await sharp(input)
      .rotate() // honour EXIF orientation
      .resize({ width: 900, height: 1200, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }) // drop alpha -> white
      .jpeg({ quality: 82 })
      .toBuffer()
    return out.toString('base64')
  } catch {
    return null
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const params = await ctx.params
  const { data: product } = await supabase
    .from('products')
    .select(`
      *, artisan:artisans(name, location),
      specifications:product_specifications(*),
      category:categories(name)
    `)
    .eq('slug', params.slug)
    .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null)
    .single()

  if (!product) return new NextResponse('Product not found', { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const specs: any = product.specifications ?? {}
  const imgUrl: string | undefined = product.images?.[0]
  const image = imgUrl ? await fetchImageJpeg(imgUrl) : null

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { jsPDF } = require('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const W = 210
  const margin = 20

  // ── Header ───────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...forest)
  doc.text('Full Bloom Artelier', margin, 24)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...stone); doc.setCharSpace(1.4)
  doc.text('DESIGN PROCUREMENT STUDIO, LONDON', margin, 29)
  doc.setCharSpace(0)
  doc.setFontSize(7.5); doc.setTextColor(...stone)
  doc.text('PRODUCT TEAR SHEET', W - margin, 21, { align: 'right' })
  doc.text('info@fullbloom.uk.com', W - margin, 26, { align: 'right' })
  doc.setDrawColor(...forest); doc.setLineWidth(0.5); doc.line(margin, 34, W - margin, 34)

  // ── Image (left column) ──────────────────────────────────
  const imgX = margin, imgY = 44, imgW = 78, imgH = 98
  if (image) {
    try { doc.addImage(image, 'JPEG', imgX, imgY, imgW, imgH) }
    catch { doc.setFillColor(228, 234, 227); doc.rect(imgX, imgY, imgW, imgH, 'F') }
  } else {
    doc.setFillColor(228, 234, 227); doc.rect(imgX, imgY, imgW, imgH, 'F')
    doc.setFontSize(8); doc.setTextColor(...stone)
    doc.text('Image on request', imgX + imgW / 2, imgY + imgH / 2, { align: 'center' })
  }

  // ── Product details (right column) ───────────────────────
  const cx = margin + 90 // 110
  let y = imgY + 4

  if (product.artisan) {
    const a = product.artisan.location
      ? `${product.artisan.name} · ${product.artisan.location}`
      : product.artisan.name
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...caramel); doc.setCharSpace(1.1)
    doc.text(doc.splitTextToSize(String(a).toUpperCase(), W - margin - cx), cx, y)
    doc.setCharSpace(0)
    y += 7
  }

  doc.setFont('helvetica', 'normal'); doc.setFontSize(19); doc.setTextColor(...forest)
  const nameLines = doc.splitTextToSize(String(product.name), W - margin - cx)
  doc.text(nameLines, cx, y)
  y += nameLines.length * 8 + 1

  if (product.reference_code) {
    doc.setFontSize(7.5); doc.setTextColor(...stone); doc.setCharSpace(0.8)
    doc.text(`REF: ${String(product.reference_code).toUpperCase()}`, cx, y)
    doc.setCharSpace(0)
    y += 7
  }

  const desc = String(product.short_description ?? product.description ?? '').replace(/\s+/g, ' ').trim().substring(0, 320)
  if (desc) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...ink); doc.setLineHeightFactor(1.5)
    const dl = doc.splitTextToSize(desc, W - margin - cx)
    doc.text(dl, cx, y)
    y += dl.length * 5 + 5
    doc.setLineHeightFactor(1.15)
  }

  // ── Specifications table (right column) ──────────────────
  const rows: [string, string][] = []
  const add = (label: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== '' && value !== false) rows.push([label, String(value)])
  }
  add('Dimensions', specs.dimensions_summary)
  add('Width', specs.width_mm ? `${specs.width_mm} mm` : '')
  add('Depth', specs.depth_mm ? `${specs.depth_mm} mm` : '')
  add('Height', specs.height_mm ? `${specs.height_mm} mm` : '')
  add('Material', specs.material)
  add('Finish', specs.finish)
  add('Fabric', specs.fabric)
  add('COM', specs.com_available ? 'Available' : '')
  add('Lead time', product.lead_time)
  add('Origin', product.shipping_origin)

  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...stone); doc.setCharSpace(0.5)
    doc.text(label.toUpperCase(), cx, y)
    doc.setCharSpace(0)
    doc.setFontSize(9); doc.setTextColor(...ink)
    const vLines = doc.splitTextToSize(value, W - margin - (cx + 26))
    doc.text(vLines, cx + 26, y)
    const rowH = Math.max(vLines.length * 4.6, 6)
    doc.setDrawColor(228, 234, 227); doc.setLineWidth(0.2)
    doc.line(cx, y + rowH - 3, W - margin, y + rowH - 3)
    y += rowH
  }

  // ── Technical Passport (full width, below both columns) ──
  if (specs.technical_notes) {
    let ty = Math.max(y, imgY + imgH + 10)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...forest); doc.setCharSpace(0.6)
    doc.text('TECHNICAL PASSPORT', margin, ty)
    doc.setCharSpace(0)
    ty += 5
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...ink); doc.setLineHeightFactor(1.5)
    const tn = doc.splitTextToSize(String(specs.technical_notes), W - margin * 2)
    doc.text(tn.slice(0, 12), margin, ty) // cap so it never runs into the footer
    doc.setLineHeightFactor(1.15)
  }

  // ── Footer ───────────────────────────────────────────────
  doc.setDrawColor(...stone); doc.setLineWidth(0.2); doc.line(margin, 285, W - margin, 285)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...stone)
  doc.text('Full Bloom Artelier · fullbloom.uk.com · info@fullbloom.uk.com', margin, 291)
  doc.text('Confidential — for client use only', W - margin, 291, { align: 'right' })

  const pdf = doc.output('arraybuffer') as ArrayBuffer
  const fname = `FBA-${product.reference_code ?? product.slug}.pdf`
  return new NextResponse(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fname}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
