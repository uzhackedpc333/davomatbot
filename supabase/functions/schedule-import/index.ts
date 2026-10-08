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
    const body = await req.json()
    const { school_id, academic_year, rows, imported_by } = body

    if (!school_id || !academic_year || !rows || !imported_by) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if user is admin for this school
    const { data: membership } = await supabase
      .from('school_memberships')
      .select('membership_role, status')
      .eq('school_id', school_id)
      .eq('profile_id', imported_by)
      .single()

    const { data: profile } = await supabase
      .from('profiles')
      .select('system_role')
      .eq('id', imported_by)
      .single()

    const isSuperAdmin = profile?.system_role === 'SUPER_ADMIN'
    const isSchoolAdmin = membership?.membership_role === 'ADMIN' && membership?.status === 'APPROVED'

    if (!isSuperAdmin && !isSchoolAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let createdCount = 0
    let updatedCount = 0
    const errors: any[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const subjectName = row['Fan nomi'] || row['subject_name'] || ''
        const subjectCode = row['Fan kodi'] || row['subject_code'] || ''
        const className = row['Sinf nomi'] || row['class_name'] || ''
        const grade = parseInt(row['Sinfi'] || row['grade'] || '0')
        const section = row['Harfi'] || row['section'] || ''
        const roomName = row['Xona'] || row['room_name'] || ''
        const weekdayText = row['Hafta kuni'] || row['weekday'] || ''
        const startTime = row['Boshlanish vaqti'] || row['start_time'] || ''
        const endTime = row['Tugash vaqti'] || row['end_time'] || ''
        const teacherPhone = row['Ustoz telefoni'] || row['teacher_phone'] || ''
        const teacherFullName = row['Ustoz FIO'] || row['teacher_full_name'] || ''

        if (!subjectName || !className || !weekdayText || !startTime || !endTime) {
          errors.push({ row: i + 1, error: 'Majburiy maydonlar to\'ldirilmagan', data: row })
          continue
        }

        const weekday = weekdayTextToNumber(weekdayText)
        if (weekday === null) {
          errors.push({ row: i + 1, error: 'Noto\'g\'ri hafta kuni', data: row })
          continue
        }

        // Get or create subject
        let { data: subject } = await supabase
          .from('subjects')
          .select('*')
          .eq('school_id', school_id)
          .eq('code', subjectCode)
          .single()

        if (!subject) {
          const { data: newSubject } = await supabase
            .from('subjects')
            .insert({ school_id, name: subjectName, code: subjectCode, status: 'ACTIVE' })
            .select()
            .single()
          subject = newSubject
        }

        // Get or create class
        let { data: cls } = await supabase
          .from('classes')
          .select('*')
          .eq('school_id', school_id)
          .eq('name', className)
          .eq('academic_year', academic_year)
          .single()

        if (!cls) {
          const { data: newClass } = await supabase
            .from('classes')
            .insert({ school_id, name: className, grade, section, academic_year, status: 'ACTIVE' })
            .select()
            .single()
          cls = newClass
        }

        // Get or create room
        let room = null
        if (roomName) {
          let { data: r } = await supabase
            .from('rooms')
            .select('*')
            .eq('school_id', school_id)
            .eq('name', roomName)
            .single()

          if (!r) {
            const { data: newRoom } = await supabase
              .from('rooms')
              .insert({ school_id, name: roomName, status: 'ACTIVE' })
              .select()
              .single()
            r = newRoom
          }
          room = r
        }

        // Check teacher overlap
        let teacherMembership = null
        if (teacherPhone || teacherFullName) {
          let query = supabase
            .from('school_memberships')
            .select('*, profiles!inner(full_name, phone)')
            .eq('school_id', school_id)
            .eq('status', 'APPROVED')
            .eq('membership_role', 'TEACHER')

          if (teacherPhone) {
            query = query.eq('profiles.phone', teacherPhone)
          } else if (teacherFullName) {
            query = query.eq('profiles.full_name', teacherFullName)
          }

          const { data: tm } = await query.single()
          teacherMembership = tm
        }

        if (teacherMembership) {
          const { data: overlap } = await supabase
            .from('lessons')
            .select('id')
            .eq('school_id', school_id)
            .eq('academic_year', academic_year)
            .eq('weekday', weekday)
            .eq('status', 'SCHEDULED')
            .lt('start_time', endTime)
            .gt('end_time', startTime)
            .in('id', supabase.from('lesson_teachers').select('lesson_id').eq('school_membership_id', teacherMembership.id))

          if (overlap && overlap.length > 0) {
            errors.push({ row: i + 1, error: 'Ustozda bu vaqtda boshqa dars bor', data: row })
            continue
          }
        }

        // Check room overlap
        if (room) {
          const { data: roomOverlap } = await supabase
            .from('lessons')
            .select('id')
            .eq('school_id', school_id)
            .eq('academic_year', academic_year)
            .eq('weekday', weekday)
            .eq('room_id', room.id)
            .eq('status', 'SCHEDULED')
            .lt('start_time', endTime)
            .gt('end_time', startTime)

          if (roomOverlap && roomOverlap.length > 0) {
            errors.push({ row: i + 1, error: 'Xonada bu vaqtda boshqa dars bor', data: row })
            continue
          }
        }

        // Create or update lesson
        const { data: lesson, error: lessonError } = await supabase
          .from('lessons')
          .upsert({
            school_id,
            subject_id: subject.id,
            class_id: cls.id,
            room_id: room?.id,
            weekday,
            start_time: startTime,
            end_time: endTime,
            academic_year,
            status: 'SCHEDULED',
          }, { onConflict: 'school_id,subject_id,class_id,weekday,start_time,academic_year' })
          .select()
          .single()

        if (lessonError) throw lessonError

        const isNew = !lesson.created_at || lesson.created_at === lesson.updated_at
        if (isNew) createdCount++
        else updatedCount++

        // Assign teacher
        if (teacherMembership) {
          await supabase
            .from('lesson_teachers')
            .upsert({ lesson_id: lesson.id, school_membership_id: teacherMembership.id }, { onConflict: 'lesson_id,school_membership_id' })
        }

      } catch (err) {
        errors.push({ row: i + 1, error: err.message, data: row })
      }
    }

    // Generate occurrences
    const yearStart = new Date(`${academic_year}-09-01`)
    const yearEnd = new Date(`${parseInt(academic_year) + 1}-06-30`)
    await supabase.rpc('generate_lesson_occurrences', {
      p_school_id: school_id,
      p_start_date: yearStart.toISOString().split('T')[0],
      p_end_date: yearEnd.toISOString().split('T')[0],
      p_academic_year: academic_year,
    })
    await supabase.rpc('generate_lesson_occurrence_teachers')

    // Audit
    await supabase.from('audit_logs').insert({
      actor_profile_id: imported_by,
      school_id,
      action: 'IMPORT_SCHEDULE',
      entity_type: 'lesson',
      new_values: { created: createdCount, updated: updatedCount, errors: errors.length },
    })

    return new Response(JSON.stringify({
      success: errors.length === 0,
      message: errors.length === 0 ? 'Muvaffaqiyatli' : 'Ba\'zi qatorlarda xatoliklar bor',
      created_count: createdCount,
      updated_count: updatedCount,
      errors,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Schedule import error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

function weekdayTextToNumber(text: string): number | null {
  const day = text.toLowerCase().trim()
  const days: Record<string, number> = {
    'yakshanba': 0, 'dushanba': 1, 'seshanba': 2, 'chorshanba': 3,
    'payshanba': 4, 'juma': 5, 'shanba': 6,
  }
  return days[day] ?? null
}