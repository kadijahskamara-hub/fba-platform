import 'server-only'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Public client — uses anon key, respects RLS
// Use in Server Components for reading public data
// no-store opts out of Next.js 14 fetch cache so pages always show fresh data
export const supabase = createClient(supabaseUrl, supabaseAnon, {
  global: {
    fetch: (url: RequestInfo | URL, options: RequestInit = {}) =>
      fetch(url, { ...options, cache: 'no-store' }),
  },
})

// Admin client — uses service_role key, bypasses RLS
// Use ONLY in Server Actions and API Route Handlers (server-side only)
// global.fetch override opts out of Next.js 14 fetch cache so admin data is always fresh
export const supabaseAdmin = createClient(supabaseUrl, supabaseService, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: {
    fetch: (url: RequestInfo | URL, options: RequestInit = {}) =>
      fetch(url, { ...options, cache: 'no-store' }),
  },
})
