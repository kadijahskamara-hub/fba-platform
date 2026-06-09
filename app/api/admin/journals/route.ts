import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, isStaffRole } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json()
  const {
    title, slug, excerpt, content, featured_image,
    category, tags, status, seo_title, seo_description,
    published_at,
  } = body

  if (!title || !slug || !content) {
    return NextResponse.json({ error: 'title, slug and content are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('journal_posts')
    .insert({
      title, slug, excerpt, content, featured_image,
      category, tags, status,
      seo_title, seo_description,
      author_id: session.id,
      published_at: published_at ?? null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
