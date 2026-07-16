// ============================================================
// Custom Match / finish-configuration domain logic (Sprint 10).
//
// PURE logic only — no imports from server-only modules, so it is
// shared by API routes, UI and unit tests (tsconfig.test.json).
// Mirrors the Sprint 10 data model in
// supabase/migrations/20260716_sprint10_custom_match_model.sql.
// ============================================================

// ── Vocabulary ───────────────────────────────────────────────

export const GLOSS_LEVELS = ['matt', 'satin', 'semi_gloss', 'full_gloss', 'custom_na'] as const
export type GlossLevel = typeof GLOSS_LEVELS[number]

export const CUSTOM_MATCH_STATUSES = [
  'draft', 'submitted', 'needs_information', 'under_fba_review', 'sent_to_maker',
  'sample_required', 'maker_feasible', 'maker_not_feasible', 'costing_required',
  'client_approval_required', 'approved', 'rejected', 'converted_to_quote',
  'converted_to_order', 'closed',
] as const
export type CustomMatchStatus = typeof CUSTOM_MATCH_STATUSES[number]

export const CUSTOM_MATCH_STATUS_LABELS: Record<CustomMatchStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  needs_information: 'Needs Information',
  under_fba_review: 'Under FBA Review',
  sent_to_maker: 'Sent to Maker',
  sample_required: 'Sample Required',
  maker_feasible: 'Maker Feasible',
  maker_not_feasible: 'Maker Not Feasible',
  costing_required: 'Costing Required',
  client_approval_required: 'Client Approval Required',
  approved: 'Approved',
  rejected: 'Rejected',
  converted_to_quote: 'Converted to Quote',
  converted_to_order: 'Converted to Order',
  closed: 'Closed',
}

// Allowed workflow transitions (server-enforced; UI mirrors them).
// Terminal-ish states can always be closed; nothing leaves 'closed'.
const TRANSITIONS: Record<CustomMatchStatus, CustomMatchStatus[]> = {
  draft: ['submitted', 'closed'],
  submitted: ['under_fba_review', 'needs_information', 'rejected', 'closed'],
  needs_information: ['submitted', 'under_fba_review', 'rejected', 'closed'],
  under_fba_review: ['sent_to_maker', 'sample_required', 'needs_information', 'costing_required', 'rejected', 'closed'],
  sent_to_maker: ['maker_feasible', 'maker_not_feasible', 'sample_required', 'closed'],
  sample_required: ['sent_to_maker', 'under_fba_review', 'maker_feasible', 'maker_not_feasible', 'closed'],
  maker_feasible: ['costing_required', 'client_approval_required', 'approved', 'closed'],
  maker_not_feasible: ['rejected', 'under_fba_review', 'closed'],
  costing_required: ['client_approval_required', 'approved', 'rejected', 'closed'],
  client_approval_required: ['approved', 'rejected', 'needs_information', 'closed'],
  approved: ['converted_to_quote', 'converted_to_order', 'closed'],
  rejected: ['under_fba_review', 'closed'],
  converted_to_quote: ['converted_to_order', 'closed'],
  converted_to_order: ['closed'],
  closed: [],
}

export function canTransition(from: CustomMatchStatus, to: CustomMatchStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to)
}

export function nextStatuses(from: CustomMatchStatus): CustomMatchStatus[] {
  return TRANSITIONS[from] ?? []
}

/** Statuses the procurement dashboard must flag as unresolved exceptions. */
export function isUnresolvedForProcurement(status: CustomMatchStatus): boolean {
  return !(['approved', 'rejected', 'converted_to_quote', 'converted_to_order', 'closed'] as CustomMatchStatus[]).includes(status)
}

// ── Material-type conditional fields (§11.3) ─────────────────
// Which dimension/application fields the Custom Match form shows per
// material slug. Slugs match the material_types seed.

