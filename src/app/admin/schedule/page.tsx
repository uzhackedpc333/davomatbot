import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils/cn'
import * as XLSX from 'xlsx'

const WEEKDAYS = [
  { key: 0, name: 'Yakshanba', short: 'Ya' },
  { key: 1, name: 'Dushanba', short: 'Du' },
  { key: 2, name: 'Seshanba', short: 'Se' },
  { key: 3, name: 'Chorshanba', short: 'Cho' },
  { key: 4, name: 'Payshanba', short: 'Pa' },
  { key: 5, name: 'Juma', short: 'Ju' },
  { key: 6, name: 'Shanba', short: 'Sha' },
]

async function getSchedule(supabase: any, schoolId: string, academicYear: string) {
  const { data, error } = await supabase
    .from('lessons')
    .select(`
      *,
      subjects (name),
      classes (name, grade, section),
      rooms (name),
      lesson_teachers (
        school_membership_id,
        school_memberships (profiles (full_name))
      )
    `)
    .eq('school_id', schoolId)
    .eq('academic_year', academicYear)
    .eq('status', 'SCHEDULED')
    .eq('is_exception', false)
    .order('weekday', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) throw error

  return data || []
}

async function getAcademicYears(supabase: any, schoolId: string) {
  const { data } = await supabase
    .from('lessons')
    .select('academic_year')
    .eq('school_id', schoolId)
  const years = [...new Set(data?.map((d: any) => d.academic_year) || [])]
  return years.sort().reverse()
}

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ academic_year?: string; view?: string }>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id: schoolId } = await params
  const resolvedParams = await searchParams
  const academicYear = resolvedParams.academic_year || new Date().getFullYear().toString()
  const view = resolvedParams.view || 'week'

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

  const [lessons, academicYears] = await Promise.all([
    getSchedule(supabase, schoolId, academicYear),
    getAcademicYears(supabase, schoolId),
  ])

  // Group lessons by weekday and time
  const scheduleGrid: Record<number, Record<string, any[]>> = {}
  lessons.forEach((lesson: any) => {
    if (!scheduleGrid[lesson.weekday]) {
      scheduleGrid[lesson.weekday] = {}
    }
    const timeKey = `${lesson.start_time}-${lesson.end_time}`
    if (!scheduleGrid[lesson.weekday][timeKey]) {
      scheduleGrid[lesson.weekday][timeKey] = []
    }
    scheduleGrid[lesson.weekday][timeKey].push(lesson)
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href={`/admin/schools/${schoolId}`} className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block">
            ← Maktabga qaytish
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Dars jadvali</h1>
          <p className="text-gray-500 mt-1">Haftalik dars jadvalini boshqarish</p>
        </div>
        <div className="flex space-x-3">
          <Button asChild variant="outline">
            <Link href={`/admin/schools/${schoolId}/schedule/import`}>Excel dan import</Link>
          </Button>
          <Button asChild>
            <Link href={`/admin/schools/${schoolId}/schedule/new`}>Yangi dars qo'shish</Link>
          </Button>
        </div>
      </div>

      {/* Academic Year Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="academic-year" className="text-sm font-medium text-gray-700">Ta'lim yili:</Label>
              <select
                id="academic-year"
                value={academicYear}
                onChange={(e) => {
                  const params = new URLSearchParams(window.location.search)
                  params.set('academic_year', e.target.value)
                  window.location.search = params.toString()
                }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(academicYears as string[]).map((year: string) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="flex space-x-2">
              <Button
                variant={view === 'week' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams(window.location.search)
                  params.set('view', 'week')
                  window.location.search = params.toString()
                }}
              >
                Haftalik ko'rinish
              </Button>
              <Button
                variant={view === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams(window.location.search)
                  params.set('view', 'list')
                  window.location.search = params.toString()
                }}
              >
                Ro'yxat ko'rinishi
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Week View */}
      {view === 'week' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                    Vaqt / Kun
                  </th>
                  {WEEKDAYS.map((day) => (
                    <th key={day.key} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {day.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {/* Time slots from 08:00 to 18:00 */}
                {Array.from({ length: 11 }, (_, i) => i + 8).map((hour) => {
                  const startTime = `${hour.toString().padStart(2, '0')}:00`
                  const endTime = `${(hour + 1).toString().padStart(2, '0')}:00`
                  const timeKey = `${startTime}-${endTime}`

                  return (
                    <tr key={timeKey}>
                      <td className="px-4 py-2 text-sm text-gray-500 text-right pr-4">
                        {startTime} - {endTime}
                      </td>
                      {WEEKDAYS.map((day) => {
                        const lessons = scheduleGrid[day.key]?.[timeKey] || []
                        return (
                          <td key={day.key} className="px-2 py-2 align-top min-h-[80px]">
                            {lessons.map((lesson: any) => (
                              <div
                                key={lesson.id}
                                className="mb-1 p-2 bg-blue-50 border border-blue-200 rounded text-xs hover:bg-blue-100 transition-colors cursor-pointer"
                                onClick={() => window.location.href = `/admin/schools/${schoolId}/schedule/${lesson.id}`}
                              >
                                <div className="font-medium text-blue-900">{lesson.subjects?.name}</div>
                                <div className="text-blue-700">{lesson.classes?.name}</div>
                                <div className="text-blue-600">
                                  {lesson.lesson_teachers?.[0]?.school_memberships?.profiles?.full_name || 'Ustoz belgilanmagan'}
                                </div>
                                {lesson.rooms?.name && (
                                  <div className="text-blue-600">📍 {lesson.rooms.name}</div>
                                )}
                              </div>
                            ))}
                            {lessons.length === 0 && (
                              <div className="h-[80px]" />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* List View */}
      {view === 'list' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kun</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vaqt</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sinf</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Xona</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ustoz(lar)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Harakatlar</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {lessons.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      Bu yil uchun dars jadvali topilmadi
                    </td>
                  </tr>
                ) : (
                  lessons.map((lesson: any) => (
                    <tr key={lesson.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {WEEKDAYS.find(d => d.key === lesson.weekday)?.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {lesson.start_time} - {lesson.end_time}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {lesson.subjects?.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {lesson.classes?.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {lesson.rooms?.name || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {lesson.lesson_teachers?.map((lt: any) =>
                          lt.school_memberships?.profiles?.full_name
                        ).join(', ') || 'Ustoz belgilanmagan'}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                        <Link
                          href={`/admin/schools/${schoolId}/schedule/${lesson.id}`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Ko'rish
                        </Link>
                        {(isSchoolAdmin || isZavuch) && (
                          <Link
                            href={`/admin/schools/${schoolId}/schedule/${lesson.id}/edit`}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            Tahrirlash
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}