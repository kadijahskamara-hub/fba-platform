import { NextResponse } from 'next/server'

// DEPRECATED — proformas are no longer emailed from the platform.
// Staff download branded PDF documents (GET /api/admin/proformas/:id/document)
// and attach them to emails manually. Downloads are logged via
// POST /api/admin/proformas/:id/download.
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: 'Proforma emailing has been retired. Download the PDF from the proforma page and attach it to your email.',
    },
    { status: 410 },
  )
}
