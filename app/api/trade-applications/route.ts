import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Honeypot: hidden "website" field — bots fill it, humans never see it.
    if (typeof body.hp === 'string' && body.hp.trim() !== '') {
      return NextResponse.json({ success: true })
    }
    const {
      firstName, lastName, email, phone,
      companyName, businessType, website, location,
      projectType, estimatedBudget, howDidYouHear,
      consentMarketing = false,
    } = body

    if (!firstName || !lastName || !email || !companyName || !businessType) {
      return NextResponse.json({ success: false, error: 'Required fields are missing.' }, { status: 400 })
    }

    // Check if a session exists (logged-in user applying)
    const session = await getSession()
    let userId: string | null = session?.id ?? null

    // If no session, check if user already exists or create one as trade_applicant
    if (!userId) {
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id, role')
        .eq('email', email.toLowerCase().trim())
        .single()

      if (existingUser) {
        userId = existingUser.id
      } else {
        // Create a trade applicant user (no password yet — they'll set it on approval)
        const { data: newUser } = await supabaseAdmin
          .from('users')
          .insert({
            first_name:    firstName.trim(),
            last_name:     lastName.trim(),
            email:         email.toLowerCase().trim(),
            password_hash: '', // empty — trade applicants set password on approval
            role:          'trade_applicant',
            status:        'pending',
          })
          .select('id')
          .single()
        userId = newUser?.id ?? null
      }
    }

    // Create application record
    const { data: application, error } = await supabaseAdmin
      .from('trade_applications')
      .insert({
        user_id:          userId,
        company_name:     companyName.trim(),
        business_type:    businessType,
        website:          website?.trim() || null,
        location:         location?.trim() || null,
        project_type:     projectType || null,
        estimated_budget: estimatedBudget || null,
        how_did_you_hear: howDidYouHear || null,
        status:           'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Trade application error:', error)
      return NextResponse.json({ success: false, error: 'Failed to submit application.' }, { status: 500 })
    }

    // Store contact record
    await supabaseAdmin.from('contacts').insert({
      first_name:        firstName.trim(),
      last_name:         lastName.trim(),
      email:             email.toLowerCase().trim(),
      phone:             phone?.trim() || null,
      company_name:      companyName.trim(),
      contact_type:      'trade',
      source:            'trade_application',
      consent_marketing: consentMarketing,
    })

    // TODO: Send confirmation email via Resend

    return NextResponse.json({ success: true, data: { id: application.id } })
  } catch (err) {
    console.error('Trade application POST error:', err)
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 })
  }
}
