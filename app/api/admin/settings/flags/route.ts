import { NextRequest, NextResponse } from 'next/server'
import { getFlags, updateFlags } from '@/lib/flags'
import { getSession } from '@/lib/auth'
import type { LaunchFlags } from '@/lib/flags'

// ── GET — return current flags ───────────────────────────────
export async function GET() {
  const flags = await getFlags()
  return NextResponse.json(flags)
}

// ── PUT — update one or more flags ──────────────────────────
export async function PUT(req: NextRequest) {
  // Auth — read session cookie directly (middleware does not run for /api/* routes)
  const session = await getSession()
  if (!session || (session.role !== 'admin' && session.role !== 'staff')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Partial<LaunchFlags>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate: only accept known flag keys with boolean values
  const VALID_KEYS: (keyof LaunchFlags)[] = [
    'show_collection', 'show_home', 'show_artisans', 'show_journal', 'show_trade_cta',
  ]
  const partial: Partial<LaunchFlags> = {}
  for (const key of VALID_KEYS) {
    if (key in body) {
      const val = body[key]
      if (typeof val !== 'boolean') {
        return NextResponse.json({ error: `Flag "${key}" must be a boolean` }, { status: 400 })
      }
      partial[key] = val
    }
  }

  if (Object.keys(partial).length === 0) {
    return NextResponse.json({ error: 'No valid flags provided' }, { status: 400 })
  }

  const updated = await updateFlags(partial)
  return NextResponse.json(updated)
}
