import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { createInstallation, isErr } from '@/lib/commercial/deliveries'
import { ValidationError, vUuid, vUuidOrNull, vString, vDate } from '@/lib/commercial/validation'

// POST /api/admin/installations — create an installation record
// (own FBA-INST numbering, separate lifecycle, spec §2.5/§9.2).
export async function POST(req: NextRequest) {
  const cs = await requireCommercial('installation_manage')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const result = await createInstallation({
      orderId: vUuid(body.orderId, 'orderId'),
      scheduledDate: vDate(body.scheduledDate, 'scheduledDate'),
      installerName: vString(body.installerName, 'installerName', { max: 200 }),
      installerContact: vString(body.installerContact, 'installerContact', { max: 300 }),
      accessNotes: vString(body.accessNotes, 'accessNotes', { max: 4000 }),
      linkedDeliveryId: vUuidOrNull(body.linkedDeliveryId, 'linkedDeliveryId'),
      actor: cs.user,
    })
    if (isErr(result)) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    return NextResponse.json({ success: true, data: result.data })
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Could not create the installation.' }, { status: 500 })
  }
}
