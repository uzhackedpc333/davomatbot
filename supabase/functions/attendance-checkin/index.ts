import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import crypto from 'https://deno.land/std@0.168.0/crypto/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
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
      teacher_profile_id,
    } = body

    if (!request_id || !school_id || !lesson_occurrence_id || !class_qr_code_id || !scanned_token || !teacher_profile_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get school info
    const { data: school } = await supabase
      .from('schools')
      .select('*')
      .eq('id', school_id)
      .single()

    if (!school) {
      return new Response(JSON.stringify({ success: false, message: 'Maktab topilmadi' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get QR code and validate
    const { data: qrCode } = await supabase
      .from('class_qr_codes')
      .select('*')
      .eq('id', class_qr_code_id)
      .eq('school_id', school_id)
      .single()

    if (!qrCode) {
      return new Response(JSON.stringify({ success: false, message: 'QR kod topilmadi' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (qrCode.status !== 'ACTIVE') {
      await logSecurityEvent('DISABLED_QR', 'MEDIUM', school_id, 'O\'chirilgan QR kod bilan skanerlash urinishi', request_id, { qr_code_id: class_qr_code_id })
      return new Response(JSON.stringify({ success: false, message: 'Bu QR kod faol emas' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify QR token
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', encoder.encode(scanned_token + qrCode.token_salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const hashBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(''))
    const tokenHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

    if (tokenHash !== qrCode.token_hash) {
      await logSecurityEvent('INVALID_QR', 'HIGH', school_id, 'Noto\'g\'ri QR token', request_id, { qr_code_id: class_qr_code_id })
      return new Response(JSON.stringify({ success: false, message: 'Noto\'g\'ri QR kod' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get lesson occurrence with lesson details
    const { data: lessonOccurrence } = await supabase
      .from('lesson_occurrences')
      .select('*, lessons(*)')
      .eq('id', lesson_occurrence_id)
      .single()

    if (!lessonOccurrence) {
      await logSecurityEvent('NO_LESSON', 'MEDIUM', school_id, 'Dars topilmadi', request_id, { lesson_occurrence_id })
      return new Response(JSON.stringify({ success: false, message: 'Ushbu vaqtda dars yo\'q' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (lessonOccurrence.status === 'CANCELLED') {
      return new Response(JSON.stringify({ success: false, message: 'Dars bekor qilingan' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const lesson = lessonOccurrence.lessons

    // Verify QR class matches lesson class
    if (qrCode.class_id !== lesson.class_id) {
      await logSecurityEvent('WRONG_CLASS', 'HIGH', school_id, 'Noto\'g\'ri sinf QR kodi skanerlandi', request_id, {
        expected_class_id: lesson.class_id,
        scanned_class_id: qrCode.class_id,
      }, lesson_occurrence_id, qrCode.class_id)
      return new Response(JSON.stringify({ success: false, message: 'Bu QR kod ushbu dars sinfi uchun emas' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get teacher's membership
    const { data: membership } = await supabase
      .from('school_memberships')
      .select('*')
      .eq('school_id', school_id)
      .eq('profile_id', teacher_profile_id)
      .eq('status', 'APPROVED')
      .eq('membership_role', 'TEACHER')
      .single()

    if (!membership) {
      await logSecurityEvent('UNAUTHORIZED_TEACHER', 'HIGH', school_id, 'Tasdiqlanmagan ustoz urinishi', request_id, { teacher_profile_id })
      return new Response(JSON.stringify({ success: false, message: 'Siz bu maktabda tasdiqlangan ustoz emassiz' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check teacher assignment
    const { data: assignment } = await supabase
      .from('lesson_occurrence_teachers')
      .select('*')
      .eq('lesson_occurrence_id', lesson_occurrence_id)
      .eq('school_membership_id', membership.id)
      .single()

    if (!assignment) {
      await logSecurityEvent('UNAUTHORIZED_TEACHER', 'HIGH', school_id, 'Bu darsga biriktirilmagan ustoz urinishi', request_id, { lesson_occurrence_id }, lesson_occurrence_id, membership.id)
      return new Response(JSON.stringify({ success: false, message: 'Siz bu darsga biriktirilmagansiz' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Time validation
    const scannedAt = scanned_at ? new Date(scanned_at) : new Date()
    const lessonStart = new Date(`${lessonOccurrence.occurrence_date}T${lesson.start_time}`)
    const lessonEnd = new Date(`${lessonOccurrence.occurrence_date}T${lesson.end_time}`)
    const windowStart = new Date(lessonStart.getTime() - school.checkin_opening_minutes_before * 60000)

    if (scannedAt < windowStart) {
      await logSecurityEvent('TOO_EARLY', 'LOW', school_id, 'Dars boshlanishidan juda erta skanerlash', request_id, {
        scanned_at: scannedAt.toISOString(),
        window_start: windowStart.toISOString(),
      }, lesson_occurrence_id, membership.id)
      return new Response(JSON.stringify({ success: false, message: 'Dars hali boshlanmagan' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (scannedAt > lessonEnd) {
      await logSecurityEvent('LESSON_ENDED', 'MEDIUM', school_id, 'Dars tugagandan keyin skanerlash', request_id, {
        scanned_at: scannedAt.toISOString(),
        lesson_end: lessonEnd.toISOString(),
      }, lesson_occurrence_id, membership.id)
      return new Response(JSON.stringify({ success: false, message: 'Dars allaqachon tugagan' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Calculate status
    let status: 'PRESENT' | 'LATE' = 'PRESENT'
    let lateMinutes = 0
    if (scannedAt > lessonStart) {
      status = 'LATE'
      lateMinutes = Math.floor((scannedAt.getTime() - lessonStart.getTime()) / 60000)
    }

    // GPS validation
    const distance = calculateDistance(school.latitude, school.longitude, latitude, longitude)

    if (gps_accuracy_meters > school.max_gps_accuracy_meters) {
      await logSecurityEvent('LOW_ACCURACY', 'MEDIUM', school_id, 'GPS aniqligi yetarli emas', request_id, {
        accuracy: gps_accuracy_meters,
        max_allowed: school.max_gps_accuracy_meters,
      }, lesson_occurrence_id, membership.id)
      return new Response(JSON.stringify({ success: false, message: 'GPS aniqligi yetarli emas' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (distance > school.geofence_radius_meters) {
      await logSecurityEvent('OUTSIDE_SCHOOL', 'HIGH', school_id, 'Maktab hududidan tashqaridan skanerlash', request_id, {
        distance_meters: distance,
        geofence_radius: school.geofence_radius_meters,
      }, lesson_occurrence_id, membership.id)
      return new Response(JSON.stringify({ success: false, message: 'Siz maktab hududida emassiz' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check duplicate
    const { data: existing } = await supabase
      .from('attendance_records')
      .select('id')
      .eq('request_id', request_id)
      .single()

    if (existing) {
      return new Response(JSON.stringify({ success: false, message: 'Takroriy so\'rov' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Insert attendance record
    const { data: attendance, error } = await supabase
      .from('attendance_records')
      .insert({
        school_id,
        lesson_occurrence_id,
        school_membership_id: membership.id,
        class_qr_code_id,
        scanned_at: scannedAt.toISOString(),
        status,
        late_minutes,
        gps_accuracy_meters,
        server_calculated_distance_meters: distance,
        location_snapshot: { lat: latitude, lon: longitude, accuracy: gps_accuracy_meters, timestamp: scannedAt.toISOString() },
        validation_metadata: { gps_valid: true, qr_valid: true, time_valid: true, membership_valid: true, assignment_valid: true },
        request_id,
      })
      .select()
      .single()

    if (error) throw error

    // Notify teacher
    await supabase
      .from('notifications')
      .insert({
        recipient_profile_id: membership.profile_id,
        school_id,
        type: 'IN_APP',
        title: status === 'PRESENT' ? 'Davomat qabul qilindi' : 'Kechikib keldingiz',
        body: status === 'PRESENT' ? 'Siz darsga o\'z vaqtida keldingiz' : `Siz ${lateMinutes} daqiqa kechikib keldingiz`,
        related_entity_type: 'attendance',
        related_entity_id: attendance.id,
      })

    // Notify admin if late
    if (status === 'LATE') {
      const { data: admins } = await supabase
        .from('school_memberships')
        .select('profile_id')
        .eq('school_id', school_id)
        .in('membership_role', ['ADMIN', 'ZAVUCH'])
        .eq('status', 'APPROVED')

      const { data: teacherProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', membership.profile_id)
        .single()

      for (const admin of admins || []) {
        await supabase
          .from('notifications')
          .insert({
            recipient_profile_id: admin.profile_id,
            school_id,
            type: 'IN_APP',
            title: 'Ustoz kechikdi',
            body: `${teacherProfile?.full_name} ${lateMinutes} daqiqa kechikdi`,
            related_entity_type: 'attendance',
            related_entity_id: attendance.id,
          })
      }
    }

    return new Response(JSON.stringify({
      success: true,
      attendance_id: attendance.id,
      status,
      message: 'Muvaffaqiyatli',
      late_minutes: lateMinutes,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Check-in error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function logSecurityEvent(
  eventType: string,
  severity: string,
  schoolId: string,
  reason: string,
  requestId: string,
  metadata: any,
  lessonOccurrenceId?: string,
  schoolMembershipId?: string,
  classId?: string
) {
  await supabase
    .from('security_events')
    .insert({
      event_type: eventType,
      severity,
      school_id: schoolId,
      lesson_occurrence_id: lessonOccurrenceId,
      school_membership_id: schoolMembershipId,
      class_id: classId,
      reason,
      request_id: requestId,
      metadata,
    })
}