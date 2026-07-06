import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

/**
 * POST /api/service-enquiries
 * Accepts homepage / service enquiry form submissions.
 * Stores in both `service_enquiries` and `contacts` tables.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()

  const body = await req.json()
  const {
    firstName,
    lastName,
    email,
    phone,
    companyName,
    enquiryType,   // 'trade_access' | 'product_sourcing' | 'atelier_commission' | 'general_procurement' | 'press' | 'other'
    message,
    projectLocation,
    estimatedBudget,
    consentMarketing = false,
  } = body

  // Honeypot: hidden "website" field — bots fill it, humans never see it.
  // Return success without storing so bots can't detect the trap.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ success: true })
  }

  if (!email?.trim() || !message?.trim() || !enquiryType) {
    return NextResponse.json(
      { success: false, error: 'email, enquiryType, and message are required.' },
      { status: 400 }
    )
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email.trim())) {
    return NextResponse.json(
      { success: false, error: 'Please enter a valid email address.' },
      { status: 400 }
    )
  }

  // Upsert into contacts
  const { data: existingContact } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (existingContact) {
    // Update existing contact record
    await supabaseAdmin
      .from('contacts')
      .update({
        first_name:            firstName?.trim() || null,
        last_name:             lastName?.trim()  || null,
        phone:                 phone?.trim()      || null,
        company_name:          companyName?.trim() || null,
        subscribed_marketing:  consentMarketing,
        source:                'service_enquiry',
        message:               message.trim(),
      })
      .eq('id', existingContact.id)
  } else {
    await supabaseAdmin
      .from('contacts')
      .insert({
        user_id:               session?.id ?? null,
        first_name:            firstName?.trim()    || null,
        last_name:             lastName?.trim()     || null,
        email:                 email.toLowerCase().trim(),
        phone:                 phone?.trim()         || null,
        company_name:          companyName?.trim()   || null,
        contact_type:          enquiryType === 'press' ? 'press' : 'general',
        source:                'service_enquiry',
        subscribed_marketing:  consentMarketing,
        message:               message.trim(),
      })
  }

  // Insert into service_enquiries
  const { data, error } = await supabaseAdmin
    .from('service_enquiries')
    .insert({
      user_id:          session?.id ?? null,
      first_name:       firstName?.trim()     || null,
      last_name:        lastName?.trim()      || null,
      email:            email.toLowerCase().trim(),
      phone:            phone?.trim()          || null,
      company_name:     companyName?.trim()    || null,
      enquiry_type:     enquiryType,
      message:          message.trim(),
      project_location: projectLocation?.trim() || null,
      estimated_budget: estimatedBudget ?? null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

/**
 * GET /api/service-enquiries — admin only
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = 20
  const offset = (page - 1) * limit

  const { data, error, count } = await supabaseAdmin
    .from('service_enquiries')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [], total: count ?? 0 })
}
