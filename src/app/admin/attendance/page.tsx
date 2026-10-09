import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils/cn'
import { format } from 'date-fns'

async function getAttendance(supabase: any, schoolId: string, searchParams: {
  page?: string; search?: string; status?: string; date_from?: string; date_to?: string;
  teacher_id?: string; class_id?: string; subject_id?: string
}) {
  const page = parseInt(searchParams.page || '1')
  const limit = 20
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('attendance_records')
    .select(`
      *,
      lesson_occurrences!inner(
        occurrence_date,
        lessons!inner(
          subject_id,
          class_id,
          subjects(name),
          classes(name, grade, section)
        )
      ),
      school_memberships!inner(
        profile_id,
        profiles!inner(full_name, phone),
        membership_role
      ),
      class_qr_codes(classes(name))
    `, { count: 'exact' })
    .eq('school_id', schoolId)
    .order('scanned_at', { ascending: false })
    .range(from, to)

  if (searchParams.search) {
    query = query.or(`school_memberships.profiles.full_name.ilike.%${searchParams.search}%,lesson_occurrences.lessons.subjects.name.ilike.%${searchParams.search}%`)
  }

  if (searchParams.status && searchParams.status !== 'all') {
    query = query.eq('status', searchParams.status)
  }

  if (searchParams.date_from) {
    query = query.gte('scanned_at', searchParams.date_from)
  }

  if (searchParams.date_to) {
    query = query.lte('scanned_at', searchParams.date_to + 'T23:59:59')
  }

  if (searchParams.teacher_id) {
    query = query.eq('school_membership_id', searchParams.teacher_id)
  }

  if (searchParams.class_id) {
    query = query.eq('lesson_occurrences.lessons.class_id', searchParams.class_id)
  }

  if (searchParams.subject_id) {
    query = query.eq('lesson_occurrences.lessons.subject_id', searchParams.subject_id)
  }

  const { data, count, error } = await query

  if (error) throw error

  return {
    records: data || [],
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
    currentPage: page,
  }
}

async function getFilterOptions(supabase: any, schoolId: string) {
  const [teachers, classes, subjects] = await Promise.all([
    supabase
      .from('school_memberships')
      .select('id, profiles(full_name)')
      .eq('school_id', schoolId)
      .eq('membership_role', 'TEACHER')
      .eq('status', 'APPROVED'),
    supabase
      .from('classes')
      .select('id, name')
      .eq('school_id', schoolId)
      .eq('status', 'ACTIVE'),
    supabase
      .from('subjects')
      .select('id, name')
      .eq('school_id', schoolId)
      .eq('status', 'ACTIVE'),
  ])

  return {
    teachers: teachers.data || [],
    classes: classes.data || [],
    subjects: subjects.data || [],
  }
}

