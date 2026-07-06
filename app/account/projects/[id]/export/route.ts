import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { resolvePrice, formatPrice, canSeeTradePricing } from '@/lib/pricing'

/**
 * GET /account/projects/:id/export?format=csv|html
 * FF&E schedule export for a project the current user owns.
 *  - csv  (default): downloadable spreadsheet
 *  - html:           print-friendly page (browser "Save as PDF")
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
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

  const rows = (items ?? []).map(it => {
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

  const currency  = (rows.find(r => r.total != null) && (items?.[0]?.product as Record<string, string> | null)?.currency as 'GBP' | 'EUR' | 'USD') || 'GBP'
  const subtotal  = rows.reduce((s, r) => s + (r.total ?? 0), 0)
  const porCount  = rows.filter(r => r.total == null).length

  const format = req.nextUrl.searchParams.get('format') ?? 'csv'
  const safeName = project.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'project'

  if (format === 'html') {
    return new NextResponse(renderHtml(project, rows, subtotal, porCount, currency, showTrade), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // ── CSV ──────────────────────────────────────────────────
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

function renderHtml(
  project: { name: string; location: string | null; budget: number | null; notes: string | null },
  rows: Row[], subtotal: number, porCount: number,
  currency: 'GBP' | 'EUR' | 'USD', showTrade: boolean,
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
