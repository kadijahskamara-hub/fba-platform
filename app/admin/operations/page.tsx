import { redirect } from 'next/navigation'
import { getCommercialSession } from '@/lib/commercial/permissions'
import { OperationsHub } from '@/components/admin/operations/OperationsHub'

// ============================================================
// /admin/operations (Sprint 7 Part A) — procurement operations hub.
// Operational access: delivery_view OR quote_pipeline_view.
// Money figures inside the hub additionally require
// quote_price_edit (enforced by the APIs, masked otherwise).
// ============================================================

export const metadata = { title: 'Operations' }
export const dynamic = 'force-dynamic'

export default async function OperationsPage() {
  const cs = await getCommercialSession()
  if (!cs || !(cs.permissions.has('delivery_view') || cs.permissions.has('quote_pipeline_view'))) {
    redirect('/admin/dashboard?error=no_operations_access')
  }
  return <OperationsHub />
}
