import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { applyAudienceFilter } from '@/lib/productVisibility'

export async function GET(req: NextRequest) {
  const session          = await getSession()
  const { searchParams } = req.nextUrl

  const category       = searchParams.get('category')
  const subcategory    = searchParams.get('subcategory')
  const search         = searchParams.get('q')
  const artisan        = searchParams.get('artisan')
  const audience       = searchParams.get('audience')
  const material       = searchParams.get('material')
  const minPrice       = searchParams.get('min_price')
  const maxPrice       = searchParams.get('max_price')
  const collection     = searchParams.get('collection')
  const sort           = searchParams.get('sort') ?? 'featured'
  // Technical Passport filters
  const fireRetardant  = searchParams.get('fire_retardant')
  const stainProofed   = searchParams.get('stain_proofed')
  const rubCount40k    = searchParams.get('rub_count_40k')
  const maxLeadTime    = searchParams.get('max_lead_time')
  // Edit catalogue filters
  const finishType     = searchParams.get('finish_type')
  const region         = searchParams.get('region')

  const page   = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit  = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '24')))
  const offset = (page - 1) * limit

  const client = session?.role === 'admin' ? supabaseAdmin : supabase

  let query = client
    .from('products')
    .select(`
      *,
      category:categories(id, name, slug),
      subcategory:subcategories(id, name, slug),
      artisan:artisans(id, name, slug, location)
    `, { count: 'exact' })

  // Admin sees all; everyone else only published
  if (session?.role !== 'admin') {
    query = query.eq('visibility', 'published').is('archived_at', null).is('deleted_at', null) as typeof query
  }

  // Resolve category/subcategory slugs to IDs for reliable filtering
  if (category) {
    const { data: cat } = await client.from('categories').select('id').eq('slug', category).single()
    if (cat) query = query.eq('category_id', cat.id) as typeof query
  }
  if (subcategory) {
    const { data: sub } = await client.from('subcategories').select('id').eq('slug', subcategory).single()
    if (sub) query = query.eq('subcategory_id', sub.id) as typeof query
  }

  if (artisan)               query = query.eq('artisan_id', artisan)                       as typeof query
  if (collection === 'true') query = query.eq('is_fba_collection', true)                   as typeof query
  if (material)              query = query.ilike('material', `%${material}%`)              as typeof query
  if (minPrice)              query = query.gte('retail_price', parseFloat(minPrice))        as typeof query
  if (maxPrice)              query = query.lte('retail_price', parseFloat(maxPrice))        as typeof query
  if (finishType)            query = query.eq('finish_type', finishType)                   as typeof query
  if (region)                query = query.eq('origin_region', region)                     as typeof query
  if (fireRetardant === 'true') query = query.eq('fire_retardant', true)                   as typeof query
  if (stainProofed  === 'true') query = query.eq('stain_proofed', true)                    as typeof query
  if (rubCount40k   === 'true') query = query.eq('rub_count_40k', true)                    as typeof query
  if (maxLeadTime)           query = query.lte('lead_time_weeks', parseInt(maxLeadTime))   as typeof query

  if (audience === 'trade') {
    query = query.in('audience', ['trade', 'retail_and_trade']) as typeof query
  } else if (audience === 'retail') {
    query = query.in('audience', ['retail', 'retail_and_trade']) as typeof query
  }

  // Role-based audience visibility applied in SQL so `count` (used for
  // "N pieces available" + pagination) matches the returned list exactly.
  query = applyAudienceFilter(query, session?.role) as typeof query

  if (search) {
    query = query.or(`name.ilike.%${search}%,short_description.ilike.%${search}%`) as typeof query
  }

  // Sort
  const sortMap: Record<string, { col: string; asc: boolean }> = {
    featured:   { col: 'created_at',      asc: false },
    price_asc:  { col: 'retail_price',    asc: true  },
    price_desc: { col: 'retail_price',    asc: false },
    lead_time:  { col: 'lead_time_weeks', asc: true  },
  }
  const { col, asc } = sortMap[sort] ?? sortMap.featured
  query = query.order(col, { ascending: asc }) as typeof query

  const { data, count, error } = await query.range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  // Audience/visibility filtering is now applied in SQL (above), so `data`
  // and `count` are consistent — no post-fetch filtering needed.
  const products = data ?? []

  return NextResponse.json({
    success: true,
    data:  products,
    meta:  { total: count ?? 0, page, limit, pages: Math.ceil((count ?? 0) / limit) },
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (session?.role !== 'admin' && session?.role !== 'staff') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()

    if (!body.categoryId) {
      return NextResponse.json({ success: false, error: 'Category is required.' }, { status: 400 })
    }

    const { data: product, error } = await supabaseAdmin
      .from('products')
      .insert({
        name:              body.name,
        slug:              body.slug,
        sku:               body.sku || null,
        reference_code:    body.referenceCode || null,
        category_id:       body.categoryId || null,
        subcategory_id:    body.subcategoryId || null,
        artisan_id:        body.artisanId || null,
        description:       body.description,
        short_description: body.shortDescription || null,
        retail_price:      body.retailPrice ?? null,
        trade_price:       body.tradePrice ?? null,
        supplier_cost:     body.supplierCost ?? null,
        price_type:        body.priceType ?? 'fixed',
        currency:          body.currency ?? 'GBP',
        visibility:        body.visibility ?? 'draft',
        audience:          body.audience ?? 'retail_and_trade',
        is_fba_collection: body.isFbaCollection ?? false,
        is_fba_home:       body.isFbaHome       ?? false,
        lead_time:         body.leadTime || null,
        lead_time_weeks:   body.leadTimeWeeks ?? null,
        shipping_origin:   body.shippingOrigin || null,
        shipping_notes:    body.shippingNotes || null,
        images:            body.images ?? [],
        seo_title:         body.seoTitle || null,
        seo_description:   body.seoDescription || null,
        fire_retardant:    body.fireRetardant  ?? false,
        stain_proofed:     body.stainProofed   ?? false,
        rub_count_40k:     body.rubCount40k    ?? false,
        finish_type:       body.finishType   || null,
        origin_region:     body.originRegion || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    if (body.specifications) {
      await supabaseAdmin.from('product_specifications').insert({
        product_id:           product.id,
        dimensions_summary:   body.specifications.dimensionsSummary || null,
        width_mm:             body.specifications.widthMm ?? null,
        depth_mm:             body.specifications.depthMm ?? null,
        height_mm:            body.specifications.heightMm ?? null,
        seat_height_mm:       body.specifications.seatHeightMm ?? null,
        diameter_mm:          body.specifications.diameterMm ?? null,
        weight_kg:            body.specifications.weightKg ?? null,
        material:             body.specifications.material || null,
        finish:               body.specifications.finish || null,
        fabric:               body.specifications.fabric || null,
        com_available:        body.specifications.comAvailable ?? false,
        care_instructions:    body.specifications.careInstructions || null,
        technical_notes:      body.specifications.technicalNotes || null,
        bulb_type:            body.specifications.bulbType    || null,
        wattage:              body.specifications.wattage     || null,
        voltage:              body.specifications.voltage     || null,
        plug_type:            body.specifications.plugType    || null,
        cable_length:         body.specifications.cableLength || null,
        dimmable:             body.specifications.dimmable    ?? null,
        ip_rating:            body.specifications.ipRating    || null,
        frame_material:                body.specifications.frameMaterial               || null,
        frame_material_options:        body.specifications.frameMaterialOptions        || null,
        frame_finish_colour_options:   body.specifications.frameFinishColourOptions    || null,
        armrest_material:              body.specifications.armrestMaterial             || null,
        armrest_finish_colour_options: body.specifications.armrestFinishColourOptions  || null,
        seat_material:                 body.specifications.seatMaterial                || null,
        back_material:                 body.specifications.backMaterial                || null,
        seat_back_upholstery_options:  body.specifications.seatBackUpholsteryOptions   || null,
        upholstered_legs_colour_options: body.specifications.upholsteredLegsColourOptions || null,
        glides:                        body.specifications.glides                      || null,
        stackable:                     body.specifications.stackable                   ?? null,
        indoor_outdoor_use:            body.specifications.indoorOutdoorUse            || null,
        footprint_m2:                  body.specifications.footprintM2                 ?? null,
        shipping_volume_m3:            body.specifications.shippingVolumeM3            ?? null,
        other_available_options:       body.specifications.otherAvailableOptions       || null,
        leg_material:            body.specifications.legMaterial            || null,
        leg_material_options:    body.specifications.legMaterialOptions     || null,
        leg_finish_colour_options: body.specifications.legFinishColourOptions || null,
        top_material:            body.specifications.topMaterial            || null,
        top_material_options:    body.specifications.topMaterialOptions     || null,
        top_thickness_mm:        body.specifications.topThicknessMm         ?? null,
        top_finish_colour_options: body.specifications.topFinishColourOptions || null,
        top_shape_options:       body.specifications.topShapeOptions        || null,
        top_size_options:        body.specifications.topSizeOptions         || null,
        base_pedestal_type:      body.specifications.basePedestalType       || null,
        feet_glides:             body.specifications.feetGlides             || null,
        suitable_table_top_sizes: body.specifications.suitableTableTopSizes || null,
        extension_options:       body.specifications.extensionOptions       || null,
        body_frame_material:          body.specifications.bodyFrameMaterial          || null,
        base_material:                body.specifications.baseMaterial               || null,
        diffuser_shade_material:      body.specifications.diffuserShadeMaterial      || null,
        fringes_trim_material:        body.specifications.fringesTrimMaterial        || null,
        body_frame_colour_options:    body.specifications.bodyFrameColourOptions     || null,
        base_colour_options:          body.specifications.baseColourOptions          || null,
        diffuser_shade_colour_options: body.specifications.diffuserShadeColourOptions || null,
        fringes_colour_options:       body.specifications.fringesColourOptions       || null,
        suitable_for:                 body.specifications.suitableFor                || null,
        rechargeable:                 body.specifications.rechargeable               ?? null,
        battery_life:                 body.specifications.batteryLife                || null,
        light_source_type:            body.specifications.lightSourceType            || null,
        recommended_light_source:     body.specifications.recommendedLightSource     || null,
        lumens:                       body.specifications.lumens                     || null,
        colour_temperature:           body.specifications.colourTemperature          || null,
        average_life_light_source:    body.specifications.averageLifeLightSource     || null,
        spare_parts_available:        body.specifications.sparePartsAvailable        || null,
        lighting_spec_notes:          body.specifications.lightingSpecNotes          || null,
      })
    }

    return NextResponse.json({ success: true, data: product })
  } catch (err) {
    console.error('Product POST error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