const statusOptions = [
  { value: 'all', label: 'Barchasi' },
  { value: 'PRESENT', label: 'Keldi' },
  { value: 'LATE', label: 'Kechikdi' },
  { value: 'MISSING', label: 'Kelmadi' },
]

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string; search?: string; status?: string; date_from?: string; date_to?: string; teacher_id?: string; class_id?: string; subject_id?: string }>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id: schoolId } = await params
  const resolvedParams = await searchParams

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

  const [attendanceData, filterOptions] = await Promise.all([
    getAttendance(supabase, schoolId, resolvedParams),
    getFilterOptions(supabase, schoolId),
  ])

  const { records, totalCount, totalPages, currentPage } = attendanceData
  const { teachers, classes, subjects } = filterOptions

  // Stats
  const stats = records.reduce((acc: any, r: any) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href={`/admin/schools/${schoolId}`} className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block">
            ← Maktabga qaytish
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Davomat</h1>
          <p className="text-gray-500 mt-1">Davomat yozuvlarini ko'rish va boshqarish</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/admin/schools/${schoolId}/reports?type=attendance`}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Hisobot yuklab olish
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Keldi</p>
              <p className="text-2xl font-bold text-green-600">{stats.PRESENT || 0}</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Kechikdi</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.LATE || 0}</p>
            </div>
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Kelmadi</p>
              <p className="text-2xl font-bold text-red-600">{stats.MISSING || 0}</p>
            </div>
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Jami</p>
              <p className="text-2xl font-bold text-blue-600">{totalCount}</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <form className="flex flex-col lg:flex-row gap-4" id="filter-form">
            <div className="flex-1">
              <Label htmlFor="search" className="sr-only">Qidirish</Label>
              <Input
                id="search"
                name="search"
                placeholder="Ustoz, fan, sinf bo'yicha qidirish..."
                value={resolvedParams.search || ''}
              />
            </div>

            <select
              name="status"
              value={resolvedParams.status || 'all'}
              className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <div className="flex space-x-2">
              <Input
                name="date_from"
                type="date"
                value={resolvedParams.date_from || ''}
                className="w-full sm:w-40"
                placeholder="Sana dan"
              />
              <Input
                name="date_to"
                type="date"
                value={resolvedParams.date_to || ''}
                className="w-full sm:w-40"
                placeholder="Sana gacha"
              />
            </div>

            <select
              name="teacher_id"
              value={resolvedParams.teacher_id || ''}
              className="w-full sm:w-48 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Barcha ustozlar</option>
              {teachers.map((t: any) => (
                <option key={t.id} value={t.id}>{t.profiles?.full_name}</option>
              ))}
            </select>

            <select
              name="class_id"
              value={resolvedParams.class_id || ''}
              className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Barcha sinflar</option>
              {classes.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <select
              name="subject_id"
              value={resolvedParams.subject_id || ''}
              className="w-full sm:w-48 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Barcha fanlar</option>
              {subjects.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <Button type="submit" className="h-10">
              Filtrlash
            </Button>
            <a
              href={`/admin/schools/${schoolId}/attendance`}
              className="h-10 flex items-center justify-center px-4"
            >
              <Button type="button" variant="outline">Tozalash</Button>
            </a>
          </form>
        </CardContent>
      </Card>

      {/* Attendance Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sana / Vaqt</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ustoz</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sinf</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Holat</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kechikish</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Masofa</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GPS aniqligi</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Harakatlar</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    Davomat yozuvlari topilmadi
                  </td>
                </tr>
              ) : (
                records.map((record: any) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {format(new Date(record.scanned_at), 'dd.MM.yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {record.school_memberships?.profiles?.full_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {record.lesson_occurrences?.lessons?.subjects?.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {record.lesson_occurrences?.lessons?.classes?.name}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                        record.status === 'PRESENT' && 'bg-green-100 text-green-800',
                        record.status === 'LATE' && 'bg-yellow-100 text-yellow-800',
                        record.status === 'MISSING' && 'bg-red-100 text-red-800'
                      )}>
                        {record.status === 'PRESENT' && 'Keldi'}
                        {record.status === 'LATE' && 'Kechikdi'}
                        {record.status === 'MISSING' && 'Kelmadi'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {record.late_minutes ? `${record.late_minutes} min` : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {record.server_calculated_distance_meters
                        ? `${Math.round(record.server_calculated_distance_meters)} m`
                        : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {record.gps_accuracy_meters
                        ? `${record.gps_accuracy_meters} m`
                        : '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => viewDetails(record.id)}>
                        Batafsil
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {totalCount} ta yozuvdan {(currentPage - 1) * 20 + 1} - {Math.min(currentPage * 20, totalCount)} gacha ko'rsatilmoqda
            </div>
            <div className="flex space-x-2">
              {currentPage > 1 && (
                <a
                  href={`?page=${currentPage - 1}&search=${resolvedParams.search || ''}&status=${resolvedParams.status || ''}&date_from=${resolvedParams.date_from || ''}&date_to=${resolvedParams.date_to || ''}&teacher_id=${resolvedParams.teacher_id || ''}&class_id=${resolvedParams.class_id || ''}&subject_id=${resolvedParams.subject_id || ''}`}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Oldingi
                </a>
              )}
              {currentPage < totalPages && (
                <a
                  href={`?page=${currentPage + 1}&search=${resolvedParams.search || ''}&status=${resolvedParams.status || ''}&date_from=${resolvedParams.date_from || ''}&date_to=${resolvedParams.date_to || ''}&teacher_id=${resolvedParams.teacher_id || ''}&class_id=${resolvedParams.class_id || ''}&subject_id=${resolvedParams.subject_id || ''}`}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Keyingi
                </a>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function viewDetails(recordId: string) {
  alert(`Yozuv batafsili: ${recordId}\nBu funksiyada modal ochiladi`)
}