export const MATERIAL_FIELD_SETS: Record<string, string[]> = {
  'fabric-upholstery': ['application_component', 'coverage_quantity', 'unit_of_measure', 'repeat_dimensions', 'roll_width', 'usable_width', 'wastage_allowance', 'fire_treatment', 'backing_interlining', 'rub_count_requirement', 'indoor_outdoor'],
  leather: ['application_component', 'coverage_quantity', 'unit_of_measure', 'hide_size', 'wastage_allowance', 'fire_treatment', 'rub_count_requirement', 'indoor_outdoor'],
  'marble-stone': ['application_component', 'coverage_quantity', 'unit_of_measure', 'slab_size', 'wastage_allowance', 'indoor_outdoor'],
  timber: ['application_component', 'coverage_quantity', 'unit_of_measure', 'timber_thickness', 'wastage_allowance', 'indoor_outdoor'],
  'metal-finish': ['application_component', 'coverage_quantity', 'unit_of_measure', 'indoor_outdoor'],
  'lacquer-paint': ['application_component', 'coverage_quantity', 'unit_of_measure', 'indoor_outdoor'],
  'ceramic-glaze': ['application_component', 'coverage_quantity', 'unit_of_measure', 'indoor_outdoor'],
  'rattan-woven': ['application_component', 'coverage_quantity', 'unit_of_measure', 'indoor_outdoor'],
  glass: ['application_component', 'coverage_quantity', 'unit_of_measure', 'indoor_outdoor'],
  resin: ['application_component', 'coverage_quantity', 'unit_of_measure', 'indoor_outdoor'],
  composite: ['application_component', 'coverage_quantity', 'unit_of_measure', 'indoor_outdoor'],
  other: ['application_component', 'coverage_quantity', 'unit_of_measure', 'indoor_outdoor'],
}

export function fieldsForMaterial(slug: string): string[] {
  return MATERIAL_FIELD_SETS[slug] ?? MATERIAL_FIELD_SETS.other
}

// ── Finish configuration (§5) ────────────────────────────────

export interface FinishGroupDef {
  id: string
  key: string
  label: string
  required: boolean
  isActive: boolean
}

export interface FinishSelection {
  finishGroupId: string
  finishOptionId: string
  finishId: string
  groupLabel: string
  finishLabel: string
  priceAdjustment?: number
  leadTimeAdjustmentWeeks?: number
}

/** Selections keyed by finish-group ID — one group can never erase another. */
export type ProductConfiguration = {
  productId: string
  quantity: number
  selections: Record<string, FinishSelection>
}

/** Apply one selection immutably; other groups are always preserved. */
export function applySelection(config: ProductConfiguration, sel: FinishSelection): ProductConfiguration {
  return { ...config, selections: { ...config.selections, [sel.finishGroupId]: sel } }
}

export function clearSelection(config: ProductConfiguration, finishGroupId: string): ProductConfiguration {
  const selections = { ...config.selections }
  delete selections[finishGroupId]
  return { ...config, selections }
}

export interface CompletenessResult {
  requiredTotal: number
  requiredCompleted: number
  complete: boolean
  missingGroupLabels: string[]
  summary: string   // e.g. '2 of 3 required finishes selected'
}

export function configurationCompleteness(groups: FinishGroupDef[], config: ProductConfiguration): CompletenessResult {
  const required = groups.filter(g => g.isActive && g.required)
  const missing = required.filter(g => !config.selections[g.id])
  const completed = required.length - missing.length
  const complete = missing.length === 0
  return {
    requiredTotal: required.length,
    requiredCompleted: completed,
    complete,
    missingGroupLabels: missing.map(g => g.label),
    summary: required.length === 0 || complete
      ? 'Configuration complete'
      : `${completed} of ${required.length} required finishes selected`,
  }
}

// ── Compatibility (§5.5) ─────────────────────────────────────

export interface CompatibilityRule {
  sourceFinishOptionId: string
  targetFinishOptionId: string
  isAllowed: boolean
  explanation?: string | null
  isActive: boolean
}

/**
 * An option is blocked if any active FORBID rule pairs it with an option
 * already selected in ANOTHER group (rules are symmetric).
 */
