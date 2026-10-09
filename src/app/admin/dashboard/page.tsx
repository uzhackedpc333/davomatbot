import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

async function getDashboardStats(supabase: any, schoolId?: string) {
  const schoolFilter = schoolId ? { school_id: schoolId } : {}

  const [
    { count: totalSchools },
    { count: totalTeachers },
    { count: pendingApprovals },
    { count: todayLessons },
    { count: presentCount },
    { count: lateCount },
    { count: missingCount },
    { data: recentSecurityEvents },
  ] = await Promise.all([
    supabase.from('schools').select('*', { count: 'exact', head: true }),
    supabase.from('school_memberships').select('*', { count: 'exact', head: true }).eq('status', 'APPROVED').eq('membership_role', 'TEACHER'),
    supabase.from('school_memberships').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from('lesson_occurrences').select('*', { count: 'exact', head: true }).eq('occurrence_date', new Date().toISOString().split('T')[0]).eq('status', 'SCHEDULED'),
    supabase.from('attendance_records').select('*', { count: 'exact', head: true }).eq('scanned_at', new Date().toISOString().split('T')[0]).eq('status', 'PRESENT'),
    supabase.from('attendance_records').select('*', { count: 'exact', head: true }).eq('scanned_at', new Date().toISOString().split('T')[0]).eq('status', 'LATE'),
    supabase.from('attendance_records').select('*', { count: 'exact', head: true }).eq('scanned_at', new Date().toISOString().split('T')[0]).eq('status', 'MISSING'),
    supabase.from('security_events').select('*').order('occurred_at', { ascending: false }).limit(5),
  ])

  return {
    totalSchools: totalSchools || 0,
    totalTeachers: totalTeachers || 0,
    pendingApprovals: pendingApprovals || 0,
    todayLessons: todayLessons || 0,
    presentCount: presentCount || 0,
    lateCount: lateCount || 0,
    missingCount: missingCount || 0,
    recentSecurityEvents: recentSecurityEvents || [],
  }
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ school_id?: string }>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('system_role')
    .eq('id', user.id)
    .single()

  const isSuperAdmin = profile?.system_role === 'SUPER_ADMIN'
  const resolvedParams = await searchParams
  const schoolId = resolvedParams.school_id

  const stats = await getDashboardStats(supabase, schoolId)

  const totalAttendance = stats.presentCount + stats.lateCount + stats.missingCount
  const attendanceRate = totalAttendance > 0
    ? Math.round((stats.presentCount / totalAttendance) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Boshqaruv paneli</h1>
          <p className="text-gray-500 mt-1">
            {isSuperAdmin ? 'Platforma umumiy statistikasi' : 'Maktab statistikasi'}
          </p>
        </div>
        <div className="flex space-x-3">
          <Button asChild>
            <Link href="/admin/reports">Hisobot yuklab olish</Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Jami maktablar</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalSchools}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Faol ustozlar</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalTeachers}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Kutilayotgan so'rovlar</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.pendingApprovals}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Bugungi darslar</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats.todayLessons}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </Card>
      </div>

      {/* Attendance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Keldi</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{stats.presentCount}</p>
              <p className="text-sm text-gray-500 mt-1">{attendanceRate}% davomat</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="p-6 border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Kechikdi</p>
              <p className="text-3xl font-bold text-yellow-600 mt-1">{stats.lateCount}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="p-6 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Kelmadi</p>
              <p className="text-3xl font-bold text-red-600 mt-1">{stats.missingCount}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions & Recent Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <Card>
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Tezkor harakatlar</h2>
          </div>
          <div className="p-4 space-y-3">
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/admin/teacher-approvals">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Ustoz so'rovlarini ko'rish ({stats.pendingApprovals})
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/admin/schedule">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Dars jadvalini boshqarish
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/admin/qr-codes">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2m2 4a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                QR kodlarni yaratish
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/admin/reports">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Hisobot yaratish
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/admin/live-monitoring">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Jonli kuzatuv
              </Link>
            </Button>
          </div>
        </Card>

        {/* Recent Security Events */}
        <Card>
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">So'nggi xavfsizlik hodisalari</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/security">Barchasi</Link>
            </Button>
          </div>
          <div className="divide-y divide-gray-200">
            {stats.recentSecurityEvents.length === 0 ? (
              <div className="p-4 text-center text-gray-500">Xavfsizlik hodisalari yo'q</div>
            ) : (
              stats.recentSecurityEvents.map((event: any) => (
                <div key={event.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {event.event_type}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(event.occurred_at).toLocaleString('uz-UZ')}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">
                      {event.severity}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}