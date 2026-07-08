// Client-safe proforma pipeline definitions (Phase 2). No server imports.

export const PROFORMA_STAGES = [
  { key: 'draft',         label: 'Draft',                        hint: 'Being built; not yet shared.' },
  { key: 'sent',          label: 'Sent / Presented',             hint: 'Proposal delivered to the customer.' },
  { key: 'under_review',  label: 'Under Review',                 hint: 'Client has it; no response yet.' },
  { key: 'revising',      label: 'Revising',                     hint: 'Client requested changes.' },
  { key: 'won',           label: 'Won / Confirmed',              hint: 'Client accepted and committed.' },
  { key: 'ordered',       label: 'Ordered with Manufacturer(s)', hint: 'Split proformas sent; deposits/POs placed.' },
  { key: 'in_production', label: 'In Production / Fulfilment',   hint: 'Manufacturer(s) building / sourcing.' },
  { key: 'delivered',     label: 'Delivered / Completed',        hint: 'Order fulfilled; entry closed.' },
  { key: 'lost',          label: 'Lost',                         hint: 'Client declined; requires a reason.' },
  { key: 'on_hold',       label: 'On Hold',                      hint: 'Paused — not lost, not moving.' },
] as const

export type ProformaStage = typeof PROFORMA_STAGES[number]['key']

export const PROFORMA_STAGE_KEYS = PROFORMA_STAGES.map(s => s.key) as ProformaStage[]

export function stageLabel(stage: string): string {
  return PROFORMA_STAGES.find(s => s.key === stage)?.label ?? stage
}

export const LOST_REASONS = [
  { key: 'price',             label: 'Price' },
  { key: 'timeline',          label: 'Timeline' },
  { key: 'competitor',        label: 'Competitor' },
  { key: 'project_cancelled', label: 'Project cancelled' },
] as const

export type LostReason = typeof LOST_REASONS[number]['key']

export function lostReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null
  return LOST_REASONS.find(r => r.key === reason)?.label ?? reason
}
