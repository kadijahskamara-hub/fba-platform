import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import {
  classifyRows, nextBatchRef,
  type ImportMode, type ClassifiedItem,
} from '@/lib/importEngine'

// ============================================================
// Product import (admin brief §4)
// POST body:
//   rows:        parsed sheet rows
//   mode:        create_only | upsert | force_refresh | replace_batch | purge_reload
//   preview:     true → classify only, no writes
//   sourceUrl?:  original Drive/Sheet URL (for batch record + replace matching)
//   sourceFileId?: Drive file id (preferred replace-batch scope key)
//   sourceName?: display name
//   confirm?:    'RELOAD PRODUCTS' required for purge_reload
// ============================================================

const MODES: ImportMode[] = ['create_only', 'upsert', 'force_refresh', 'replace_batch', 'purge_reload']
const CHUNK = 100

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  let body: {
    rows?: Record<string, string>[]
    mode?: string
    preview?: boolean
    sourceUrl?: string
    sourceFileId?: string
    sourceName?: string
    confirm?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const rows = body.rows
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ success: false, error: 'No rows provided' }, { status: 400 })
  }
  if (rows.length > 5000) {
    return NextResponse.json({ success: false, error: 'Too many rows in one import (max 5000). Split the file.' }, { status: 400 })
  }

  const mode = (body.mode ?? 'upsert') as ImportMode
  if (!MODES.includes(mode)) {
    return NextResponse.json({ success: false, error: 'Unknown import mode' }, { status: 400 })
  }

  if ((mode === 'replace_batch' || mode === 'purge_reload') && session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Replace Batch and Purge & Reload are admin-only import modes.' }, { status: 403 })
  }
  if (mode === 'purge_reload' && !body.preview && body.confirm !== 'RELOAD PRODUCTS') {
    return NextResponse.json({ success: false, error: 'Type RELOAD PRODUCTS to confirm a purge and reload.' }, { status: 400 })
  }

  // ── Classify all rows ──────────────────────────────────────
  let classified
  try {
    // purge_reload rewrites everything from source regardless of hash
    classified = await classifyRows(rows, mode === 'purge_reload' ? 'force_refresh' : mode)
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Classification failed' }, { status: 500 })
  }
  const { items, summary, resolvers, index } = classified

  const sourceFileId = body.sourceFileId?.trim() || null
  let toArchive: Array<{ id: string; name: string; slug: string }> = []
  if ((mode === 'replace_batch' || mode === 'purge_reload') && sourceFileId) {
    const seenSlugs = new Set(items.filter(i => i.slug).map(i => i.slug))
    toArchive = index.all
      .filter(p => p.source_file_id === sourceFileId && !seenSlugs.has(p.slug) && !p.archived_at)
      .map(p => ({ id: p.id, name: p.name, slug: p.slug }))
    summary.archive = toArchive.length
  }

  // ── Preview: return classification without writing ─────────
  if (body.preview) {
    return NextResponse.json({
      success: true,
      preview: true,
      mode,
      summary,
      items: items.map(({ product: _p, specs: _s, documents: _d, ...rest }) => rest),
      toArchive: toArchive.map(p => ({ name: p.name, slug: p.slug })),
    })
  }

  // ── Run import ─────────────────────────────────────────────
  const batchRef = await nextBatchRef()
  const { data: batch, error: batchError } = await supabaseAdmin
    .from('import_batches')
    .insert({
      batch_ref: batchRef,
      source_type: sourceFileId ? 'google_drive' : 'csv',
      source_url: body.sourceUrl ?? null,
      source_name: body.sourceName ?? null,
      import_mode: mode,
      status: 'running',
      products_found: rows.length,
      imported_by: session.id,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    return NextResponse.json({ success: false, error: `Could not create import batch: ${batchError?.message}` }, { status: 500 })
  }

  const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0, conflict: 0, archived: 0, failed: 0 }
  const batchItems: Record<string, unknown>[] = []
  const errors: string[] = []
  const now = new Date().toISOString()

  const sourceMeta = {
    source_type: sourceFileId ? 'google_drive' : 'csv',
    source_url: body.sourceUrl ?? null,
    source_file_id: sourceFileId,
    source_batch_id: batch.id,
    last_imported_at: now,
    last_import_mode: mode,
  }

  // Pre-fetch full before-snapshots for all products being updated
  const updateIds = items.filter(i => i.action === 'update' && i.matchedProductId).map(i => i.matchedProductId as string)
  const beforeMap = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < updateIds.length; i += CHUNK) {
    const { data } = await supabaseAdmin.from('products').select('*').in('id', updateIds.slice(i, i + CHUNK))
    for (const p of data ?? []) beforeMap.set(p.id, p)
  }

  function artisanNameFor(item: ClassifiedItem): string {
    const row = rows![item.rowNumber - 1]
    if (!row) return ''
    return (row['Artisan / Studio'] ?? row['Artisan'] ?? row['Studio'] ?? row['Brand'] ?? '').toString().trim()
  }

  // ── Creates (chunked bulk inserts) ─────────────────────────
  const creates = items.filter(i => i.action === 'create')
  for (let c = 0; c < creates.length; c += CHUNK) {
    const chunk = creates.slice(c, c + CHUNK)
    for (const item of chunk) {
      item.product!.artisan_id = await resolvers.ensureArtisan(artisanNameFor(item))
    }
    const payload = chunk.map(i => ({ ...i.product, ...sourceMeta, source_row_id: i.sourceRowId ?? null }))
    const { data: inserted, error } = await supabaseAdmin
      .from('products')
      .insert(payload)
      .select('id, slug')

    if (error) {
      // fall back to row-by-row so one bad row doesn't sink the chunk
      for (const item of chunk) {
        const { data: one, error: oneErr } = await supabaseAdmin
          .from('products')
          .insert({ ...item.product, ...sourceMeta, source_row_id: item.sourceRowId ?? null })
          .select('id, slug')
          .single()
        if (oneErr || !one) {
          counts.failed++
          errors.push(`${item.name}: ${oneErr?.message ?? 'insert failed'}`)
          batchItems.push(itemRecord(batch.id, item, 'fail', oneErr?.message ?? 'insert failed'))
        } else {
          counts.created++
          await writeSubRecords(one.id, item)
          batchItems.push(itemRecord(batch.id, item, 'create', item.message, one.id))
        }
      }
      continue
    }

    const idBySlug = new Map((inserted ?? []).map(r => [r.slug, r.id]))
    for (const item of chunk) {
      const id = idBySlug.get(item.slug)
      if (!id) { counts.failed++; batchItems.push(itemRecord(batch.id, item, 'fail', 'insert returned no id')); continue }
      counts.created++
      await writeSubRecords(id, item)
      batchItems.push(itemRecord(batch.id, item, 'create', item.message, id))
    }
  }

  // ── Updates ────────────────────────────────────────────────
  const updates = items.filter(i => i.action === 'update')
  for (const item of updates) {
    const id = item.matchedProductId as string
    const artisanId = await resolvers.ensureArtisan(artisanNameFor(item))

    const { error } = await supabaseAdmin
      .from('products')
      .update({
        ...item.product,
        artisan_id: artisanId,
        ...sourceMeta,
        source_row_id: item.sourceRowId ?? null,
        last_updated_by: session.id,
        updated_at: now,
      })
      .eq('id', id)

    if (error) {
      counts.failed++
      errors.push(`${item.name}: ${error.message}`)
      batchItems.push(itemRecord(batch.id, item, 'fail', error.message, id))
    } else {
      counts.updated++
      await writeSubRecords(id, item)
      batchItems.push({ ...itemRecord(batch.id, item, 'update', item.message, id), before_snapshot: beforeMap.get(id) ?? null })
    }
  }

  // ── Unchanged / skipped / conflicts (recorded, never silent) ─
  for (const item of items) {
    if (item.action === 'unchanged') { counts.unchanged++; batchItems.push(itemRecord(batch.id, item, 'unchanged', item.message, item.matchedProductId)) }
    if (item.action === 'skip')      { counts.skipped++;   batchItems.push(itemRecord(batch.id, item, 'skip', item.message, item.matchedProductId)) }
    if (item.action === 'conflict')  { counts.conflict++;  batchItems.push(itemRecord(batch.id, item, 'conflict', item.message)) }
  }

  // ── Archive missing-from-source (replace_batch / purge_reload) ─
  for (const p of toArchive) {
    const { error } = await supabaseAdmin
      .from('products')
      .update({ archived_at: now, archived_by: session.id, last_updated_by: session.id, updated_at: now })
      .eq('id', p.id)
    if (error) {
      counts.failed++
      errors.push(`Archive ${p.name}: ${error.message}`)
    } else {
      counts.archived++
      batchItems.push({
        batch_id: batch.id, product_id: p.id, slug: p.slug, product_name: p.name,
        action: 'archive', status: 'done',
        message: 'Product was in a previous import from this source but is missing from the new file — archived.',
      })
    }
  }

  // ── Persist batch items (chunked) ──────────────────────────
  for (let i = 0; i < batchItems.length; i += CHUNK) {
    await supabaseAdmin.from('import_batch_items').insert(batchItems.slice(i, i + CHUNK))
  }

  const finalStatus = counts.failed > 0 ? 'completed_with_errors' : 'completed'
  await supabaseAdmin
    .from('import_batches')
    .update({
      status: finalStatus,
      created_count: counts.created,
      updated_count: counts.updated,
      unchanged_count: counts.unchanged,
      skipped_count: counts.skipped,
      conflict_count: counts.conflict,
      archived_count: counts.archived,
      failed_count: counts.failed,
      completed_at: new Date().toISOString(),
      error_summary: errors.length ? errors.slice(0, 20).join('\n') : null,
    })
    .eq('id', batch.id)

  await logAudit({
    actor: session,
    action: 'import.completed',
    entityType: 'import_batch',
    entityId: batch.id,
    after: { batchRef, mode, ...counts },
  })

  return NextResponse.json({
    success: true,
    batchId: batch.id,
    batchRef,
    mode,
    status: finalStatus,
    ...counts,
    errors,
  })
}

