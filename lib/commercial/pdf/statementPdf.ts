import 'server-only'
import { renderDocument, money, type DocModel } from './theme'

// ============================================================
// Client statement of account. A statement is a point-in-time view
// of the client ledger, so the route builds this model from current
// data and the generated PDF captures that moment (stored as a
// document_files row with entity_type='statement').
// ============================================================

export interface StatementLine {
  date: string
  reference: string
  description: string
  debit?: number | null      // invoiced / charged
  credit?: number | null     // paid / credited
  balance: number
}

export interface StatementModel {
  documentNumber: string     // e.g. FBA-STMT-<client>-<date>
  asOf: string
  currency: string
  client: { name?: string | null; company?: string | null; email?: string | null; address?: string | null }
  company: { legal_name: string; address?: string | null; email?: string | null; phone?: string | null; vat_number?: string | null }
  lines: StatementLine[]
  totals: { invoiced: number; paid: number; credited: number; outstanding: number }
}

export function buildStatementModel(s: StatementModel): DocModel {
  const cur = s.currency || 'GBP'
  return {
    docLabel: 'STATEMENT OF ACCOUNT',
    documentNumber: s.documentNumber,
    metaRight: [['As of', s.asOf]],
    company: s.company,
    parties: [{
      label: 'Account',
      lines: [s.client.name, s.client.company, ...String(s.client.address ?? '').split('\n'), s.client.email].filter(Boolean) as string[],
    }],
    columns: [
      { header: 'Date', width: 12 },
      { header: 'Reference', width: 16 },
      { header: 'Description', width: 30 },
      { header: 'Charged', width: 12, align: 'right' },
      { header: 'Paid', width: 12, align: 'right' },
      { header: 'Balance', width: 12, align: 'right' },
    ],
    rows: s.lines.map(l => [
      l.date, l.reference, l.description,
      l.debit ? money(l.debit, cur) : '',
      l.credit ? money(l.credit, cur) : '',
      money(l.balance, cur),
    ]),
    totals: [
      ['Total invoiced', money(s.totals.invoiced, cur)],
      ['Total paid', money(s.totals.paid, cur)],
      ...(s.totals.credited ? [['Total credited', money(s.totals.credited, cur)] as [string, string]] : []),
      ['Outstanding balance', money(s.totals.outstanding, cur), true],
    ],
    notes: [{ title: 'Note', body: 'This statement reflects the account as of the date shown. Please contact us with any queries.' }],
    bank: null,
    showTerms: false,
    confidential: 'Confidential — for client use only',
  }
}

export function statementPdf(model: StatementModel): Buffer {
  return renderDocument(buildStatementModel(model))
}
