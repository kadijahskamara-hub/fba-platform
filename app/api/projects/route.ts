import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// GET /api/projects — list user's projects
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('user_id', session.id)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}

// POST /api/projects — create a new project
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const { name, location, budget, currency, notes } = body

  if (!name?.trim()) {
    return NextResponse.json({ success: false, error: 'Project name is required.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('projects')
    .insert({
      user_id:  session.id,
      name:     name.trim(),
      location: location?.trim() || null,
      budget:   budget ?? null,
      currency: currency ?? 'GBP',
      notes:    notes?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
