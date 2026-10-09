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

    // Call database function to disable QR code
    const { error } = await supabase.rpc('disable_class_qr_code', {
      p_class_id: class_id,
      p_disabled_by: user.id,
      p_reason: 'Admin tomonidan o\'chirildi',
    })

    if (error) {
      console.error('Disable QR error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'QR kod o\'chirildi' })
  } catch (error) {
    console.error('Disable QR API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}