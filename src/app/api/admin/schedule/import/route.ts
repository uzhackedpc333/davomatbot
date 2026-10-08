import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const schoolId = formData.get('school_id') as string
    const academicYear = formData.get('academic_year') as string

    if (!file || !schoolId || !academicYear) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check if user is admin for this school
    const { data: membership } = await supabase
      .from('school_memberships')
      .select('membership_role, status')
      .eq('school_id', schoolId)
      .eq('profile_id', user.id)
      .single()

    const { data: profile } = await supabase
      .from('profiles')
      .select('system_role')
      .eq('id', user.id)
      .single()

    const isSuperAdmin = profile?.system_role === 'SUPER_ADMIN'
    const isSchoolAdmin = membership?.membership_role === 'ADMIN' && membership?.status === 'APPROVED'

    if (!isSuperAdmin && !isSchoolAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Read and parse XLSX file
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })

    // Convert rows to JSON array for database function
    const rowsJson = rows.map((row: any) => ({
      subject_name: row['Fan nomi'] || row['subject_name'] || '',
      subject_code: row['Fan kodi'] || row['subject_code'] || '',
      class_name: row['Sinf nomi'] || row['class_name'] || '',
      grade: row['Sinfi'] || row['grade'] || '',
      section: row['Harfi'] || row['section'] || '',
      room_name: row['Xona'] || row['room_name'] || '',
      weekday: row['Hafta kuni'] || row['weekday'] || '',
      start_time: row['Boshlanish vaqti'] || row['start_time'] || '',
      end_time: row['Tugash vaqti'] || row['end_time'] || '',
      teacher_phone: row['Ustoz telefoni'] || row['teacher_phone'] || '',
      teacher_full_name: row['Ustoz FIO'] || row['teacher_full_name'] || '',
    }))

    // Call database function for import
    const { data, error } = await supabase.rpc('import_schedule_from_rows', {
      p_school_id: schoolId,
      p_academic_year: academicYear,
      p_rows: rowsJson,
      p_imported_by: user.id,
    })

    if (error) {
      console.error('Schedule import error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const result = data[0]

    return NextResponse.json({
      success: result.success,
      message: result.message,
      created_count: result.created_count,
      updated_count: result.updated_count,
      errors: result.errors,
    })
  } catch (error) {
    console.error('Schedule import API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}