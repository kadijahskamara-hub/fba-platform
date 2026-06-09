import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, isStaffRole } from '@/lib/auth'

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session || !isStaffRole(session)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json()
  const allowed = [
    'title', 'slug', 'excerpt', 'content', 'featured_image',
    'category', 'tags', 'status', 'seo_title', 'seo_description', 'published_at',
  ]

  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  const { data, error } = await supabaseAdmin
    .from('journal_posts')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session || !isStaffRole(session)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { error } = await supabaseAdmin
    .from('journal_posts')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
