import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isStaff } from '@/lib/auth'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }
  const { data, error } = await supabaseAdmin
    .from('artisans')
    .select('*')
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 404 })
  return NextResponse.json({ success: true, data })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    name, slug, location, short_bio, bio,
    craft_category, profile_image, gallery_images,
    website, instagram_handle, is_active,
  } = body

  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ success: false, error: 'Name and slug are required.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('artisans')
    .update({
      name:             name.trim(),
      slug:             slug.trim(),
      location:         location || null,
      short_bio:        short_bio || null,
      bio:              bio || null,
      craft_category:   craft_category || null,
      profile_image:    profile_image || null,
      gallery_images:   gallery_images ?? [],
      website:          website || null,
      instagram_handle: instagram_handle || null,
      is_active:        is_active ?? true,
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  if (!(await isStaff())) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }
  const { error } = await supabaseAdmin
    .from('artisans')
    .delete()
    .eq('id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
