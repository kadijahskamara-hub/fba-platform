import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession, isStaffRole } from '@/lib/auth'

// Categories index for admin — includes lifecycle fields and product
// counts so the management page (final amendments §5) can show
// visibility, dependencies and ordering at a glance.

export async function GET() {
  const session = await getSession()
  if (!session || !isStaffRole(session)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const [{ data, error }, { data: productRefs }] = await Promise.all([
    supabaseAdmin
      .from('categories')
      .select('*, subcategories(*)')
      .order('sort_order'),
    supabaseAdmin.from('products').select('category_id').not('category_id', 'is', null),
  ])

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const counts = new Map<string, number>()
  for (const r of (productRefs ?? []) as Array<{ category_id: string }>) {
    counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1)
  }

  const withCounts = (data ?? []).map((c: Record<string, unknown>) => ({
    ...c,
    product_count: counts.get(c.id as string) ?? 0,
  }))

  return NextResponse.json({ success: true, data: withCounts })
}
