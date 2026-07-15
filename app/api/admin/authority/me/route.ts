import { NextResponse } from 'next/server'
import { getCommercialSession } from '@/lib/commercial/permissions'

// ============================================================
// GET /api/admin/authority/me  (Sprint 7.1)
// Cheap live Ultra check for UI gating (e.g. record-delete
// buttons render only for Ultra Admins). Never cached.
// ============================================================

export const dynamic = 'force-dynamic'

export async function GET() {
  const cs = await getCommercialSession()
  return NextResponse.json({
    success: true,
    data: { isUltraAdmin: Boolean(cs?.isUltraAdmin) },
  })
}
