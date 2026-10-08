import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // Get all scheduled lesson occurrences for today and past dates that haven't been processed
    const { data: occurrences, error: occError } = await supabase
      .from('lesson_occurrences')
      .select(`
        *,
        lessons!inner(
          id, subject_id, class_id, school_id, start_time, end_time,
          subjects(name),
          classes(name)
        )
      `)
      .eq('status', 'SCHEDULED')
      .lte('occurrence_date', today)

    if (occError) throw occError

    let processedCount = 0
    let missingCount = 0

    for (const occ of occurrences || []) {
      const school = occ.lessons as any
      const lesson = occ.lessons as any

      // Get school settings
      const { data: schoolSettings } = await supabase
        .from('schools')
        .select('timezone, missing_grace_minutes, geofence_radius_meters')
        .eq('id', school.school_id)
        .single()

      if (!schoolSettings) continue

      const lessonStart = new Date(`${occ.occurrence_date}T${lesson.start_time}`)
      const lessonEnd = new Date(`${occ.occurrence_date}T${lesson.end_time}`)
      const graceEnd = new Date(lessonStart.getTime() + (schoolSettings.missing_grace_minutes || 5) * 60000)

      // Only process if grace period has passed
      if (now < graceEnd) continue

      // Get teachers assigned to this occurrence
      const { data: assignments } = await supabase
        .from('lesson_occurrence_teachers')
        .select(`
          school_membership_id,
          school_memberships!inner(
            id, profile_id, status, membership_role
          )
        `)
        .eq('lesson_occurrence_id', occ.id)
        .eq('school_memberships.status', 'APPROVED')
        .eq('school_memberships.membership_role', 'TEACHER')

      for (const assignment of assignments || []) {
        const membership = assignment.school_memberships as any

        // Check if attendance already exists
        const { data: existingAttendance } = await supabase
          .from('attendance_records')
          .select('id, status')
          .eq('lesson_occurrence_id', occ.id)
          .eq('school_membership_id', membership.id)
          .single()

        if (existingAttendance) continue

        // Get QR code for this class
        const { data: qrCode } = await supabase
          .from('class_qr_codes')
          .select('id')
          .eq('class_id', lesson.class_id)
          .eq('school_id', school.school_id)
          .eq('status', 'ACTIVE')
          .single()

        const isLessonEnded = now >= lessonEnd
        const status = isLessonEnded ? 'MISSING' : 'MISSING' // temporary, will be updated if teacher checks in later

        // Insert attendance record
        const { data: attendance } = await supabase
          .from('attendance_records')
          .insert({
            school_id: school.school_id,
            lesson_occurrence_id: occ.id,
            school_membership_id: membership.id,
            class_qr_code_id: qrCode?.id,
            scanned_at: now.toISOString(),
            status,
            late_minutes: null,
            validation_metadata: {
              auto_generated: true,
              reason: isLessonEnded ? 'lesson_ended_no_checkin' : 'grace_period_expired',
            },
            request_id: crypto.randomUUID(),
          })
          .select()
          .single()

        if (attendance) {
          missingCount++

          // Notify teacher
          await supabase
            .from('notifications')
            .insert({
              recipient_profile_id: membership.profile_id,
              school_id: school.school_id,
              type: 'IN_APP',
              title: 'Davomat belgilanmadi',
              body: 'Siz darsga kelmadingiz. Agar dars hali davom etmoqda bo\'lsa, QR kodni skanerlang.',
              related_entity_type: 'attendance',
              related_entity_id: attendance.id,
            })

          // Notify admin/zavuch
          const { data: admins } = await supabase
            .from('school_memberships')
            .select('profile_id')
            .eq('school_id', school.school_id)
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
                school_id: school.school_id,
                type: 'IN_APP',
                title: 'Ustoz darsga kelmadi',
                body: `${teacherProfile?.full_name} darsga kelmadi`,
                related_entity_type: 'attendance',
                related_entity_id: attendance.id,
              })
          }

          // Log security event
          await supabase
            .from('security_events')
            .insert({
              event_type: 'MISSING',
              severity: 'MEDIUM',
              school_id: school.school_id,
              lesson_occurrence_id: occ.id,
              school_membership_id: membership.id,
              reason: 'Ustoz darsga kelmadi (avtomatik)',
              metadata: { grace_period_minutes: schoolSettings.missing_grace_minutes },
            })
        }

        processedCount++
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed_occurrences: processedCount,
      missing_records_created: missingCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Process missing attendance error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})