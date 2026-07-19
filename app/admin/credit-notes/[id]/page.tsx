import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { getCommercialSession } from '@/lib/commercial/permissions'
import { refundableForCreditNote } from '@/lib/commercial/refunds'
import { creditNoteAvailability, creditNoteStage } from '@/lib/commercial/creditNoteLogic'
import CreditNoteActions, { type AllocTarget } from './CreditNoteActions'
import { UltraDeleteRecordButton } from '@/components/UltraDeleteRecordButton'

// ============================================================
// Credit-note detail (Sprint 18, QA P0): approve, issue, allocate
// and refund — the lifecycle existed server-side since Sprint 3/6
// but had no screen. Allocation candidates follow the Sprint 16
// party rule: client when both sides carry one, else the parent
// invoice's commercial order (orders in the quote→proforma→order
// flow hold a client_snapshot, not a client_id).
// ============================================================

export const dynamic = 'force-dynamic'
function sym(cur: string) { return cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£' }
const money = (n: unknown, cur: string) => `${sym(cur)}${Number(n ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`

export default async function CreditNoteDetailPage(ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const { data: cn } = await supabaseAdmin.from('credit_notes').select('*').eq('id', params.id).single()
  if (!cn) notFound()
  const cur = (cn.currency as string) ?? 'GBP'

  const [{ data: lines }, { data: allocs }, { data: refundRows }, { data: parentInv }, cs] = await Promise.all([
    supabaseAdmin.from('credit_note_lines').select('*').eq('credit_note_id', params.id).order('sort_order'),
    supabaseAdmin.from('credit_note_allocations').select('id, amount, created_at, invoice:sales_invoices(id, invoice_number)').eq('credit_note_id', params.id),
    supabaseAdmin.from('refunds').select('id, refund_number, amount, status, refund_date').eq('credit_note_id', params.id).order('created_at', { ascending: false }),
    supabaseAdmin.from('sales_invoices').select('id, invoice_number, commercial_order_id, client_id, currency, balance_due, locked_at, status').eq('id', cn.sales_invoice_id as string).single(),
    getCommercialSession(),
  ])

  const refundable = await refundableForCreditNote(params.id)

  const availability = creditNoteAvailability({
    status: cn.status as string,
    approvalStatus: (cn.approval_status as string) ?? 'none',
    grossTotal: Number(cn.gross_total ?? 0),
    allocatedTotal: Number(cn.allocated_total ?? 0),
    hasAllocations: (allocs ?? []).length > 0,
    refundable,
    createdBy: (cn.created_by as string | null) ?? null,
    actorId: cs?.user.id ?? '',
    canApprovePermission: cs?.permissions.has('credit_note_approve') ?? false,
    canCreatePermission: cs?.permissions.has('credit_note_create') ?? false,
    canRefundPermission: cs?.permissions.has('refund_record') ?? false,
  })

  // Allocation candidates: issued invoices with a balance, same currency,
  // matched on the credit note's client OR the parent invoice's order.
  let allocTargets: AllocTarget[] = []
  if (availability.canAllocate) {
    const cnClientId = (cn.client_id as string | null) ?? null
    const orderId = (parentInv?.commercial_order_id as string | null) ?? null
    const orFilter = [
      cnClientId ? `client_id.eq.${cnClientId}` : null,
      orderId ? `commercial_order_id.eq.${orderId}` : null,
    ].filter(Boolean).join(',')

    const { data: candidates } = orFilter
      ? await supabaseAdmin.from('sales_invoices')
          .select('id, invoice_number, balance_due, due_date')
          .or(orFilter)
          .eq('currency', cur).not('locked_at', 'is', null).gt('balance_due', 0)
          .order('due_date', { ascending: true })
      : { data: [] as Record<string, unknown>[] }

    allocTargets = ((candidates ?? []) as Record<string, unknown>[]).map(i => ({
      id: i.id as string,
      label: (i.invoice_number as string) ?? 'Draft invoice',
      balance: Number(i.balance_due ?? 0),
    }))
    // The parent invoice is always offered first if it still carries a balance.
    if (parentInv && parentInv.locked_at && Number(parentInv.balance_due ?? 0) > 0 && !allocTargets.some(t => t.id === parentInv.id)) {
      allocTargets.unshift({ id: parentInv.id as string, label: (parentInv.invoice_number as string) ?? 'Parent invoice', balance: Number(parentInv.balance_due ?? 0) })
    }
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">{(cn.credit_note_number as string) ?? 'Draft credit note'}</h1>
          <p className="admin-subtitle">
            <span className="status-pill">{creditNoteStage(cn.status as string, (cn.approval_status as string) ?? 'none')}</span>
            {' · against '}
            {parentInv
              ? <Link href={`/admin/invoices/${parentInv.id}`} style={{ color: 'var(--forest)', fontWeight: 500 }}>{(parentInv.invoice_number as string) ?? 'Draft invoice'}</Link>
              : '—'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/admin/credit-notes" className="btn btn-secondary btn-sm">← All credit notes</Link>
          <UltraDeleteRecordButton
            entity="credit_note"
            recordId={params.id}
            label={(cn.credit_note_number as string) ?? 'Draft credit note'}
            redirectTo="/admin/credit-notes"
          />
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <CreditNoteActions
          creditNoteId={params.id}
          currency={cur}
          availability={availability}
          refundable={refundable}
          allocTargets={allocTargets}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Gross value', value: money(cn.gross_total, cur) },
          { label: 'Allocated to invoices', value: money(cn.allocated_total, cur) },
          { label: 'Unapplied', value: money(availability.available, cur) },
          { label: 'Refundable', value: money(refundable, cur) },
        ].map(s => (
          <div key={s.label} className="stat-card"><div className="stat-card-label">{s.label}</div><div className="stat-card-value" style={{ fontSize: 20 }}>{s.value}</div></div>
        ))}
      </div>

      {cn.reason ? <p style={{ color: 'var(--stone)', marginBottom: 18 }}>Reason: <strong>{cn.reason as string}</strong></p> : null}

      <table className="data-table">
        <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>VAT</th><th>Net</th><th>Gross</th></tr></thead>
        <tbody>
          {(lines ?? []).map((l: Record<string, unknown>) => (
            <tr key={l.id as string}>
              <td>{l.name_snapshot as string}</td>
              <td>{Number(l.quantity)}</td>
              <td>{money(l.unit_price, cur)}</td>
              <td style={{ fontSize: 12 }}>{l.tax_category as string} {Number(l.tax_rate_snapshot ?? 0)}%</td>
              <td>{money(l.line_net_total, cur)}</td>
              <td>{money(l.line_gross_total, cur)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {(allocs ?? []).length > 0 && (
        <>
          <h3 style={{ marginTop: 28, color: 'var(--forest)' }}>Allocations</h3>
          <table className="data-table">
            <thead><tr><th>Invoice</th><th>Amount</th><th>When</th></tr></thead>
            <tbody>
              {(allocs ?? []).map((a: Record<string, unknown>) => {
                const inv = (a.invoice ?? {}) as Record<string, unknown>
                return (
                  <tr key={a.id as string}>
                    <td>{inv.id ? <Link href={`/admin/invoices/${inv.id}`} style={{ color: 'var(--forest)' }}>{(inv.invoice_number as string) ?? '—'}</Link> : '—'}</td>
                    <td>{money(a.amount, cur)}</td>
                    <td style={{ fontSize: 12, color: 'var(--stone)' }}>{a.created_at ? new Date(a.created_at as string).toLocaleDateString('en-GB') : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {(refundRows ?? []).length > 0 && (
        <>
          <h3 style={{ marginTop: 28, color: 'var(--forest)' }}>Refunds</h3>
          <table className="data-table">
            <thead><tr><th>Refund</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {(refundRows ?? []).map((r: Record<string, unknown>) => (
                <tr key={r.id as string}>
                  <td><code style={{ fontSize: 12 }}>{r.refund_number as string}</code></td>
                  <td>{money(r.amount, cur)}</td>
                  <td style={{ fontSize: 12 }}>{r.refund_date as string}</td>
                  <td><span className="status-pill">{r.status as string}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12.5, color: 'var(--stone)', marginTop: 8 }}>
            Refund approval and completion are handled in <Link href="/admin/accounting" style={{ color: 'var(--forest)' }}>Accounting → Refunds</Link> (segregated from recording).
          </p>
        </>
      )}
    </>
  )
}
