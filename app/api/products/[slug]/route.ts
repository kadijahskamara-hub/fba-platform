import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { isPubliclyVisible } from '@/lib/productVisibility'
import { logAudit } from '@/lib/audit'

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await getSession()
  const client  = session?.role === 'admin' ? supabaseAdmin : supabase

  const { data, error } = await client
    .from('products')
    .select(`
      *,
      category:categories(id, name, slug),
      subcategory:subcategories(id, name, slug),
      artisan:artisans(id, name, slug, location, bio, hero_image, craft_category),
      specifications:product_specifications(*),
      option_groups:product_option_groups(*, values:product_option_values(*))
    `)
    .eq('slug', params.slug)
    .single()

  if (error || !data) {
    return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 })
  }

  // Only publicly visible products for non-admins
  if (session?.role !== 'admin' && !isPubliclyVisible(data)) {
    return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true, data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await getSession()
  if (session?.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()

    const PRODUCT_ALLOWED: string[] = [
      'name', 'slug', 'sku', 'reference_code', 'category_id', 'subcategory_id',
      'artisan_id', 'description', 'short_description', 'retail_price', 'trade_price',
      'supplier_cost', 'price_type', 'currency', 'visibility', 'audience',
      'is_fba_collection', 'is_fba_home',
      'lead_time', 'shipping_origin', 'shipping_notes',
      'images', 'seo_title', 'seo_description',
      'technical_description', 'customisation_note', 'made_to_order',
      'dispatch_time_label', 'lead_time_min_weeks', 'lead_time_max_weeks',
      'min_order_quantity', 'public_brand_visible', 'hide_finish_options',
    ]

    const camelToSnake: Record<string, string> = {
      name: 'name', slug: 'slug', sku: 'sku',
      referenceCode: 'reference_code', categoryId: 'category_id',
      subcategoryId: 'subcategory_id', artisanId: 'artisan_id',
      description: 'description', shortDescription: 'short_description',
      retailPrice: 'retail_price', tradePrice: 'trade_price',
      supplierCost: 'supplier_cost', priceType: 'price_type',
      currency: 'currency', visibility: 'visibility', audience: 'audience',
      isFbaCollection: 'is_fba_collection', isFbaHome: 'is_fba_home',
      leadTime: 'lead_time', shippingOrigin: 'shipping_origin',
      shippingNotes: 'shipping_notes', images: 'images',
      seoTitle: 'seo_title', seoDescription: 'seo_description',
      technicalDescription: 'technical_description',
      customisationNote: 'customisation_note',
      madeToOrder: 'made_to_order',
      dispatchTimeLabel: 'dispatch_time_label',
      leadTimeMinWeeks: 'lead_time_min_weeks',
      leadTimeMaxWeeks: 'lead_time_max_weeks',
      minOrderQuantity: 'min_order_quantity',
      publicBrandVisible: 'public_brand_visible',
      hideFinishOptions: 'hide_finish_options',
    }

    const productUpdates: Record<string, unknown> = {
      updated_at: new Date(),
      last_updated_by: session.id,
    }
    for (const [camel, snake] of Object.entries(camelToSnake)) {
      if (body[camel] !== undefined && PRODUCT_ALLOWED.includes(snake)) {
        productUpdates[snake] = body[camel]
      }
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .update(productUpdates)
      .eq('slug', params.slug)
      .select('id')
      .single()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    if (body.specifications && data?.id) {
      const sp = body.specifications
      const specData: Record<string, unknown> = {
        product_id:          data.id,
        material:            sp.material            ?? null,
        finish:              sp.finish              ?? null,
        fabric:              sp.fabric              ?? null,
        width_mm:            sp.widthMm             ?? null,
        depth_mm:            sp.depthMm             ?? null,
        height_mm:           sp.heightMm            ?? null,
        seat_height_mm:      sp.seatHeightMm        ?? null,
        diameter_mm:         sp.diameterMm          ?? null,
        weight_kg:           sp.weightKg            ?? null,
        com_available:       sp.comAvailable        ?? false,
        care_instructions:   sp.careInstructions    ?? null,
        technical_notes:     sp.technicalNotes      ?? null,
        bulb_type:           sp.bulbType            ?? null,
        wattage:             sp.wattage             ?? null,
        voltage:             sp.voltage             ?? null,
        plug_type:           sp.plugType            ?? null,
        cable_length:        sp.cableLength         ?? null,
        dimmable:            sp.dimmable            ?? null,
        ip_rating:           sp.ipRating            ?? null,
        frame_material:                sp.frameMaterial               ?? null,
        frame_material_options:        sp.frameMaterialOptions        ?? null,
        frame_finish_colour_options:   sp.frameFinishColourOptions    ?? null,
        armrest_material:              sp.armrestMaterial             ?? null,
        armrest_finish_colour_options: sp.armrestFinishColourOptions  ?? null,
        seat_material:                 sp.seatMaterial                ?? null,
        back_material:                 sp.backMaterial                ?? null,
        seat_back_upholstery_options:  sp.seatBackUpholsteryOptions   ?? null,
        upholstered_legs_colour_options: sp.upholsteredLegsColourOptions ?? null,
        glides:                        sp.glides                      ?? null,
        stackable:                     sp.stackable                   ?? null,
        indoor_outdoor_use:            sp.indoorOutdoorUse            ?? null,
        footprint_m2:                  sp.footprintM2                 ?? null,
        shipping_volume_m3:            sp.shippingVolumeM3            ?? null,
        other_available_options:       sp.otherAvailableOptions       ?? null,
        leg_material:            sp.legMaterial            ?? null,
        leg_material_options:    sp.legMaterialOptions     ?? null,
        leg_finish_colour_options: sp.legFinishColourOptions ?? null,
        top_material:            sp.topMaterial            ?? null,
        top_material_options:    sp.topMaterialOptions     ?? null,
        top_thickness_mm:        sp.topThicknessMm         ?? null,
        top_finish_colour_options: sp.topFinishColourOptions ?? null,
        top_shape_options:       sp.topShapeOptions        ?? null,
        top_size_options:        sp.topSizeOptions         ?? null,
        base_pedestal_type:      sp.basePedestalType       ?? null,
        feet_glides:             sp.feetGlides             ?? null,
        suitable_table_top_sizes: sp.suitableTableTopSizes ?? null,
        extension_options:       sp.extensionOptions       ?? null,
        body_frame_material:          sp.bodyFrameMaterial          ?? null,
        base_material:                sp.baseMaterial               ?? null,
        diffuser_shade_material:      sp.diffuserShadeMaterial      ?? null,
        fringes_trim_material:        sp.fringesTrimMaterial        ?? null,
        body_frame_colour_options:    sp.bodyFrameColourOptions     ?? null,
        base_colour_options:          sp.baseColourOptions          ?? null,
        diffuser_shade_colour_options: sp.diffuserShadeColourOptions ?? null,
        fringes_colour_options:       sp.fringesColourOptions       ?? null,
        suitable_for:                 sp.suitableFor                ?? null,
        rechargeable:                 sp.rechargeable               ?? null,
        battery_life:                 sp.batteryLife                ?? null,
        light_source_type:            sp.lightSourceType            ?? null,
        recommended_light_source:     sp.recommendedLightSource     ?? null,
        lumens:                       sp.lumens                     ?? null,
        colour_temperature:           sp.colourTemperature          ?? null,
        average_life_light_source:    sp.averageLifeLightSource     ?? null,
        spare_parts_available:        sp.sparePartsAvailable        ?? null,
        lighting_spec_notes:          sp.lightingSpecNotes          ?? null,
      }

      await supabaseAdmin
        .from('product_specifications')
        .upsert(specData, { onConflict: 'product_id' })
    }

    const { data: updated } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', data.id)
      .single()

    await logAudit({
      actor: session,
      action: 'product.updated',
      entityType: 'product',
      entityId: data.id,
      after: productUpdates,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    console.error('Product PATCH error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
