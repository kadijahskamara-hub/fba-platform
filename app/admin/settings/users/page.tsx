import { supabaseAdmin } from '@/lib/supabase'
import { getCommercialSession } from '@/lib/commercial/permissions'
import { UsersManager, type CustomerRow } from '@/components/UsersManager'

export const metadata = { title: 'Users' }
export const dynamic = 'force-dynamic'

async function getCustomers(): Promise<CustomerRow[]> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, first_name, last_name, email, role, status, created_at')
    .in('role', ['trade_user', 'trade_applicant', 'retail_customer'])
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })
    .limit(500)
  return (data ?? []) as CustomerRow[]
}

export default async function UsersSettingsPage() {
  const [customers, cs] = await Promise.all([
    getCustomers(),
    getCommercialSession(), // live Ultra check for the delete capability
  ])
  return <UsersManager initialUsers={customers} isUltraAdmin={cs?.isUltraAdmin ?? false} />
}
