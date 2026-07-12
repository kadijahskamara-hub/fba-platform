import Link from 'next/link'

export const metadata = { title: 'Client statement' }
export const dynamic = 'force-dynamic'

// Renders the immutable statement document (built server-side by the API
// route) inside the admin shell. No supplier or margin data is exposed.
export default async function ClientStatementPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const src = `/api/admin/clients/${params.id}/statement?format=html`
  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Statement of Account</h1>
          <p className="admin-subtitle">Invoices, payments, credits and outstanding balance</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a className="btn btn-secondary btn-sm" href={src} target="_blank" rel="noreferrer">Open / print</a>
          <Link href="/admin/invoices" className="btn btn-secondary btn-sm">← Invoices</Link>
        </div>
      </div>
      <iframe src={src} style={{ width: '100%', height: '70vh', border: '1px solid var(--sand, #e6e6df)', borderRadius: 4, background: '#fff' }} />
    </>
  )
}
