import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, isStaffRole } from '@/lib/auth'
import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM_EMAIL = 'Full Bloom Artelier <info@fullbloom.uk.com>'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.fullbloom.uk.com'

// ── GET /api/admin/trade-applications/:id ─────────────────────
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !isStaffRole(session)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('trade_applications')
    .select(`
      *,
      user:users!trade_applications_user_id_fkey(id, first_name, last_name, email, role, status)
    `)
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 404 })

  return NextResponse.json({ success: true, data: remapApp(data) })
}

// ── PATCH /api/admin/trade-applications/:id ───────────────────
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !isStaffRole(session)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  const body = await req.json()
  const { action, note } = body

  let updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  let userUpdate: Record<string, unknown> | null = null

  switch (action) {
    case 'approve':
      updateData = { ...updateData, status: 'approved', reviewed_at: new Date(), reviewed_by: session.id }
      userUpdate = { role: 'trade_user', status: 'approved' }
      break
    case 'decline':
      updateData = { ...updateData, status: 'declined', reviewed_at: new Date(), reviewed_by: session.id }
      userUpdate = { status: 'declined' }
      break
    case 'revoke':
      updateData = { ...updateData, status: 'revoked', reviewed_at: new Date(), reviewed_by: session.id }
      userUpdate = { role: 'retail_customer', status: 'revoked' }
      break
    case 'send_form':
      updateData = { ...updateData, status: 'form_sent', detailed_form_sent_at: new Date() }
      break
    case 'under_review':
      updateData = { ...updateData, status: 'under_review' }
      break
    case 'add_note':
      if (note !== undefined) updateData = { ...updateData, admin_notes: note }
      break
    default:
      return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
  }

  // Fetch full application for email context
  const { data: appBefore, error: fetchErr } = await supabaseAdmin
    .from('trade_applications')
    .select('*, user:users!trade_applications_user_id_fkey(id, first_name, last_name, email, password_hash)')
    .eq('id', id)
    .single()

  if (fetchErr) return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 })

  const { error } = await supabaseAdmin
    .from('trade_applications')
    .update(updateData)
    .eq('id', id)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  // Update user role/status if needed
  if (userUpdate && appBefore?.user_id) {
    await supabaseAdmin
      .from('users')
      .update(userUpdate)
      .eq('id', appBefore.user_id)
  }

  // On approval, if the applicant has no password yet (net-new account created
  // by the public application form), issue a one-time set-password link so they
  // can log in and access their trade pricing. Reuses the password-reset flow.
  let setPasswordUrl: string | null = null
  if (action === 'approve' && appBefore?.user_id) {
    const applicantUser = appBefore.user as Record<string, unknown> | null
    const hasPassword = !!applicantUser?.password_hash && String(applicantUser.password_hash).length > 0
    if (!hasPassword) {
      await supabaseAdmin
        .from('password_reset_tokens')
        .update({ used: true })
        .eq('user_id', appBefore.user_id)
        .eq('used', false)

      const rawToken  = randomBytes(48).toString('base64url')
      const tokenHash = await bcrypt.hash(rawToken, 10)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

      const { error: tokenErr } = await supabaseAdmin
        .from('password_reset_tokens')
        .insert({ user_id: appBefore.user_id, token_hash: tokenHash, expires_at: expiresAt.toISOString(), used: false })

      if (!tokenErr) {
        setPasswordUrl = `${SITE_URL}/reset-password?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(String(applicantUser?.email ?? ''))}`
      }
    }
  }

  // Send notification email
  if (resend && appBefore?.user) {
    const applicant = appBefore.user as Record<string, string>
    await sendNotificationEmail(action, {
      firstName: applicant.first_name,
      email:     applicant.email,
      companyName: appBefore.company_name as string,
      setPasswordUrl,
    })
  }

  return NextResponse.json({ success: true })
}

// ── Email helpers ─────────────────────────────────────────────