// ── Helpers ───────────────────────────────────────────────────

function itemRecord(batchId: string, item: ClassifiedItem, action: string, message: string, productId?: string | null): Record<string, unknown> {
  return {
    batch_id: batchId,
    product_id: productId ?? null,
    source_row_number: item.rowNumber,
    source_row_id: item.sourceRowId ?? null,
    reference_code: item.referenceCode ?? null,
    sku: item.sku ?? null,
    slug: item.slug || null,
    product_name: item.name || null,
    action,
    status: action === 'fail' ? 'error' : 'done',
    message,
    warning: item.warning ?? null,
    error: action === 'fail' ? message : null,
  }
}

/** Upsert specs + replace imported documents for a product. */
async function writeSubRecords(productId: string, item: ClassifiedItem): Promise<void> {
  if (item.specs && Object.values(item.specs).some(v => v !== null && v !== false)) {
    await supabaseAdmin
      .from('product_specifications')
      .upsert({ product_id: productId, ...item.specs }, { onConflict: 'product_id' })
  }
  if (item.documents && item.documents.length > 0) {
    const types = item.documents.map(d => d.document_type)
    await supabaseAdmin.from('product_documents').delete().eq('product_id', productId).in('document_type', types)
    await supabaseAdmin.from('product_documents').insert(
      item.documents.map((d, i) => ({
        product_id: productId,
        document_type: d.document_type,
        label: d.label,
        url: d.url,
        source_url: d.url,
        sort_order: i,
      }))
    )
  }
}
