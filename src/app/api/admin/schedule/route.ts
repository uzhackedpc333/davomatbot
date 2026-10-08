import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      school_id,
      subject_id,
      class_id,
      room_id,
      weekday,
      start_time,
      end_time,
      academic_year,
      teacher_membership_ids,
    } = body

    if (!school_id || !subject_id || !class_id || weekday === undefined || !start_time || !end_time || !academic_year) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check access
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

    // Check for teacher overlap
    if (teacher_membership_ids && teacher_membership_ids.length > 0) {
      for (const tmId of teacher_membership_ids) {
        const { data: overlap } = await supabase
          .from('lessons')
          .select('id')
          .eq('school_id', school_id)
          .eq('academic_year', academic_year)
          .eq('weekday', weekday)
          .eq('status', 'SCHEDULED')
          .lt('start_time', end_time)
          .gt('end_time', start_time)
          .in('id', supabase.from('lesson_teachers').select('lesson_id').eq('school_membership_id', tmId))

        if (overlap && overlap.length > 0) {
          return NextResponse.json({ error: 'Ustozda bu vaqtda boshqa dars bor' }, { status: 400 })
        }
      }
    }

    // Check for room overlap
    if (room_id) {
      const { data: roomOverlap } = await supabase
        .from('lessons')
        .select('id')
        .eq('school_id', school_id)
        .eq('academic_year', academic_year)
        .eq('weekday', weekday)
        .eq('room_id', room_id)
        .eq('status', 'SCHEDULED')
        .lt('start_time', end_time)
        .gt('end_time', start_time)

      if (roomOverlap && roomOverlap.length > 0) {
        return NextResponse.json({ error: 'Xonada bu vaqtda boshqa dars bor' }, { status: 400 })
      }
    }

    // Create lesson
    const { data: lesson, error } = await supabase
      .from('lessons')
      .insert({
        school_id,
        subject_id,
        class_id,
        room_id,
        weekday,
        start_time,
        end_time,
        academic_year,
        status: 'SCHEDULED',
      })
      .select()
      .single()

    if (error) throw error

    // Assign teachers
    if (teacher_membership_ids && teacher_membership_ids.length > 0) {
      const teacherLinks = teacher_membership_ids.map((tmId: string) => ({
        lesson_id: lesson.id,
        school_membership_id: tmId,
      }))
      await supabase.from('lesson_teachers').insert(teacherLinks)
    }

    // Generate occurrences for this academic year
    const yearStart = new Date(`${academic_year}-09-01`)
    const yearEnd = new Date(`${parseInt(academic_year) + 1}-06-30`)
    await supabase.rpc('generate_lesson_occurrences', {
      p_school_id: school_id,
      p_start_date: yearStart.toISOString().split('T')[0],
      p_end_date: yearEnd.toISOString().split('T')[0],
      p_academic_year: academic_year,
    })
    await supabase.rpc('generate_lesson_occurrence_teachers')

    // Audit log
    await supabase.from('audit_logs').insert({
      actor_profile_id: user.id,
      school_id,
      action: 'CREATE_LESSON',
      entity_type: 'lesson',
      entity_id: lesson.id,
      new_values: body,
    })

    return NextResponse.json({ success: true, lesson })
  } catch (error: any) {
    console.error('Create lesson error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}