async function sendNotificationEmail(
  action: string,
  ctx: { firstName: string; email: string; companyName: string; setPasswordUrl?: string | null }
) {
  if (!resend) return

  const { firstName, email, companyName, setPasswordUrl } = ctx

  // On approval, net-new applicants get a set-password CTA; returning
  // account holders get a plain sign-in link.
  const approveCta = setPasswordUrl
    ? `<a href="${setPasswordUrl}" style="background:#4A6741;color:#F7F3EE;padding:14px 32px;text-decoration:none;font-size:13px;letter-spacing:0.1em;text-transform:uppercase">Set your password &amp; sign in</a>`
    : `<a href="${SITE_URL}/account" style="background:#4A6741;color:#F7F3EE;padding:14px 32px;text-decoration:none;font-size:13px;letter-spacing:0.1em;text-transform:uppercase">Access your account</a>`
  const approveSetPwLine = setPasswordUrl
    ? `<p style="font-size:15px;line-height:1.8;color:#5E6E5B">To activate your account, set your password using the button below. This link is valid for 7 days.</p>`
    : ''

  const templates: Record<string, { subject: string; html: string } | null> = {
    approve: {
      subject: 'Your Full Bloom Artelier trade account has been approved',
      html: `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#2C3A2F">
          <div style="border-bottom:2px solid #4A6741;padding-bottom:24px;margin-bottom:32px">
            <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#9CA89A;margin:0">Full Bloom Artelier</p>
          </div>
          <h1 style="font-size:28px;font-weight:300;margin-bottom:16px">Welcome to the Trade Programme</h1>
          <p style="font-size:15px;line-height:1.8;color:#5E6E5B">Dear ${firstName},</p>
          <p style="font-size:15px;line-height:1.8;color:#5E6E5B">
            We are delighted to confirm that your trade account application for <strong>${companyName}</strong> has been approved.
            You now have access to trade pricing, exclusive collections, and our FF&amp;E procurement services.
          </p>
          ${approveSetPwLine}
          <div style="margin:32px 0">
            ${approveCta}
          </div>
          <p style="font-size:14px;line-height:1.8;color:#9CA89A">
            If you have any questions, please reach out to us at <a href="mailto:info@fullbloom.uk.com" style="color:#4A6741">info@fullbloom.uk.com</a>.
          </p>
          <p style="font-size:14px;color:#9CA89A;margin-top:40px">Warm regards,<br>Full Bloom Artelier</p>
        </div>
      `,
    },
    decline: {
      subject: 'Your Full Bloom Artelier trade application',
      html: `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#2C3A2F">
          <div style="border-bottom:2px solid #4A6741;padding-bottom:24px;margin-bottom:32px">
            <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#9CA89A;margin:0">Full Bloom Artelier</p>
          </div>
          <h1 style="font-size:28px;font-weight:300;margin-bottom:16px">Trade Application Update</h1>
          <p style="font-size:15px;line-height:1.8;color:#5E6E5B">Dear ${firstName},</p>
          <p style="font-size:15px;line-height:1.8;color:#5E6E5B">
            Thank you for your interest in the Full Bloom Artelier trade programme.
            After careful consideration, we are unable to proceed with a trade account for <strong>${companyName}</strong> at this time.
          </p>
          <p style="font-size:15px;line-height:1.8;color:#5E6E5B">
            We would be happy to assist you as a retail customer in the meantime.
            Should your circumstances change, you are welcome to apply again.
          </p>
          <p style="font-size:14px;color:#9CA89A;margin-top:40px">Warm regards,<br>Full Bloom Artelier</p>
        </div>
      `,
    },
    send_form: {
      subject: 'Next steps for your Full Bloom Artelier trade application',
      html: `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#2C3A2F">
          <div style="border-bottom:2px solid #4A6741;padding-bottom:24px;margin-bottom:32px">
            <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#9CA89A;margin:0">Full Bloom Artelier</p>
          </div>
          <h1 style="font-size:28px;font-weight:300;margin-bottom:16px">Complete Your Trade Application</h1>
          <p style="font-size:15px;line-height:1.8;color:#5E6E5B">Dear ${firstName},</p>
          <p style="font-size:15px;line-height:1.8;color:#5E6E5B">
            Thank you for applying for a trade account on behalf of <strong>${companyName}</strong>.
            We'd like to learn a little more about your business before we proceed.
          </p>
          <p style="font-size:15px;line-height:1.8;color:#5E6E5B">
            Please complete the short supplementary form to help us process your application:
          </p>
          <div style="margin:32px 0">
            <a href="${SITE_URL}/trade/apply?step=detail" style="background:#4A6741;color:#F7F3EE;padding:14px 32px;text-decoration:none;font-size:13px;letter-spacing:0.1em;text-transform:uppercase">
              Complete your application
            </a>
          </div>
          <p style="font-size:14px;color:#9CA89A;margin-top:40px">Warm regards,<br>Full Bloom Artelier</p>
        </div>
      `,
    },
  }

  const tpl = templates[action]
  if (!tpl) return

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: tpl.subject,
    html: tpl.html,
  })
}

// ── Remap helper ──────────────────────────────────────────────
function remapApp(a: Record<string, unknown>) {
  return {
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
  }
}
