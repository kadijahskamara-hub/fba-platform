import { NextRequest, NextResponse } from 'next/server'
import { requireCommercial } from '@/lib/commercial/permissions'
import { createDeliveryConfirmationToken, isErr } from '@/lib/commercial/deliveries'
import { vUuid, ValidationError } from '@/lib/commercial/validation'

// POST /api/admin/deliveries/:id/confirmation-link — mint a secure,
// single-use confirmation link (revokes any previous active link).
// The raw token is returned ONCE and never stored (SHA-256 at rest).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const cs = await requireCommercial('delivery_confirm')
  if (!cs) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  try {
    vUuid(params.id, 'id')
    const result = await createDeliveryConfirmationToken({ deliveryId: params.id, actor: cs.user })
    if (isErr(result)) return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    const origin = req.nextUrl.origin
    return NextResponse.json({
      success: true,
      data: { ...result.data, absoluteUrl: `${origin}${result.data.url}` },
    })
  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Could not create the confirmation link.' }, { status: 500 })
  }
}
