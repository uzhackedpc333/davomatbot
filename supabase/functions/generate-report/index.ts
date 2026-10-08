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
    const {
      document_id,
      school_id,
      category,
      document_type,
      period_start,
      period_end,
      filters,
      created_by,
    } = body

    if (!document_id || !school_id || !category || !document_type) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update document status to GENERATING
    await supabase
      .from('documents')
      .update({ status: 'GENERATING' })
      .eq('id', document_id)

    // Generate report based on category
    let reportData: any[] = []
    let fileName = ''
    let mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

    switch (category) {
      case 'attendance':
        reportData = await generateAttendanceReport(school_id, period_start, period_end, filters)
        fileName = `attendance_${period_start}_to_${period_end}.xlsx`
        break
      case 'schedule':
        reportData = await generateScheduleReport(school_id, period_start, period_end, filters)
        fileName = `schedule_${period_start}_to_${period_end}.xlsx`
        break
      case 'workload':
        reportData = await generateWorkloadReport(school_id, period_start, period_end, filters)
        fileName = `workload_${period_start}_to_${period_end}.xlsx`
        break
      case 'security':
        reportData = await generateSecurityReport(school_id, period_start, period_end, filters)
        fileName = `security_${period_start}_to_${period_end}.xlsx`
        break
      default:
        throw new Error(`Unknown category: ${category}`)
    }

    // Convert to XLSX (simplified - in production use a proper XLSX library)
    const xlsxBuffer = generateXLSX(reportData, category)

    // Upload to Supabase Storage
    const storagePath = `reports/${school_id}/${fileName}`
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, xlsxBuffer, {
        contentType: mimeType,
        upsert: true,
      })

    if (uploadError) throw uploadError

    // Update document with success
    await supabase
      .from('documents')
      .update({
        status: 'COMPLETED',
        storage_path: storagePath,
        file_size_bytes: xlsxBuffer.byteLength,
        mime_type: mimeType,
        generated_at: new Date().toISOString(),
      })
      .eq('id', document_id)

    return new Response(JSON.stringify({
      success: true,
      document_id,
      storage_path: storagePath,
      file_size: xlsxBuffer.byteLength,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Generate report error:', error)

    // Update document with failure
    if (body.document_id) {
      await supabase
        .from('documents')
        .update({
          status: 'FAILED',
          error_message: error.message,
        })
        .eq('id', body.document_id)
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function generateAttendanceReport(schoolId: string, periodStart: string, periodEnd: string, filters: any) {
  let query = supabase
    .from('attendance_records')
    .select(`
      *,
      lesson_occurrences!inner(
        occurrence_date,
        lessons!inner(
          subject_id, class_id,
          subjects(name),
          classes(name, grade, section)
        )
      ),
      school_memberships!inner(
        profile_id,
        profiles!inner(full_name, phone)
      ),
      class_qr_codes(classes(name))
    `)
    .eq('school_id', schoolId)
    .gte('scanned_at', periodStart)
    .lte('scanned_at', periodEnd + 'T23:59:59')

  if (filters.teacher_id) {
    query = query.eq('school_membership_id', filters.teacher_id)
  }
  if (filters.class_id) {
    query = query.eq('lesson_occurrences.lessons.class_id', filters.class_id)
  }
  if (filters.subject_id) {
    query = query.eq('lesson_occurrences.lessons.subject_id', filters.subject_id)
  }
  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  const { data } = await query
  return data || []
}

async function generateScheduleReport(schoolId: string, periodStart: string, periodEnd: string, filters: any) {
  let query = supabase
    .from('lessons')
    .select(`
      *,
      subjects(name),
      classes(name, grade, section),
      rooms(name),
      lesson_teachers(
        school_membership_id,
        school_memberships(profiles(full_name))
      )
    `)
    .eq('school_id', schoolId)
    .eq('status', 'SCHEDULED')

  if (filters.teacher_id) {
    query = query.eq('lesson_teachers.school_membership_id', filters.teacher_id)
  }
  if (filters.class_id) {
    query = query.eq('class_id', filters.class_id)
  }
  if (filters.subject_id) {
    query = query.eq('subject_id', filters.subject_id)
  }

  const { data } = await query
  return data || []
}

async function generateWorkloadReport(schoolId: string, periodStart: string, periodEnd: string, filters: any) {
  // Get teacher workload based on schedule
  let query = supabase
    .from('school_memberships')
    .select(`
      id,
      profile_id,
      profiles!inner(full_name, phone),
      membership_role,
      teacher_subjects(subject_id, subjects(name)),
      teacher_classes(class_id, classes(name)),
      lesson_teachers(
        lesson_id,
        lessons!inner(weekday, start_time, end_time, subject_id, class_id)
      )
    `)
    .eq('school_id', schoolId)
    .eq('status', 'APPROVED')
    .eq('membership_role', 'TEACHER')

  if (filters.teacher_id) {
    query = query.eq('id', filters.teacher_id)
  }

  const { data } = await query

  // Process workload
  return (data || []).map((teacher: any) => {
    const lessons = teacher.lesson_teachers || []
    let totalHours = 0
    const subjectsMap: Record<string, number> = {}
    const classesMap: Record<string, number> = {}

    lessons.forEach((lt: any) => {
      const lesson = lt.lessons
      const duration = (new Date(`2000-01-01T${lesson.end_time}`).getTime() - new Date(`2000-01-01T${lesson.start_time}`).getTime()) / 3600000
      totalHours += duration

      if (lesson.subject_id) {
        subjectsMap[lesson.subject_id] = (subjectsMap[lesson.subject_id] || 0) + duration
      }
      if (lesson.class_id) {
        classesMap[lesson.class_id] = (classesMap[lesson.class_id] || 0) + duration
      }
    })

    return {
      teacher_id: teacher.id,
      teacher_name: teacher.profiles?.full_name,
      total_hours_per_week: totalHours,
      subjects: Object.entries(subjectsMap).map(([id, hours]) => ({ subject_id: id, hours })),
      classes: Object.entries(classesMap).map(([id, hours]) => ({ class_id: id, hours })),
    }
  })
}

async function generateSecurityReport(schoolId: string, periodStart: string, periodEnd: string, filters: any) {
  let query = supabase
    .from('security_events')
    .select(`
      *,
      school_memberships(profiles(full_name)),
      lesson_occurrences(
        occurrence_date,
        lessons(subjects(name), classes(name))
      ),
      classes(name)
    `)
    .eq('school_id', schoolId)
    .gte('occurred_at', periodStart)
    .lte('occurred_at', periodEnd + 'T23:59:59')

  if (filters.event_type) {
    query = query.eq('event_type', filters.event_type)
  }
  if (filters.severity) {
    query = query.eq('severity', filters.severity)
  }
  if (filters.teacher_id) {
    query = query.eq('school_membership_id', filters.teacher_id)
  }

  const { data } = await query
  return data || []
}

function generateXLSX(data: any[], category: string): ArrayBuffer {
  // Simplified XLSX generation - in production use a proper library like xlsx or exceljs
  // This creates a basic CSV-like buffer that can be opened in Excel
  if (data.length === 0) {
    const emptyContent = 'No data available'
    return new TextEncoder().encode(emptyContent).buffer
  }

  // Get headers from first object
  const headers = Object.keys(data[0])
  const rows = [headers.join('\t')]

  data.forEach(item => {
    const row = headers.map(header => {
      const value = item[header]
      if (value === null || value === undefined) return ''
      if (typeof value === 'object') return JSON.stringify(value)
      return String(value)
    })
    rows.push(row.join('\t'))
  })

  const content = rows.join('\n')
  return new TextEncoder().encode(content).buffer
}