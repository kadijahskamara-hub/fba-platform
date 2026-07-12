import { NextRequest, NextResponse } from 'next/server'
import { getSession, isStaffRole } from '@/lib/auth'
import { parseCSV, syncFromRows } from '@/lib/syncEngine'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params
  const session = await getSession()
  if (!session || !isStaffRole(session)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const MAX_SIZE = 20 * 1024 * 1024 // 20MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 20MB.' }, { status: 413 })
    }

    const text = await file.text()
    const rows = parseCSV(text)
    if (!rows.length) return NextResponse.json({ error: 'CSV is empty or has no data rows' }, { status: 400 })
    const result = await syncFromRows(params.id, rows)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
}
