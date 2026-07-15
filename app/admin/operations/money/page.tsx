import { redirect } from 'next/navigation'
import { getCommercialSession } from '@/lib/commercial/permissions'
import { MoneyView } from '@/components/admin/operations/MoneyView'

// ============================================================
// /admin/operations/money (Sprint 7 Part A) — exposure &
// profitability. PRICE-LEVEL page: requires quote_price_edit.
// Supplier costs/margins are never shown without it.
// ============================================================

export const metadata = { title: 'Exposure & Profitability' }
export const dynamic = 'force-dynamic'

export default async function OperationsMoneyPage() {
  const cs = await getCommercialSession()
  if (!cs || !cs.permissions.has('quote_price_edit')) {
    redirect('/admin/operations')
  }
  return <MoneyView />
}