export function optionBlockedBy(
  optionId: string,
  config: ProductConfiguration,
  rules: CompatibilityRule[],
): { blocked: boolean; explanation: string | null } {
  const selectedIds = new Set(Object.values(config.selections).map(s => s.finishOptionId))
  for (const r of rules) {
    if (!r.isActive || r.isAllowed) continue
    const pair =
      (r.sourceFinishOptionId === optionId && selectedIds.has(r.targetFinishOptionId)) ||
      (r.targetFinishOptionId === optionId && selectedIds.has(r.sourceFinishOptionId))
    if (pair) return { blocked: true, explanation: r.explanation ?? 'Not available with the current selection.' }
  }
  return { blocked: false, explanation: null }
}

/** Server-side validation: no selected pair may violate a forbid rule. */
export function validateConfiguration(
  groups: FinishGroupDef[],
  config: ProductConfiguration,
  rules: CompatibilityRule[],
): { valid: boolean; problems: string[] } {
  const problems: string[] = []
  const sels = Object.values(config.selections)

  // Unknown groups
  const groupIds = new Set(groups.filter(g => g.isActive).map(g => g.id))
  for (const s of sels) {
    if (!groupIds.has(s.finishGroupId)) problems.push(`Selection references an unknown finish group (${s.groupLabel || s.finishGroupId}).`)
  }

  // Pairwise compatibility
  for (let i = 0; i < sels.length; i++) {
    for (let j = i + 1; j < sels.length; j++) {
      const a = sels[i], b = sels[j]
      for (const r of rules) {
        if (!r.isActive || r.isAllowed) continue
        const match =
          (r.sourceFinishOptionId === a.finishOptionId && r.targetFinishOptionId === b.finishOptionId) ||
          (r.sourceFinishOptionId === b.finishOptionId && r.targetFinishOptionId === a.finishOptionId)
        if (match) problems.push(`${a.finishLabel} cannot be combined with ${b.finishLabel}${r.explanation ? ` — ${r.explanation}` : '.'}`)
      }
    }
  }

  // Required groups
  const completeness = configurationCompleteness(groups, config)
  for (const label of completeness.missingGroupLabels) problems.push(`A ${label} finish must be selected.`)

  if (!(config.quantity > 0)) problems.push('Quantity must be a positive number.')
  return { valid: problems.length === 0, problems }
}

// ── Price / lead-time effect of a configuration (§5.6) ───────

export function configurationAdjustments(config: ProductConfiguration): {
  priceAdjustmentTotal: number
  leadTimeAdjustmentWeeksMax: number
} {
  let price = 0
  let lead = 0
  for (const s of Object.values(config.selections)) {
    price += Number(s.priceAdjustment ?? 0)
    lead = Math.max(lead, Number(s.leadTimeAdjustmentWeeks ?? 0))
  }
  return { priceAdjustmentTotal: price, leadTimeAdjustmentWeeksMax: lead }
}

// ── Attachment rules (§11.3 / §17.3) ─────────────────────────

export const CM_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024  // 15 MB
export const CM_ATTACHMENT_MIME_ALLOWLIST = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
] as const
export const CM_ATTACHMENT_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'] as const

export function validateAttachment(input: { filename: string; mimeType: string; size: number }): { ok: boolean; error?: string } {
  if (!(input.size > 0)) return { ok: false, error: 'The file is empty.' }
  if (input.size > CM_ATTACHMENT_MAX_BYTES) return { ok: false, error: 'Files must be 15 MB or smaller.' }
  const mime = input.mimeType.toLowerCase()
  if (!(CM_ATTACHMENT_MIME_ALLOWLIST as readonly string[]).includes(mime)) {
    return { ok: false, error: 'Only PDF, JPG, PNG or WEBP files are accepted.' }
  }
  const ext = input.filename.toLowerCase().split('.').pop() ?? ''
  if (!(CM_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, error: 'The file extension does not match an accepted type.' }
  }
  const extMime: Record<string, string[]> = {
    pdf: ['application/pdf'], jpg: ['image/jpeg'], jpeg: ['image/jpeg'],
    png: ['image/png'], webp: ['image/webp'],
  }
  if (!extMime[ext]?.includes(mime)) return { ok: false, error: 'The file type and extension do not match.' }
  return { ok: true }
}
