import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, isStaffRole } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session || !isStaffRole(session)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('*, subcategories(*)')
    .order('sort_order')

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}
