import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { JournalPostForm } from '../JournalPostForm'

export const metadata = { title: 'Edit Journal Post' }

export default async function EditJournalPostPage({
  params,
}: {
  params: { slug: string }
}) {
  const { data: post } = await supabaseAdmin
    .from('journal_posts')
    .select('*')
    .eq('slug', params.slug)
    .single()

  if (!post) notFound()

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Edit Post</h1>
          <p className="admin-subtitle">{post.title}</p>
        </div>
      </div>
      <JournalPostForm post={post} />
    </>
  )
}
