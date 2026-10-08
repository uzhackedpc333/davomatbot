import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = createClient()

  try {
    const body = await request.json()
    const {
      request_id,
      school_id,
      lesson_occurrence_id,
      class_qr_code_id,
      scanned_token,
      latitude,
      longitude,
      gps_accuracy_meters,
      scanned_at,
    } = body

    // Validate required fields
    if (!request_id || !school_id || !lesson_occurrence_id || !class_qr_code_id || !scanned_token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get current user from auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get teacher's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Call the attendance_checkin database function
    const { data, error } = await supabase.rpc('attendance_checkin', {
      p_request_id: request_id,
      p_school_id: school_id,
      p_lesson_occurrence_id: lesson_occurrence_id,
      p_class_qr_code_id: class_qr_code_id,
      p_scanned_token: scanned_token,
      p_latitude: latitude,
      p_longitude: longitude,
      p_gps_accuracy_meters: gps_accuracy_meters,
      p_teacher_profile_id: profile.id,
      p_scanned_at: scanned_at || new Date().toISOString(),
    })

    if (error) {
      console.error('Attendance checkin error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const result = data[0]
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.message,
          status: result.status,
          late_minutes: result.late_minutes,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      attendance_id: result.attendance_id,
      status: result.status,
      message: result.message,
      late_minutes: result.late_minutes,
    })
  } catch (error) {
    console.error('Check-in API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}