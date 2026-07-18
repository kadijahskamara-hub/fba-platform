// ============================================================
// Finish-selection routing (Sprint 17).
//
// A configured product carries selections across several finish
// groups ("Frame timber", "Upholstery fabric", "Leg finish", ...).
// The quote line has three distinct destinations for these:
//
//   selected_finish  — hard finishes (timber, metal, stone, paint)
//   selected_fabric  — soft finishes (fabric, upholstery, leather)
//   spec_details     — the full list, one detail per line
//
// Until now the project->quote path concatenated EVERY group into
// selected_finish, leaving the Fabric/Upholstery and Full
// Specification fields blank in the admin line editor even though
// the combined string rendered fine on the PDF. Pure module: no
// server imports, unit-tested.
// ============================================================

export interface FinishSelection {
  groupLabel: string
  finishLabel: string
}

/** Group labels that describe a soft/upholstery finish. */
const SOFT_GROUP_RE = /fabric|upholster|leather|textile|hide|weave|cushion|seat pad/i

export function isSoftFinishGroup(groupLabel: string): boolean {
  return SOFT_GROUP_RE.test(groupLabel ?? '')
}

const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s)

/**
 * Route a product's finish selections to the three quote-line fields.
 * Returns nulls (never empty strings) so callers can persist directly.
 */
export function splitFinishSelections(selections: FinishSelection[]): {
  selectedFinish: string | null
  selectedFabric: string | null
  specDetails: string | null
} {
  const clean = (selections ?? []).filter(s => s && s.groupLabel && s.finishLabel)
  if (clean.length === 0) return { selectedFinish: null, selectedFabric: null, specDetails: null }

  const soft = clean.filter(s => isSoftFinishGroup(s.groupLabel))
  const hard = clean.filter(s => !isSoftFinishGroup(s.groupLabel))

  const join = (rows: FinishSelection[]) =>
    rows.map(s => `${s.groupLabel}: ${s.finishLabel}`).join('; ')

  return {
    selectedFinish: hard.length ? cap(join(hard), 490) : null,
    selectedFabric: soft.length ? cap(join(soft), 490) : null,
    // One detail per line — matches the admin field's own instruction.
    specDetails: cap(clean.map(s => `${s.groupLabel}: ${s.finishLabel}`).join('\n'), 700),
  }
}
