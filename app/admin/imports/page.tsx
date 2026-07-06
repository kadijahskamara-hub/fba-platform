import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Import History' }

const STATUS_COLOURS: Record<string, { bg: string; fg: string }> = {
  completed:             { bg: '#DCFCE7', fg: '#166534' },
  completed_with_errors: { bg: '#FEF9C3', fg: '#854D0E' },
  running:               { bg: '#DBEAFE', fg: '#1E40AF' },
  failed:                { bg: '#FEE2E2', fg: '#991B1B' },
  rolled_back:           { bg: '#F3E8FF', fg: '#6B21A8' },
}

const MODE_LABELS: Record<string, string> = {
  create_only: 'Create new only',
  upsert: 'Update & create',
  force_refresh: 'Force refresh',
  replace_batch: 'Replace batch',
  purge_reload: 'Purge & reload',
}

export default async function AdminImportsPage() {
  const { data: batches } = await supabaseAdmin
    .from('import_batches')
    .select('*, imported_by_user:users!import_batches_imported_by_fkey(first_name, last_name)')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Import History</h1>
          <p className="admin-subtitle">{batches?.length ?? 0} import batches</p>
        </div>
        <Link href="/admin/products/import" className="btn btn-primary btn-sm">
          Import Products
        </Link>
      </div>

      {!batches?.length ? (
        <div className="empty-state">
          <h3>No imports yet</h3>
          <p>Run your first product import to see its history here.</p>
        </div>
      ) : (
        <div style={{ background: 'var(--warm-white)', border: '1px solid var(--light-line)', overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Batch</th>
                <th>Mode</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Unchanged</th>
                <th>Skipped</th>
                <th>Archived</th>
                <th>Failed</th>
                <th>By</th>
                <th>When</th>
                <th>Status</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b: Record<string, unknown>) => {
                const status = b.status as string
                const colours = STATUS_COLOURS[status] ?? { bg: '#eee', fg: '#444' }
                const user = b.imported_by_user as { first_name?: string; last_name?: string } | null
                return (
                  <tr key={b.id as string}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{b.batch_ref as string}</div>
                      <div style={{ fontSize: 11, color: 'var(--stone)' }}>{(b.source_name as string) || (b.source_type as string)}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>{MODE_LABELS[b.import_mode as string] ?? (b.import_mode as string)}</td>
                    <td style={{ color: '#16A34A', fontWeight: 600 }}>{b.created_count as number}</td>
                    <td style={{ color: '#0369A1', fontWeight: 600 }}>{b.updated_count as number}</td>
                    <td style={{ color: 'var(--stone)' }}>{b.unchanged_count as number}</td>
                    <td style={{ color: '#92700E' }}>{b.skipped_count as number}</td>
                    <td style={{ color: '#9333EA' }}>{b.archived_count as number}</td>
                    <td style={{ color: (b.failed_count as number) > 0 ? '#DC2626' : 'var(--stone)', fontWeight: (b.failed_count as number) > 0 ? 600 : 400 }}>
                      {b.failed_count as number}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--stone)' }}>
                      {user ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || '—' : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--stone)', whiteSpace: 'nowrap' }}>
                      {new Date(b.created_at as string).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, background: colours.bg, color: colours.fg, whiteSpace: 'nowrap' }}>
                        {status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <a href={`/api/admin/imports/${b.id}/report`} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
                        CSV
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
