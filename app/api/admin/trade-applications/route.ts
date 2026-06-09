import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, isStaffRole } from '@/lib/auth'

// GET /api/admin/trade-applications — list all (with optional ?status= filter)
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || !isStaffRole(session)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const status = req.nextUrl.searchParams.get('status')

  let query = supabaseAdmin
    .from('trade_applications')
    .select(`
      *,
      user:users(id, first_name, last_name, email, role, status)
    `)
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status) as typeof query
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const apps = (data ?? []).map((a: Record<string, unknown>) => ({
    id:                  a.id,
    userId:              a.user_id,
    companyName:         a.company_name,
    businessType:        a.business_type,
    website:             a.website,
    location:            a.location,
    projectType:         a.project_type,
    estimatedBudget:     a.estimated_budget,
    howDidYouHear:       a.how_did_you_hear,
    vatNumber:           a.vat_number,
    companyRegistration: a.company_registration,
    tradeReferences:     a.trade_references,
    portfolioUrl:        a.portfolio_url,
    annualSpendEstimate: a.annual_spend_estimate,
    status:              a.status,
    adminNotes:          a.admin_notes,
    detailedFormSentAt:  a.detailed_form_sent_at,
    reviewedAt:          a.reviewed_at,
    reviewedBy:          a.reviewed_by,
    createdAt:           a.created_at,
    updatedAt:           a.updated_at,
    user: a.user ? {
      id:        (a.user as Record<string,unknown>).id,
      firstName: (a.user as Record<string,unknown>).first_name,
      lastName:  (a.user as Record<string,unknown>).last_name,
      email:     (a.user as Record<string,unknown>).email,
      role:      (a.user as Record<string,unknown>).role,
      status:    (a.user as Record<string,unknown>).status,
    } : null,
  }))

  return NextResponse.json({ success: true, data: apps })
}
