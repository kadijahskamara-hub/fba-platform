import { NextRequest, NextResponse } from 'next/server'
import { getSession, isStaffRole } from '@/lib/auth'
import { syncIntegration } from '@/lib/syncEngine'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session || !isStaffRole(session)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    const result = await syncIntegration(params.id)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
}
