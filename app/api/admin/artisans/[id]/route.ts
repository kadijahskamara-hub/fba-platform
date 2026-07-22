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
    // Supplier/ordering details (QA item 15) — used to auto-address
    // purchase orders instead of a manual acknowledgement link.
    primary_contact_name, order_email, finance_email, telephone, address, country,
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
      primary_contact_name: primary_contact_name || null,
      order_email:      order_email || null,
      finance_email:    finance_email || null,
      telephone:        telephone || null,
      address:          address || null,
      country:          country || null,
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

  // Final amendments §3: dependency-protected deletion with a clear
  // explanation instead of a raw foreign-key error.
  const deps: Array<{ table: string; column: string; label: string }> = [
    { table: 'products',             column: 'artisan_id',             label: 'products' },
    { table: 'proforma_line_items',  column: 'manufacturer_id',        label: 'quote lines' },
    { table: 'supplier_allocations', column: 'manufacturer_id',        label: 'supplier allocations' },
    { table: 'purchase_orders',      column: 'manufacturer_id',        label: 'purchase orders' },
    { table: 'deliveries',           column: 'origin_manufacturer_id', label: 'deliveries' },
  ]
  const blocking: string[] = []
  for (const dep of deps) {
    const { count } = await supabaseAdmin
      .from(dep.table).select(dep.column, { count: 'exact', head: true }).eq(dep.column, params.id)
    if ((count ?? 0) > 0) blocking.push(`${count} ${dep.label}`)
  }
  if (blocking.length > 0) {
    return NextResponse.json({
      success: false,
      error: `This artisan cannot be deleted while still referenced by ${blocking.join(', ')}. Reassign or remove those first, or archive the artisan instead.`,
    }, { status: 409 })
  }

  const { error } = await supabaseAdmin
    .from('artisans')
    .delete()
    .eq('id', params.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  // Remove this artisan's uploaded media folder (best effort).
  const { data: objs } = await supabaseAdmin.storage.from('artisan-media').list(params.id, { limit: 100 })
  if (objs && objs.length > 0) {
    await supabaseAdmin.storage.from('artisan-media').remove(objs.map(o => `${params.id}/${o.name}`))
  }

  return NextResponse.json({ success: true })
}
