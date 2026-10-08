import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils/cn'
import { format } from 'date-fns'

const SECURITY_EVENT_TYPES = [
  'OUTSIDE_SCHOOL', 'WRONG_CLASS', 'NO_LESSON', 'TOO_EARLY', 'LESSON_ENDED',
  'LOW_ACCURACY', 'LOCATION_PERMISSION_DENIED', 'INVALID_QR', 'DISABLED_QR',
  'UNAUTHORIZED_TEACHER', 'DUPLICATE_SCAN', 'RATE_LIMITED', 'SUSPICIOUS_LOCATION'
]

const SEVERITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

const eventLabels: Record<string, string> = {
  OUTSIDE_SCHOOL: 'Maktab tashqarisi',
  WRONG_CLASS: 'Noto\'g\'ri sinf',
  NO_LESSON: 'Dars yo\'q',
  TOO_EARLY: 'Juda erta',
  LESSON_ENDED: 'Dars tugagan',
  LOW_ACCURACY: 'Past aniqlik',
  LOCATION_PERMISSION_DENIED: 'Lokatsiya ruxsati yo\'q',
  INVALID_QR: 'Noto\'g\'ri QR',
  DISABLED_QR: 'O\'chirilgan QR',
  UNAUTHORIZED_TEACHER: 'Ruxsatsiz ustoz',
  DUPLICATE_SCAN: 'Takroriy skaner',
  RATE_LIMITED: 'Cheklangan so\'rov',
  SUSPICIOUS_LOCATION: 'Shubhali lokatsiya',
}

const severityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
}

async function getSecurityEvents(supabase: any, schoolId: string, searchParams: {
  page?: string; event_type?: string; severity?: string; date_from?: string; date_to?: string;
}) {
  const page = parseInt(searchParams.page || '1')
  const limit = 20
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('security_events')
    .select(`
      *,
      school_memberships(
        profiles(full_name, phone)
      ),
      lesson_occurrences(
        occurrence_date,
        lessons(subjects(name), classes(name))
      ),
      classes(name)
    `, { count: 'exact' })
    .eq('school_id', schoolId)
    .order('occurred_at', { ascending: false })
    .range(from, to)

  if (searchParams.event_type && searchParams.event_type !== 'all') {
    query = query.eq('event_type', searchParams.event_type)
  }

  if (searchParams.severity && searchParams.severity !== 'all') {
    query = query.eq('severity', searchParams.severity)
  }

  if (searchParams.date_from) {
    query = query.gte('occurred_at', searchParams.date_from)
  }

  if (searchParams.date_to) {
    query = query.lte('occurred_at', searchParams.date_to + 'T23:59:59')
  }

  const { data, count, error } = await query

  if (error) throw error

  return {
    events: data || [],
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
    currentPage: page,
  }
}

export default async function SecurityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string; event_type?: string; severity?: string; date_from?: string; date_to?: string }>
}) {
  const supabase = createClient()

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

  const { events, totalCount, totalPages, currentPage } = await getSecurityEvents(supabase, schoolId, resolvedParams)

  // Stats by severity
  const severityStats = events.reduce((acc: any, e: any) => {
    acc[e.severity] = (acc[e.severity] || 0) + 1
    return acc
  }, {})

  // Stats by event type
  const eventTypeStats = events.reduce((acc: any, e: any) => {
    acc[e.event_type] = (acc[e.event_type] || 0) + 1
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
          <h1 className="text-2xl font-bold text-gray-900">Xavfsizlik hodisalari</h1>
          <p className="text-gray-500 mt-1">Xavfsizlik buzilishlarini kuzatuv va tahlil qilish</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/admin/schools/${schoolId}/reports?type=security`}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Hisobot
          </Link>
        </Button>
      </div>

      {/* Severity Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Kritik</p>
              <p className="text-2xl font-bold text-red-600">{severityStats.CRITICAL || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Yuqori</p>
              <p className="text-2xl font-bold text-orange-600">{severityStats.HIGH || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">O'rta</p>
              <p className="text-2xl font-bold text-yellow-600">{severityStats.MEDIUM || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-gray-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Past</p>
              <p className="text-2xl font-bold text-gray-600">{severityStats.LOW || 0}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <form className="flex flex-col lg:flex-row gap-4" id="filter-form">
            <select
              name="event_type"
              value={resolvedParams.event_type || 'all'}
              className="w-full sm:w-56 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Barcha hodisa turlari</option>
              {SECURITY_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>{eventLabels[type]}</option>
              ))}
            </select>

            <select
              name="severity"
              value={resolvedParams.severity || 'all'}
              className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="barchasi">Barcha darajalar</option>
              {SEVERITY_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
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

            <Button type="submit">Filtrlash</Button>
            <a
              href={`/admin/schools/${schoolId}/security`}
              className="h-10 flex items-center justify-center px-4"
            >
              <Button type="button" variant="outline">Tozalash</Button>
            </a>
          </form>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sana / Vaqt</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hodisa turi</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Daraja</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ustoz</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dars / Sinf</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sabab</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Batafsil</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    Xavfsizlik hodisalari topilmadi
                  </td>
                </tr>
              ) : (
                events.map((event: any) => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {format(new Date(event.occurred_at), 'dd.MM.yyyy HH:mm:ss')}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-medium">
                        {eventLabels[event.event_type] || event.event_type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn('px-2 py-1 rounded text-xs font-medium', severityColors[event.severity])}>
                        {event.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {event.school_memberships?.profiles?.full_name || 'Noma\'lum'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {event.lesson_occurrences?.lessons?.subjects?.name ? (
                        <>
                          {event.lesson_occurrences.lessons.subjects.name} /
                          {event.lesson_occurrences.lessons.classes?.name || event.classes?.name}
                        </>
                      ) : (
                        event.classes?.name || '-'
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {event.reason}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <Button variant="ghost" size="sm" onClick={() => viewEventDetails(event)}>
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
              {totalCount} ta hodisadan {(currentPage - 1) * 20 + 1} - {Math.min(currentPage * 20, totalCount)} gacha ko'rsatilmoqda
            </div>
            <div className="flex space-x-2">
              {currentPage > 1 && (
                <a
                  href={`?page=${currentPage - 1}&event_type=${resolvedParams.event_type || ''}&severity=${resolvedParams.severity || ''}&date_from=${resolvedParams.date_from || ''}&date_to=${resolvedParams.date_to || ''}`}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Oldingi
                </a>
              )}
              {currentPage < totalPages && (
                <a
                  href={`?page=${currentPage + 1}&event_type=${resolvedParams.event_type || ''}&severity=${resolvedParams.severity || ''}&date_from=${resolvedParams.date_from || ''}&date_to=${resolvedParams.date_to || ''}`}
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

function viewEventDetails(event: any) {
  const metadata = event.metadata ? JSON.stringify(event.metadata, null, 2) : 'Ma\'lumot yo\'q'
  alert(`Hodisa batafsili:\n\nID: ${event.id}\nTuri: ${eventLabels[event.event_type] || event.event_type}\nDaraja: ${event.severity}\nSana: ${format(new Date(event.occurred_at), 'dd.MM.yyyy HH:mm:ss')}\nSabab: ${event.reason}\n\nMetadata:\n${metadata}`)
}