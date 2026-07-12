import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { IntegrationForm } from '../IntegrationForm'
import type { BrandIntegration } from '@/lib/syncEngine'

export const metadata = { title: 'Edit Integration' }

export default async function EditIntegrationPage(ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const { data, error } = await supabaseAdmin
    .from('brand_integrations')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !data) notFound()

  const integration = data as BrandIntegration

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">{integration.brand_name}</h1>
          <p className="admin-subtitle">Edit integration settings and field mappings.</p>
        </div>
      </div>
      <IntegrationForm integration={integration} />
    </>
  )
}
