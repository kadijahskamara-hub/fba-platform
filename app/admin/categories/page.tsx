import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import CategoriesManager, { type CategoryRow } from './CategoriesManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Categories' }

// Final amendments §5: control which catalogue categories appear
// online — publish/hide, archive, reorder, dependency-protected
// deletion — without editing each product.

export default async function AdminCategoriesPage() {
  const session = await getSession()
  const isAdmin = session?.role === 'admin'

  const [{ data: categories }, { data: productRefs }] = await Promise.all([
    supabaseAdmin
      .from('categories')
      .select('id, name, slug, is_visible, archived_at, sort_order, updated_at, created_at')
      .order('sort_order'),
    supabaseAdmin.from('products').select('category_id').not('category_id', 'is', null),
  ])

  const counts = new Map<string, number>()
  for (const r of (productRefs ?? []) as Array<{ category_id: string }>) {
    counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1)
  }

  const rows: CategoryRow[] = (categories ?? []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string,
    is_visible: c.is_visible !== false,
    archived_at: (c.archived_at as string | null) ?? null,
    sort_order: (c.sort_order as number | null) ?? 0,
    updated_at: (c.updated_at as string | null) ?? (c.created_at as string | null),
    product_count: counts.get(c.id as string) ?? 0,
  }))

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Categories</h1>
          <p className="admin-subtitle">
            Control which catalogue categories appear online. Hidden or archived categories leave
            The Edit navigation, filters and listings immediately — products keep their data.
          </p>
        </div>
      </div>
      <CategoriesManager categories={rows} isAdmin={isAdmin} />
    </>
  )
}
