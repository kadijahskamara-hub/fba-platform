import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase'
import { createSession } from '@/lib/auth'
import type { SessionUser } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { firstName, lastName, email, password, consentMarketing = false } = body

    // Basic validation
    if (!firstName || !lastName || !email || !password) {
      return NextResponse.json({ success: false, error: 'All fields are required.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ success: false, error: 'Password must be at least 8 characters.' }, { status: 400 })
    }

    // Check if email already exists
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (existing) {
      return NextResponse.json({ success: false, error: 'An account with this email already exists.' }, { status: 409 })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    // Create user
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .insert({
        first_name:   firstName.trim(),
        last_name:    lastName.trim(),
        email:        email.toLowerCase().trim(),
        password_hash: passwordHash,
        role:         'retail_customer',
        status:       'active',
      })
      .select()
      .single()

    if (error || !user) {
      console.error('User creation error:', error)
      return NextResponse.json({ success: false, error: 'Failed to create account.' }, { status: 500 })
    }

    // Store contact record
    await supabaseAdmin.from('contacts').insert({
      first_name:        firstName.trim(),
      last_name:         lastName.trim(),
      email:             email.toLowerCase().trim(),
      contact_type:      'retail',
      source:            'registration',
      consent_marketing: consentMarketing,
    })

    // Create session cookie
    const sessionUser: SessionUser = {
      id:        user.id,
      email:     user.email,
      role:      user.role,
      firstName: user.first_name,
      lastName:  user.last_name,
    }
    await createSession(sessionUser)

    return NextResponse.json({
      success: true,
      data: { role: user.role, firstName: user.first_name },
    })
  } catch (err) {
    console.error('Register error:', err)
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 })
  }
}
