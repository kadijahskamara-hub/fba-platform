import { JournalPostForm } from '../JournalPostForm'

export const metadata = { title: 'New Journal Post' }

export default function NewJournalPostPage() {
  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">New Journal Post</h1>
          <p className="admin-subtitle">Write and publish a new studio journal entry</p>
        </div>
      </div>
      <JournalPostForm />
    </>
  )
}
