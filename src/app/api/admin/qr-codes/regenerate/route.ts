import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { class_id, school_id } = body

    if (!class_id || !school_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check if user is admin for this school
    const { data: membership } = await supabase
      .from('school_memberships')
      .select('membership_role, status')
      .eq('school_id', school_id)
      .eq('profile_id', user.id)
      .single()

    const { data: profile } = await supabase
      .from('profiles')
      .select('system_role')
      .eq('id', user.id)
      .single()

    const isSuperAdmin = profile?.system_role === 'SUPER_ADMIN'
    const isSchoolAdmin = membership?.membership_role === 'ADMIN' && membership?.status === 'APPROVED'
    const isZavuch = membership?.membership_role === 'ZAVUCH' && membership?.status === 'APPROVED'

    if (!isSuperAdmin && !isSchoolAdmin && !isZavuch) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Call database function to regenerate QR code
    const { data, error } = await supabase.rpc('generate_class_qr_code', {
      p_class_id: class_id,
      p_created_by: user.id,
    })

    if (error) {
      console.error('Regenerate QR error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const result = data[0]

    return NextResponse.json({
      success: true,
      qr_code_id: result.qr_code_id,
      token: result.token,
    })
  } catch (error) {
    console.error('Regenerate QR API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}