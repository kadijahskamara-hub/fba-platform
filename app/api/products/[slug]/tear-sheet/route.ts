import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/products/:slug/tear-sheet
// One- or two-page A4 product tear sheet as a real PDF (jsPDF).
// The product image is fetched and transcoded to JPEG via sharp, cover-
// cropped to the frame's aspect ratio so it matches the website card
// (object-fit: cover) and never distorts.

export const runtime = 'nodejs'

type RGB = [number, number, number]
const forest:  RGB = [26, 43, 24]
const caramel: RGB = [163, 112, 67]
const stone:   RGB = [158, 149, 137]
const ink:     RGB = [38, 32, 28]
const line:    RGB = [228, 234, 227]

const W = 210, H = 297, margin = 20
const IMG_W = 78, IMG_H = 98 // frame ratio ≈ 4:5, matches the site card

// Fetch a remote image and return base64 JPEG cover-cropped to the frame
// (or null on any failure). Any source format (WebP/AVIF/PNG/JPEG) works.
async function fetchCoverJpeg(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) })
    if (!res.ok) return null
    const input = Buffer.from(await res.arrayBuffer())
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp')
    const out = await sharp(input)
      .rotate() // honour EXIF orientation
      .resize(Math.round(IMG_W * 10), Math.round(IMG_H * 10), { fit: 'cover', position: 'centre' })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82 })
      .toBuffer()
    return out.toString('base64')
  } catch {
    return null
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const params = await ctx.params
  const { data: productRow } = await supabase
    .from('products')
    .select(`
      *, artisan:artisans(name, location),
      specifications:product_specifications(*),
      category:categories(name),
      finishes:product_finishes(finish_name, finish_category, material, colour),
      variants:product_variants(variant_name)
    `)
    .eq('slug', params.slug)
    .eq('visibility', 'published').is('archived_at', null).is('deleted_at', null)
    .single()

  if (!productRow) return new NextResponse('Product not found', { status: 404 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const product: any = productRow

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const specs: any = product.specifications ?? {}
  const imgUrl: string | undefined = product.images?.[0]
  const image = imgUrl ? await fetchCoverJpeg(imgUrl) : null
  const isLighting = (product.category?.name ?? '').toLowerCase().includes('light')

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { jsPDF } = require('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

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
  const imgX = margin, imgY = 44
  if (image) {
    try { doc.addImage(image, 'JPEG', imgX, imgY, IMG_W, IMG_H) }
    catch { placeholder(doc, imgX, imgY) }
  } else {
    placeholder(doc, imgX, imgY)
  }

  // ── Primary details (right column) ───────────────────────
  const cx = margin + 90 // 110
  const colW = W - margin - cx
  let ry = imgY + 4

  if (product.category?.name) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...caramel); doc.setCharSpace(1.1)
    doc.text(String(product.category.name).toUpperCase(), cx, ry); doc.setCharSpace(0)
    ry += 6
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(19); doc.setTextColor(...forest)
  const nameLines = doc.splitTextToSize(String(product.name), colW)
  doc.text(nameLines, cx, ry); ry += nameLines.length * 8 + 1

  if (product.artisan && product.public_brand_visible !== false) {
    const a = product.artisan.location ? `${product.artisan.name} · ${product.artisan.location}` : product.artisan.name
    doc.setFontSize(8.5); doc.setTextColor(...stone)
    doc.text(doc.splitTextToSize(String(a), colW), cx, ry); ry += 6
  }
  if (product.reference_code || product.sku) {
    doc.setFontSize(7.5); doc.setTextColor(...stone); doc.setCharSpace(0.8)
    doc.text(`REF: ${String(product.reference_code ?? product.sku).toUpperCase()}`, cx, ry); doc.setCharSpace(0)
    ry += 6
  }

  const shortDesc = String(product.short_description ?? '').replace(/\s+/g, ' ').trim()
  if (shortDesc) {
    doc.setFontSize(9.5); doc.setTextColor(...ink); doc.setLineHeightFactor(1.5)
    const dl = doc.splitTextToSize(shortDesc.substring(0, 340), colW)
    doc.text(dl, cx, ry); ry += dl.length * 5 + 4
    doc.setLineHeightFactor(1.15)
  }

  // Key facts beside the image
  const keyFacts: [string, string][] = []
  const kf = (l: string, v: unknown) => { if (v !== null && v !== undefined && v !== '' && v !== false) keyFacts.push([l, String(v)]) }
  kf('Dimensions', specs.dimensions_summary)
  kf('Material', specs.material)
  kf('Lead time', product.lead_time)
  kf('Made to order', product.made_to_order ? 'Yes' : '')
  kf('Origin', product.shipping_origin)
  ry = renderRows(doc, keyFacts, cx, ry, colW, 26)

  // ── Full-width sections below the top block ──────────────
  let y = Math.max(ry, imgY + IMG_H) + 10

  // Full specification
  const full: [string, string][] = []
  const sp = (l: string, v: unknown) => { if (v !== null && v !== undefined && v !== '' && v !== false) full.push([l, String(v)]) }
  sp('Width', specs.width_mm ? `${specs.width_mm} mm` : '')
  sp('Depth', specs.depth_mm ? `${specs.depth_mm} mm` : '')
  sp('Height', specs.height_mm ? `${specs.height_mm} mm` : '')
  sp('Seat height', specs.seat_height_mm ? `${specs.seat_height_mm} mm` : '')
  sp('Diameter', specs.diameter_mm ? `${specs.diameter_mm} mm` : '')
  sp('Weight', specs.weight_kg ? `${specs.weight_kg} kg` : '')
  sp('Material', specs.material)
  sp('Finish', specs.finish)
  sp('Fabric', specs.fabric)
  sp('COM', specs.com_available ? 'Available' : '')
  sp('Care', specs.care_instructions)
  if (isLighting) { sp('Bulb type', specs.bulb_type); sp('Wattage', specs.wattage); sp('Voltage', specs.voltage); sp('Dimmable', typeof specs.dimmable === 'boolean' ? (specs.dimmable ? 'Yes' : 'No') : '') }
  sp('IP rating', specs.ip_rating)

  if (full.length) {
    y = sectionHead(doc, 'Full Specification', y)
    y = renderTwoCol(doc, full, y)
  }

  // Materials & finishes
  const finishes = (product.finishes ?? []) as Array<{ finish_name: string; material?: string; colour?: string }>
  if (finishes.length && product.hide_finish_options !== true) {
    y = sectionHead(doc, 'Materials & Finishes', y)
    const names = finishes.map(f => [f.finish_name, f.material, f.colour].filter(Boolean).join(' · ')).filter(Boolean)
    y = renderWrapText(doc, names.join('   ·   '), y)
  }

  // Sizes / variants
  const variants = (product.variants ?? []) as Array<{ variant_name: string }>
  if (variants.length > 1) {
    y = sectionHead(doc, 'Sizes', y)
    y = renderWrapText(doc, variants.map(v => v.variant_name).filter(Boolean).join('   ·   '), y)
  }

  // Technical description
  const techDesc = String(product.technical_description ?? product.description ?? '').replace(/\r?\n+/g, '\n').trim()
  if (techDesc && techDesc !== shortDesc) {
    y = sectionHead(doc, 'Technical Description', y)
    y = renderWrapText(doc, techDesc, y)
  }

  // Technical Passport
  if (specs.technical_notes) {
    y = sectionHead(doc, 'Technical Passport™', y)
    y = renderWrapText(doc, String(specs.technical_notes), y)
  }

  // Customisation & delivery
  const cust = String(product.customisation_note ?? '').trim()
  const ship = String(product.shipping_notes ?? '').trim()
  if (cust || ship) {
    y = sectionHead(doc, 'Customisation & Delivery', y)
    if (cust) y = renderWrapText(doc, cust, y)
    if (ship) y = renderWrapText(doc, ship, y)
  }

  // ── Footer on every page ─────────────────────────────────
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(...stone); doc.setLineWidth(0.2); doc.line(margin, 285, W - margin, 285)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...stone)
    doc.text('Full Bloom Artelier · fullbloom.uk.com · info@fullbloom.uk.com', margin, 291)
    doc.text('Confidential — for client use only', W - margin, 291, { align: 'right' })
  }

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

// ── helpers (doc is jsPDF, typed any via require) ──────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function placeholder(doc: any, x: number, y: number) {
  doc.setFillColor(...line); doc.rect(x, y, IMG_W, IMG_H, 'F')
  doc.setFontSize(8); doc.setTextColor(...stone)
  doc.text('Image on request', x + IMG_W / 2, y + IMG_H / 2, { align: 'center' })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderRows(doc: any, rows: [string, string][], x: number, y: number, width: number, labelW: number): number {
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...stone); doc.setCharSpace(0.4)
    doc.text(label.toUpperCase(), x, y); doc.setCharSpace(0)
    doc.setFontSize(9); doc.setTextColor(...ink)
    const vLines = doc.splitTextToSize(value, width - labelW)
    doc.text(vLines, x + labelW, y)
    const rh = Math.max(vLines.length * 4.6, 6)
    doc.setDrawColor(...line); doc.setLineWidth(0.2); doc.line(x, y + rh - 3, x + width, y + rh - 3)
    y += rh
  }
  return y
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureSpace(doc: any, y: number, needed: number): number {
  if (y + needed > H - 20) { doc.addPage(); return 30 }
  return y
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sectionHead(doc: any, title: string, y: number): number {
  y = ensureSpace(doc, y, 14)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...forest); doc.setCharSpace(0.6)
  doc.text(title.toUpperCase(), margin, y); doc.setCharSpace(0)
  doc.setDrawColor(...forest); doc.setLineWidth(0.3); doc.line(margin, y + 2, W - margin, y + 2)
  return y + 8
}

// Two-column label/value grid, full width.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderTwoCol(doc: any, rows: [string, string][], y: number): number {
  const colW = (W - margin * 2 - 8) / 2
  const half = Math.ceil(rows.length / 2)
  y = ensureSpace(doc, y, half * 6 + 4)
  const left = rows.slice(0, half), right = rows.slice(half)
  let yl = y, yr = y
  yl = renderRows(doc, left, margin, yl, colW, 30)
  if (right.length) yr = renderRows(doc, right, margin + colW + 8, yr, colW, 30)
  return Math.max(yl, yr) + 4
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderWrapText(doc: any, text: string, y: number): number {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...ink); doc.setLineHeightFactor(1.5)
  const lines = doc.splitTextToSize(text, W - margin * 2)
  for (const ln of lines) {
    y = ensureSpace(doc, y, 5)
    doc.text(ln, margin, y)
    y += 5
  }
  doc.setLineHeightFactor(1.15)
  return y + 3
}
