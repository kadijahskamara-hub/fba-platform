import { redirect } from 'next/navigation'
import { getCommercialSession } from '@/lib/commercial/permissions'
import { SupplierProgressView } from '@/components/admin/operations/SupplierProgressView'

// ============================================================
// /admin/operations/suppliers (Sprint 7 Part A) — per-maker
// PO progress + lead-time stats. Operational access; PO values
// require quote_price_edit (masked by the API otherwise).
// ============================================================

export const metadata = { title: 'Supplier Progress' }
export const dynamic = 'force-dynamic'

export default async function SupplierProgressPage() {
  const cs = await getCommercialSession()
  if (!cs || !(cs.permissions.has('delivery_view') || cs.permissions.has('quote_pipeline_view'))) {
    redirect('/admin/dashboard?error=no_operations_access')
  }
  return <SupplierProgressView />
}
