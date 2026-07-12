import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { resolvePrice, formatPrice, canSeeTradePricing } from '@/lib/pricing'

// Node runtime required for the PDF (jsPDF) branch.
export const runtime = 'nodejs'

/**
 * GET /account/projects/:id/export?format=csv|pdf|html
 * FF&E schedule export for a project the current user owns.
 *  - csv  (default): downloadable spreadsheet
 *  - pdf:            generated landscape schedule (jsPDF)
 *  - html:          print-friendly page (browser "Save as PDF")
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Ownership check FIRST — never expose another user's project.
  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, name, location, budget, notes, user_id')
    .eq('id', params.id)
    .eq('user_id', session.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const { data: items } = await supabaseAdmin
    .from('project_items')
    .select(`
      quantity, notes,
      product:products(
        name, sku, reference_code, retail_price, trade_price, price_type, currency,
        visibility, archived_at, deleted_at,
        artisan:artisans(name),
        category:categories(name)
      )
    `)
    .eq('project_id', params.id)
    .order('created_at')

  const showTrade = canSeeTradePricing(session)

  // Cast once through unknown — supabase-js types the joined `product`
  // relation as an array, but a to-one FK returns a single object at runtime.
  const rawItems = (items ?? []) as unknown as Array<Record<string, unknown>>

  const rows: Row[] = rawItems.map(it => {
    const p = (it.product ?? null) as Record<string, unknown> | null
    const priceD = p ? resolvePrice(p as Parameters<typeof resolvePrice>[0], session)
                     : { type: 'request' as const, label: 'Unavailable' }
    const qty   = (it.quantity as number) ?? 1
    const unit  = priceD.type === 'fixed' ? priceD.amount : null
    const total = unit != null ? unit * qty : null
    const unlisted = !!p && (p.archived_at != null || p.deleted_at != null || p.visibility !== 'published')
    return {
      name:      (p?.name as string) ?? 'Item no longer available',
      ref:       (p?.reference_code as string) ?? (p?.sku as string) ?? '',
      category:  ((p?.category as Record<string, string> | null)?.name) ?? '',
      artisan:   ((p?.artisan as Record<string, string> | null)?.name) ?? '',
      qty,
      unitLabel: priceD.type === 'fixed' ? priceD.label : 'POR',
      total,
      notes:     [(it.notes as string) ?? '', unlisted ? 'No longer publicly listed — contact FBA' : ''].filter(Boolean).join(' · '),
    }
  })

  const firstProduct = rawItems[0]?.product as { currency?: 'GBP' | 'EUR' | 'USD' } | null
  const currency  = firstProduct?.currency ?? 'GBP'
  const subtotal  = rows.reduce((s, r) => s + (r.total ?? 0), 0)
  const porCount  = rows.filter(r => r.total == null).length

  const format = req.nextUrl.searchParams.get('format') ?? 'csv'
  const safeName = project.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'project'

  // ── PDF ──────────────────────────────────────────────────
  if (format === 'pdf') {
    const pdf = buildSchedulePdf(project, rows, subtotal, porCount, currency, showTrade)
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="ffe-schedule-${safeName}.pdf"`,
      },
    })
  }

  // ── HTML (browser print / save-as-PDF) ───────────────────
  if (format === 'html') {
    return new NextResponse(renderHtml(project, rows, subtotal, porCount, currency, showTrade), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // ── CSV (default) ────────────────────────────────────────
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = ['#', 'Item', 'Ref', 'Category', 'Artisan', 'Qty', showTrade ? 'Unit (trade)' : 'Unit (retail)', 'Line Total', 'Notes']
  const lines  = [header.map(esc).join(',')]
  rows.forEach((r, i) => {
    lines.push([
      i + 1, r.name, r.ref, r.category, r.artisan, r.qty, r.unitLabel,
      r.total != null ? formatPrice(r.total, currency) : '',
      r.notes,
    ].map(esc).join(','))
  })
  lines.push('')
  lines.push(['', '', '', '', '', '', '', 'Subtotal', formatPrice(subtotal, currency)].map(esc).join(','))
  if (porCount > 0) lines.push(['', '', '', '', '', '', '', 'Priced on request', `${porCount} item(s)`].map(esc).join(','))
  if (project.budget != null) {
    lines.push(['', '', '', '', '', '', '', 'Budget', formatPrice(Number(project.budget), currency)].map(esc).join(','))
  }

  const csv = '﻿' + lines.join('\r\n') // BOM for Excel
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ffe-schedule-${safeName}.csv"`,
    },
  })
}

type Row = {
  name: string; ref: string; category: string; artisan: string
  qty: number; unitLabel: string; total: number | null; notes: string
}

type Project = { name: string; location: string | null; budget: number | null; notes: string | null }
type Currency = 'GBP' | 'EUR' | 'USD'

// ── PDF schedule (landscape A4) ────────────────────────────
function buildSchedulePdf(
  project: Project, rows: Row[], subtotal: number, porCount: number,
  currency: Currency, showTrade: boolean,
): ArrayBuffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { jsPDF } = require('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const W = 297, H = 210, margin = 15
  const rightEdge = W - margin
  const forest: [number, number, number] = [26, 43, 24]
  const stone:  [number, number, number] = [158, 149, 137]
  const ink:    [number, number, number] = [38, 32, 28]

  type Col = { key: string; x: number; w: number; align: 'left' | 'right' }
  const cols: Col[] = [
    { key: '#',        x: margin,       w: 8,  align: 'left' },
    { key: 'Item',     x: margin + 8,   w: 74, align: 'left' },
    { key: 'Category', x: margin + 82,  w: 34, align: 'left' },
    { key: 'Artisan',  x: margin + 116, w: 38, align: 'left' },
    { key: 'Qty',      x: margin + 154, w: 14, align: 'right' },
    { key: showTrade ? 'Unit (trade)' : 'Unit (retail)', x: margin + 168, w: 32, align: 'right' },
    { key: 'Line Total', x: margin + 200, w: 30, align: 'right' },
    { key: 'Notes',    x: margin + 230, w: 37, align: 'left' },
  ]

  let y = margin + 6

  // Title block
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...forest)
  doc.text('FF&E Schedule', margin, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...stone)
  doc.text('Full Bloom Artelier', rightEdge, y, { align: 'right' })
  y += 6
  doc.setFontSize(10); doc.setTextColor(...ink)
  doc.text([project.name, project.location].filter(Boolean).join('   ·   '), margin, y)
  y += 7

  const drawHeader = () => {
    doc.setFillColor(...forest); doc.rect(margin, y, rightEdge - margin, 7, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(253, 250, 247)
    for (const c of cols) {
      if (c.align === 'right') doc.text(c.key, c.x + c.w, y + 4.8, { align: 'right' })
      else doc.text(c.key, c.x + 1.5, y + 4.8)
    }
    y += 9
  }
  drawHeader()

  rows.forEach((r, i) => {
    doc.setFontSize(8.5)
    const nameLines = doc.splitTextToSize(r.name + (r.ref ? `  (${r.ref})` : ''), cols[1].w - 2)
    doc.setFontSize(7.5)
    const noteLines = r.notes ? doc.splitTextToSize(r.notes, cols[7].w - 2) : ['']
    const rowH = Math.max(nameLines.length * 4, noteLines.length * 3.6, 6) + 2

    if (y + rowH > H - margin - 22) {
      doc.addPage(); y = margin + 4; drawHeader()
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5); doc.setTextColor(...ink)
    doc.text(String(i + 1), cols[0].x + 1.5, y + 4)
    doc.text(nameLines, cols[1].x + 1.5, y + 4)
    doc.setFontSize(8)
    doc.text(doc.splitTextToSize(r.category, cols[2].w - 2), cols[2].x + 1.5, y + 4)
    doc.text(doc.splitTextToSize(r.artisan, cols[3].w - 2), cols[3].x + 1.5, y + 4)
    doc.text(String(r.qty), cols[4].x + cols[4].w, y + 4, { align: 'right' })
    doc.text(r.unitLabel, cols[5].x + cols[5].w, y + 4, { align: 'right' })
    doc.text(r.total != null ? formatPrice(r.total, currency) : '—', cols[6].x + cols[6].w, y + 4, { align: 'right' })
    doc.setFontSize(7.5); doc.setTextColor(...stone)
    doc.text(noteLines, cols[7].x + 1.5, y + 3.6)

    doc.setDrawColor(230, 226, 218); doc.setLineWidth(0.2)
    doc.line(margin, y + rowH, rightEdge, y + rowH)
    y += rowH
  })

  // Totals
  y += 5
  if (y > H - margin - 20) { doc.addPage(); y = margin + 10 }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...forest)
  doc.text(`Subtotal${showTrade ? ' (trade)' : ''}`, cols[5].x + cols[5].w, y, { align: 'right' })
  doc.text(formatPrice(subtotal, currency), cols[6].x + cols[6].w, y, { align: 'right' })
  y += 5
  if (project.budget != null) {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...ink)
    doc.text('Budget', cols[5].x + cols[5].w, y, { align: 'right' })
    doc.text(formatPrice(Number(project.budget), currency), cols[6].x + cols[6].w, y, { align: 'right' })
    y += 5
  }
  y += 2
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...stone)
  if (porCount > 0) {
    doc.text(`${porCount} item(s) priced on request — excluded from the subtotal. Request a quote for a full figure.`, margin, y)
    y += 4
  }
  doc.text(
    showTrade ? 'Prices reflect your trade account.' : 'Indicative retail pricing. Trade pricing available to approved trade accounts.',
    margin, y,
  )

  // Footers
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...stone)
    doc.text('Full Bloom Artelier · FF&E Schedule', margin, H - 6)
    doc.text(`${p} / ${totalPages}`, rightEdge, H - 6, { align: 'right' })
  }

  return doc.output('arraybuffer') as ArrayBuffer
}

// ── HTML (browser print / save-as-PDF) ─────────────────────
function renderHtml(
  project: Project,
  rows: Row[], subtotal: number, porCount: number,
  currency: Currency, showTrade: boolean,
): string {
  const e = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
  const body = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${e(r.name)}</strong>${r.ref ? `<br><span class="muted">${e(r.ref)}</span>` : ''}</td>
      <td>${e(r.category)}</td>
      <td>${e(r.artisan)}</td>
      <td class="num">${r.qty}</td>
      <td class="num">${e(r.unitLabel)}</td>
      <td class="num">${r.total != null ? e(formatPrice(r.total, currency)) : '—'}</td>
      <td class="muted">${e(r.notes)}</td>
    </tr>`).join('')

  return `<!doctype html><html><head><meta charset="utf-8">
<title>FF&E Schedule — ${e(project.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1a2b18; margin: 40px; }
  h1 { font-weight: 300; font-size: 26px; margin: 0 0 4px; }
  .meta { color: #6b6b6b; font-size: 13px; margin-bottom: 24px; }
  .meta span { margin-right: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { text-align: left; border-bottom: 2px solid #1a2b18; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  td { padding: 9px 10px; border-bottom: 1px solid #e6e2da; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .muted { color: #8a8a8a; font-size: 11px; }
  tfoot td { border-bottom: none; padding-top: 12px; font-weight: 600; }
  .foot-note { margin-top: 20px; font-size: 11px; color: #8a8a8a; }
  .actions { margin-bottom: 24px; }
  button { padding: 8px 16px; font-size: 13px; cursor: pointer; }
  @media print { .actions { display: none; } body { margin: 0; } }
</style></head><body>
  <div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>
  <h1>FF&amp;E Schedule</h1>
  <div class="meta">
    <span><strong>${e(project.name)}</strong></span>
    ${project.location ? `<span>${e(project.location)}</span>` : ''}
    <span>Full Bloom Artelier</span>
  </div>
  <table>
    <thead><tr>
      <th>#</th><th>Item</th><th>Category</th><th>Artisan</th>
      <th class="num">Qty</th><th class="num">${showTrade ? 'Unit (trade)' : 'Unit (retail)'}</th>
      <th class="num">Line Total</th><th>Notes</th>
    </tr></thead>
    <tbody>${body}</tbody>
    <tfoot>
      <tr><td colspan="6" class="num">Subtotal${showTrade ? ' (trade)' : ''}</td><td class="num">${e(formatPrice(subtotal, currency))}</td><td></td></tr>
      ${project.budget != null ? `<tr><td colspan="6" class="num">Budget</td><td class="num">${e(formatPrice(Number(project.budget), currency))}</td><td></td></tr>` : ''}
    </tfoot>
  </table>
  ${porCount > 0 ? `<p class="foot-note">${porCount} item(s) are priced on request and excluded from the subtotal. Request a quote for a full figure.</p>` : ''}
  <p class="foot-note">${showTrade ? 'Prices reflect your trade account.' : 'Indicative retail pricing. Trade pricing available to approved trade accounts.'}</p>
</body></html>`
}
