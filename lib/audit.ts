import 'server-only'
import { supabaseAdmin } from './supabase'
import type { SessionUser } from './types'

// ============================================================
// Audit logging — write-only helper for admin mutations.
// Never throws: an audit failure must not break the operation,
// but it is logged to the server console for investigation.
// ============================================================

export async function logAudit(params: {
  actor: SessionUser | null
  action: string          // e.g. 'product.archived', 'product.deleted', 'import.completed'
  entityType: string      // e.g. 'product', 'import_batch', 'product_document'
  entityId?: string | null
  before?: unknown
  after?: unknown
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('audit_logs').insert({
      actor_id: params.actor?.id ?? null,
      actor_email: params.actor?.email ?? null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      before_value: params.before ?? null,
      after_value: params.after ?? null,
    })
    if (error) console.error('[audit] insert failed:', error.message)
  } catch (err) {
    console.error('[audit] unexpected failure:', err)
  }
}
