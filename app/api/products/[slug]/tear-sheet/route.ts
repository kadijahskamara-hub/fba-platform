import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/** Escape user-supplied values before interpolating into HTML */
function h(str: unknown): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// GET /api/products/:slug/tear-sheet
// Returns a simple HTML page suitable for printing/PDF.
// The front-end can trigger window.print() or use jsPDF to convert to PDF.
// NOTE: For production, use a headless PDF generator (Puppeteer, WeasyPrint, etc.)

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { data: product } = await supabase
    .from('products')
    .select(`
      *, artisan:artisans(name, location),
      specifications:product_specifications(*),
      category:categories(name)
    `)
    .eq('slug', params.slug)
    .eq('visibility', 'published')
    .single()

  if (!product) {
    return new NextResponse('Product not found', { status: 404 })
  }

  const specs = product.specifications ?? {}
  const img   = product.images?.[0] ?? ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Tear Sheet — ${h(product.name)} — Full Bloom Artelier</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1A2B18; background: #fff; }
  @page { size: A4; margin: 24mm 20mm; }
  .page { max-width: 750px; margin: 0 auto; padding: 40px 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1A2B18; padding-bottom: 20px; margin-bottom: 32px; }
  .logo { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
  .logo-sub { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #7A8C77; margin-top: 3px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 32px; }
  img.main-img { width: 100%; aspect-ratio: 4/5; object-fit: cover; background: #E4EAE3; display: block; }
  h1 { font-size: 28px; font-weight: 300; line-height: 1.2; margin-bottom: 8px; }
  .artisan { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #C4A882; margin-bottom: 16px; }
  .ref { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #9E9589; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 0; border-bottom: 1px solid #E4EAE3; font-size: 12px; }
  td:first-child { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #9E9589; width: 40%; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #DDD5C8; display: flex; justify-content: space-between; font-size: 10px; color: #9E9589; letter-spacing: 0.08em; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="logo">Full Bloom Artelier</div>
      <div class="logo-sub">Design Procurement Studio, London</div>
    </div>
    <div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#9E9589;text-align:right">
      Product Tear Sheet<br>info@fullbloom.uk.com
    </div>
  </div>

  <div class="grid">
    <div>
      ${img ? `<img class="main-img" src="${h(img)}" alt="${h(product.name)}">` : '<div style="aspect-ratio:4/5;background:#E4EAE3"></div>'}
    </div>
    <div>
      ${product.artisan ? `<div class="artisan">${h(product.artisan.name)}${product.artisan.location ? ` · ${h(product.artisan.location)}` : ''}</div>` : ''}
      <h1>${h(product.name)}</h1>
      ${product.reference_code ? `<div class="ref">Ref: ${h(product.reference_code)}</div>` : ''}
      <p style="font-size:13px;line-height:1.7;color:#4A5A47;margin-bottom:24px">${h((product.short_description ?? product.description ?? '').substring(0, 300))}</p>
      <table>
        <tbody>
          ${specs.dimensions_summary ? `<tr><td>Dimensions</td><td>${h(specs.dimensions_summary)}</td></tr>` : ''}
          ${specs.width_mm  ? `<tr><td>Width</td><td>${h(specs.width_mm)}mm</td></tr>` : ''}
          ${specs.depth_mm  ? `<tr><td>Depth</td><td>${h(specs.depth_mm)}mm</td></tr>` : ''}
          ${specs.height_mm ? `<tr><td>Height</td><td>${h(specs.height_mm)}mm</td></tr>` : ''}
          ${specs.material  ? `<tr><td>Material</td><td>${h(specs.material)}</td></tr>` : ''}
          ${specs.finish    ? `<tr><td>Finish</td><td>${h(specs.finish)}</td></tr>` : ''}
          ${specs.fabric    ? `<tr><td>Fabric</td><td>${h(specs.fabric)}</td></tr>` : ''}
          ${specs.com_available ? `<tr><td>COM</td><td>Available</td></tr>` : ''}
          ${product.lead_time   ? `<tr><td>Lead time</td><td>${h(product.lead_time)}</td></tr>` : ''}
          ${product.shipping_origin ? `<tr><td>Origin</td><td>${h(product.shipping_origin)}</td></tr>` : ''}
          ${specs.technical_notes ? `<tr><td>Technical</td><td>${h(specs.technical_notes)}</td></tr>` : ''}
        </tbody>
      </table>
    </div>
  </div>

  <div class="footer">
    <span>Full Bloom Artelier · fullbloom.uk.com · info@fullbloom.uk.com</span>
    <span>This tear sheet is confidential and for client use only</span>
  </div>
</div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="FBA-${product.reference_code ?? product.slug}.html"`,
    },
  })
}
