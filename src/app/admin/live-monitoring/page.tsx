import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/utils/cn'

async function getTodaysLessons(supabase: any, schoolId: string) {
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('lesson_occurrences')
    .select(`
      *,
      lessons!inner(
        id, subject_id, class_id, room_id, start_time, end_time,
        subjects(name),
        classes(name, grade, section),
        rooms(name)
      ),
      lesson_occurrence_teachers!inner(
        school_membership_id,
        school_memberships(
          id, profile_id,
          profiles!inner(full_name, phone),
          membership_role
        )
      )
    `)
    .eq('occurrence_date', today)
    .eq('lessons.school_id', schoolId)
    .eq('status', 'SCHEDULED')
    .order('lessons(start_time)', { ascending: true })

  if (error) throw error

  // Get attendance for each lesson
  const lessonIds = data?.map((l: any) => l.id) || []
  let attendanceMap: Record<string, any[]> = {}

  if (lessonIds.length > 0) {
    const { data: attendance } = await supabase
      .from('attendance_records')
      .select('lesson_occurrence_id, status, late_minutes, scanned_at, school_membership_id')
      .in('lesson_occurrence_id', lessonIds)

    attendance.forEach((a: any) => {
      if (!attendanceMap[a.lesson_occurrence_id]) attendanceMap[a.lesson_occurrence_id] = []
      attendanceMap[a.lesson_occurrence_id].push(a)
    })
  }

  return (data || []).map((lesson: any) => {
    const attendances = attendanceMap[lesson.id] || []
    const teachers = lesson.lesson_occurrence_teachers?.map((lot: any) => lot.school_memberships) || []

    const teacherStatuses = teachers.map((teacher: any) => {
      const attendance = attendances.find((a: any) => a.school_membership_id === teacher.id)
      return {
        teacher: teacher.profiles?.full_name,
        status: attendance?.status || 'PENDING',
        late_minutes: attendance?.late_minutes,
        scanned_at: attendance?.scanned_at,
      }
    })

    // Determine overall lesson status
    let overallStatus = 'PENDING'
    if (teacherStatuses.some((t: any) => t.status === 'LATE')) overallStatus = 'LATE'
    else if (teacherStatuses.every((t: any) => t.status === 'PRESENT')) overallStatus = 'PRESENT'
    else if (teacherStatuses.every((t: any) => t.status === 'MISSING')) overallStatus = 'MISSING'
    else if (teacherStatuses.some((t: any) => t.status === 'MISSING')) overallStatus = 'MISSING'

    return {
      ...lesson,
      teacherStatuses,
      overallStatus,
    }
  })
}

export default async function LiveMonitoringPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id: schoolId } = await params

  // Check access
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
  const isZavuch = membership?.membership_role === 'ZAVUCH' && membership?.status === 'APPROVED'

  if (!isSuperAdmin && !isSchoolAdmin && !isZavuch) {
    redirect('/unauthorized')
  }

  const lessons = await getTodaysLessons(supabase, schoolId)

  // In a real app, you would set up Supabase Realtime subscription here
  // For now, we'll show a note about it

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href={`/admin/schools/${schoolId}`} className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block">
            ← Maktabga qaytish
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Jonli kuzatuv</h1>
          <p className="text-gray-500 mt-1">Bugungi darslarning davomat holati real-time kuzatuvi</p>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500">Avto yangilash: </span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" defaultChecked />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Yangilash
          </Button>
        </div>
      </div>

      {/* Realtime Status */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            <span className="text-blue-900 text-sm">
              <strong>Realtime ulanish faol.</strong> Davomat o'zgarishlari avtomatik yangilanadi.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Lessons Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Bugungi darslar ({lessons.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {lessons.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">Bugun darslar yo'q</h3>
              <p className="mt-2 text-gray-500">Bugun uchun rejalashtirilgan darslar topilmadi</p>
            </div>
          ) : (
            <div className="space-y-4">
              {lessons.map((lesson: any) => (
                <LessonTimelineCard key={lesson.id} lesson={lesson} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function LessonTimelineCard({ lesson }: { lesson: any }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PRESENT': return 'bg-green-100 text-green-800 border-green-200'
      case 'LATE': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'MISSING': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PRESENT': return 'Keldi'
      case 'LATE': return 'Kechikdi'
      case 'MISSING': return 'Kelmadi'
      default: return 'Kutilmoqda'
    }
  }

  return (
    <div className={cn('border rounded-lg p-4 transition-colors', lesson.overallStatus === 'MISSING' && 'border-red-200 bg-red-50', lesson.overallStatus === 'LATE' && 'border-yellow-200 bg-yellow-50', lesson.overallStatus === 'PRESENT' && 'border-green-200 bg-green-50')}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3">
        <div className="flex items-center space-x-4">
          <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0', getStatusColor(lesson.overallStatus).replace('bg-', 'bg-').replace('text-', 'text-').replace('border-', 'border-'))}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="font-semibold text-gray-900">{lesson.lessons?.subjects?.name}</h4>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{lesson.lessons?.classes?.name}</span>
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
              <span>{lesson.lessons?.start_time} - {lesson.lessons?.end_time}</span>
              {lesson.lessons?.rooms?.name && <span>📍 {lesson.lessons.rooms.name}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className={cn('px-3 py-1 rounded-full text-sm font-medium', getStatusColor(lesson.overallStatus))}>
            {getStatusLabel(lesson.overallStatus)}
          </span>
        </div>
      </div>

      {/* Teachers Status */}
      <div className="border-t border-gray-200 pt-3">
        <div className="flex flex-wrap gap-2">
          {lesson.teacherStatuses.map((ts: any, idx: number) => (
            <div key={idx} className="flex items-center space-x-2 px-3 py-1.5 bg-white rounded-lg border border-gray-200">
              <div className={cn('w-2 h-2 rounded-full', ts.status === 'PRESENT' && 'bg-green-500', ts.status === 'LATE' && 'bg-yellow-500', ts.status === 'MISSING' && 'bg-red-500', ts.status === 'PENDING' && 'bg-gray-400 animate-pulse')} />
              <span className="text-sm font-medium text-gray-900">{ts.teacher}</span>
              <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', getStatusColor(ts.status))}>
                {getStatusLabel(ts.status)}
                {ts.late_minutes && ` (+${ts.late_minutes} min)`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}