import { IntegrationForm } from '../IntegrationForm'

export const metadata = { title: 'New Integration' }

export default function NewIntegrationPage() {
  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">New Brand Integration</h1>
          <p className="admin-subtitle">Connect a brand API, CSV feed, or set up manual CSV upload.</p>
        </div>
      </div>
      <IntegrationForm />
    </>
  )
}
