import { NextRequest, NextResponse } from 'next/server'
import { requireAnyCommercial } from '@/lib/commercial/permissions'
import { UUID_RE, DATE_RE } from '@/lib/commercial/validation'
import { toCsv } from '@/lib/commercial/accountingLogic'
import {
  agedDebtorsReport, vatSummaryReport, periodIntegrityReport,
  reconciliationExceptionsReport, auditTrailReport, type ReportTable,
} from '@/lib/commercial/accounting/reports'

export const runtime = 'nodejs'

const REPORTS = ['aged-debtors', 'vat-summary', 'period-integrity', 'reconciliation-exceptions', 'audit-trail']

export async function GET(req: NextRequest, ctx: { params: Promise<{ report: string }> }) {
  const { report } = await ctx.params
  const cs = await requireAnyCommercial(['accounting_view', 'accounting_export'])
  if (!cs) return new NextResponse('Forbidden', { status: 403 })
  if (!REPORTS.includes(report)) return new NextResponse('Unknown report', { status: 404 })

  const sp = req.nextUrl.searchParams
  const today = new Date().toISOString().slice(0, 10)
  const from = DATE_RE.test(sp.get('from') ?? '') ? sp.get('from')! : today.slice(0, 8) + '01'
  const to = DATE_RE.test(sp.get('to') ?? '') ? sp.get('to')! : today
  const asOf = DATE_RE.test(sp.get('asOf') ?? '') ? sp.get('asOf')! : today

  let table: ReportTable
  try {
    switch (report) {
      case 'aged-debtors': table = await agedDebtorsReport(asOf); break
      case 'vat-summary': table = await vatSummaryReport(from, to); break
      case 'period-integrity': {
        const pid = sp.get('periodId') ?? ''
        if (!UUID_RE.test(pid)) return new NextResponse('periodId is required', { status: 400 })
        table = await periodIntegrityReport(pid); break
      }
      case 'reconciliation-exceptions': table = await reconciliationExceptionsReport(); break
      case 'audit-trail': {
        const iid = sp.get('invoiceId') ?? ''
        if (!UUID_RE.test(iid)) return new NextResponse('invoiceId is required', { status: 400 })
        table = await auditTrailReport(iid); break
      }
      default: return new NextResponse('Unknown report', { status: 404 })
    }
  } catch {
    return new NextResponse('Report failed', { status: 500 })
  }

  if (sp.get('format') === 'csv') {
    const csv = toCsv(table.columns, table.rows)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${report}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }
  return new NextResponse(renderHtml(report, table), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  })
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

function renderHtml(report: string, t: ReportTable): string {
  const head = t.columns.map(c => `<th>${esc(c)}</th>`).join('')
  const body = t.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')
  const summary = t.summary?.length
    ? `<table class="summary">${t.summary.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : ''
  const note = t.note ? `<p class="note">${esc(t.note)}</p>` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.title)}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#26201c;margin:32px;}
  h1{color:#1B4332;font-size:20px;} .brand{color:#8A6D3B;letter-spacing:1.5px;font-size:11px;text-transform:uppercase;}
  table{border-collapse:collapse;width:100%;margin-top:14px;font-family:Arial,sans-serif;font-size:12.5px;}
  th,td{border-bottom:1px solid #e4eae3;padding:6px 8px;text-align:left;}
  thead th{background:#1B4332;color:#fff;}
  td:last-child,th:last-child{text-align:right;}
  .summary{width:auto;margin-top:18px;} .summary th{background:#F4F1ED;color:#1B4332;}
  .note{color:#6b6257;font-style:italic;margin-top:10px;font-family:Arial,sans-serif;font-size:12px;}
  @media print{.noprint{display:none;}}
</style></head><body>
  <div class="brand">Full Bloom Artelier · Accounting</div>
  <h1>${esc(t.title)}</h1>
  ${note}
  <table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${t.columns.length}">No rows.</td></tr>`}</tbody></table>
  ${summary}
  <p class="noprint" style="margin-top:20px;"><a id="csv" href="#">Download CSV</a> · <a href="#" onclick="window.print();return false;">Print</a></p>
  <script>(function(){var p=new URLSearchParams(location.search);p.set('format','csv');document.getElementById('csv').href=location.pathname+'?'+p.toString();})();</script>
</body></html>`
}
