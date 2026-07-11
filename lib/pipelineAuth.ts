import { getCommercialSession } from './commercial/permissions'
import type { SessionUser } from './types'

// Legacy pipeline access shim (Phase 2.6 → Sprint 1 commercial).
// Now delegates to the granular commercial permission model:
// any user holding quote_pipeline_view (directly, via the legacy
// quote_pipeline permission mapping, or via admin/Ultra Admin)
// retains read access. Mutating routes enforce finer permissions
// through requireCommercial() directly.
export async function getPipelineSession(): Promise<SessionUser | null> {
  const cs = await getCommercialSession()
  if (!cs) return null
  return cs.permissions.has('quote_pipeline_view') ? cs.user : null
}
