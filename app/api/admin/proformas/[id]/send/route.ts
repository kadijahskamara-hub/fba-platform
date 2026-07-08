import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPipelineSession } from '@/lib/pipelineAuth'
import { logAudit } from '@/lib/audit'
import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM_EMAIL = 'Full Bloom Artelier <info@fullbloom.uk.com>'

function money(n: number | null, cur: string) {
  if (n == null) return '—'
  const sym = cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '£'
  return `${sym}${Number(n).toLocaleString('en-GB')}`
}

// POST /api/admin/proformas/:id/send — record a client or manufacturer send
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getPipelineSession()
  if (!session) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const sendType = body.sendType as string
  if (sendType !== 'client' && sendType !== 'manufacturer') {
    return NextResponse.json({ success: false, error: 'Invalid send type' }, { status: 400 })
  }
  if (sendType === 'manufacturer' && !body.manufacturerId && !body.manufacturerName) {
    return NextResponse.json({ success: false, error: 'Choose which manufacturer this copy is for.' }, { status: 400 })
  }

  const { data: proforma, error: pErr } = await supabaseAdmin
    .from('proformas')
    .select('*, items:proforma_line_items(*, manufacturer:artisans(id, name))')
    .eq('id', params.id)
    .single()
  if (pErr || !proforma) return NextResponse.json({ success: false, error: 'Proforma not found' }, { status: 404 })

  // Record the send event.
  const { data: sendRow, error: sErr } = await supabaseAdmin
    .from('proforma_sends')
    .insert({
      proforma_id:      params.id,
      send_type:        sendType,
      manufacturer_id:  body.manufacturerId || null,
      manufacturer_name: body.manufacturerName || null,
      recipient_email:  body.recipientEmail || null,
      note:             body.note || null,
      sent_by:          session.id,
    })
    .select()
    .single()
  if (sErr) return NextResponse.json({ success: false, error: sErr.message }, { status: 500 })

  // Optionally email the recipient a summary (client = all lines;
  // manufacturer = only that manufacturer's lines).
  let emailed = false
  if (resend && body.recipientEmail) {
    const all = (proforma.items ?? []) as Record<string, unknown>[]
    const lines = sendType === 'manufacturer'
      ? all.filter(it => (it.manufacturer_id ?? null) === (body.manufacturerId ?? null) ||
                         (body.manufacturerName && it.manufacturer_name === body.manufacturerName))
      : all
    const cur = (proforma.currency as string) || 'GBP'
    const rows = lines.map(it => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${it.name as string}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${it.quantity as number}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${money(it.unit_price as number | null, cur)}</td>
      </tr>`).join('')
    const audienceLabel = sendType === 'manufacturer' ? 'Manufacturer copy' : 'Client copy'
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: body.recipientEmail,
        subject: `Proforma ${proforma.proforma_number} — ${proforma.project_name ?? 'Full Bloom Artelier'}`,
        html: `
          <div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;color:#2C3A2F">
            <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#9CA89A">Full Bloom Artelier · ${audienceLabel}</p>
            <h1 style="font-size:24px;font-weight:300">Proforma ${proforma.proforma_number}</h1>
            ${proforma.project_name ? `<p style="color:#5E6E5B">${proforma.project_name}${proforma.project_location ? ` · ${proforma.project_location}` : ''}</p>` : ''}
            ${body.note ? `<p style="color:#5E6E5B">${body.note}</p>` : ''}
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
              <thead><tr>
                <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #4A6741">Item</th>
                <th style="text-align:center;padding:6px 10px;border-bottom:2px solid #4A6741">Qty</th>
                <th style="text-align:right;padding:6px 10px;border-bottom:2px solid #4A6741">Unit</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`,
      })
      emailed = true
    } catch {
      emailed = false
    }
  }

  await logAudit({ actor: session, action: 'proforma.sent', entityType: 'proforma', entityId: params.id,
    after: { sendType, manufacturerId: body.manufacturerId ?? null, recipient: body.recipientEmail ?? null, emailed } })

  return NextResponse.json({ success: true, data: sendRow, emailed })
}
