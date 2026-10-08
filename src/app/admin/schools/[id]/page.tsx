import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/utils/cn'

async function getSchoolDetails(supabase: any, schoolId: string) {
  const { data: school, error } = await supabase
    .from('schools')
    .select('*')
    .eq('id', schoolId)
    .single()

  if (error || !school) {
    return null
  }

  // Get counts for tabs
  const [
    { count: teachersCount },
    { count: classesCount },
    { count: subjectsCount },
    { count: roomsCount },
    { count: pendingApprovals },
  ] = await Promise.all([
    supabase.from('school_memberships').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'APPROVED').eq('membership_role', 'TEACHER'),
    supabase.from('classes').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'ACTIVE'),
    supabase.from('subjects').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'ACTIVE'),
    supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'ACTIVE'),
    supabase.from('school_memberships').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'PENDING'),
  ])

  return {
    school,
    stats: {
      teachersCount: teachersCount || 0,
      classesCount: classesCount || 0,
      subjectsCount: subjectsCount || 0,
      roomsCount: roomsCount || 0,
      pendingApprovals: pendingApprovals || 0,
    }
  }
}

export default async function SchoolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('system_role')
    .eq('id', user.id)
    .single()

  const isSuperAdmin = profile?.system_role === 'SUPER_ADMIN'

  const { id } = await params
  const schoolData = await getSchoolDetails(supabase, id)

  if (!schoolData) {
    redirect('/admin/schools')
  }

  const { school, stats } = schoolData

  // Check if user has access to this school
  if (!isSuperAdmin) {
    const { data: membership } = await supabase
      .from('school_memberships')
      .select('membership_role, status')
      .eq('school_id', id)
      .eq('profile_id', user.id)
      .single()

    if (!membership || membership.status !== 'APPROVED' || !['ADMIN', 'ZAVUCH'].includes(membership.membership_role)) {
      redirect('/unauthorized')
    }
  }

  const tabs = [
    { id: 'overview', label: 'Umumiy', icon: 'home' },
    { id: 'teachers', label: `Ustozlar (${stats.teachersCount})`, icon: 'users' },
    { id: 'classes', label: `Sinflar (${stats.classesCount})`, icon: 'graduation-cap' },
    { id: 'subjects', label: `Fanlar (${stats.subjectsCount})`, icon: 'book' },
    { id: 'rooms', label: `Xonalar (${stats.roomsCount})`, icon: 'door-open' },
    { id: 'schedule', label: 'Dars jadvali', icon: 'calendar' },
    { id: 'qr-codes', label: 'QR kodlar', icon: 'qr-code' },
    { id: 'attendance', label: 'Davomat', icon: 'clipboard-check' },
    { id: 'documents', label: 'Hujjatlar', icon: 'file-text' },
    { id: 'reports', label: 'Hisobotlar', icon: 'bar-chart' },
    { id: 'security', label: 'Xavfsizlik', icon: 'shield' },
    { id: 'settings', label: 'Sozlamalar', icon: 'settings' },
  ]

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href="/admin/schools" className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block">
            ← Maktablar ro'yxati
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{school.name}</h1>
          <p className="text-gray-500 mt-1">{school.short_name} • {school.address || 'Manzil kiritilmagan'}</p>
        </div>
        <div className="flex space-x-3">
          <Button asChild variant="outline">
            <Link href={`/admin/schools/${id}/edit`}>Tahrirlash</Link>
          </Button>
          <Button asChild>
            <Link href={`/admin/schools/${id}/teachers/new`}>Ustoz qo'shish</Link>
          </Button>
        </div>
      </div>

      {/* School Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Ustozlar</p>
                <p className="text-2xl font-bold text-gray-900">{stats.teachersCount}</p>
              </div>
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Sinflar</p>
                <p className="text-2xl font-bold text-gray-900">{stats.classesCount}</p>
              </div>
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Fanlar</p>
                <p className="text-2xl font-bold text-gray-900">{stats.subjectsCount}</p>
              </div>
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Kutilayotgan so'rovlar</p>
                <p className="text-2xl font-bold text-gray-900">{stats.pendingApprovals}</p>
              </div>
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4 sm:grid-cols-6 lg:grid-cols-12">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="text-xs sm:text-sm">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Maktab ma'lumotlari</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="space-y-3">
                  <div className="grid grid-cols-3 gap-4">
                    <dt className="text-sm font-medium text-gray-500">Nomi</dt>
                    <dd className="col-span-2 text-sm text-gray-900">{school.name}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <dt className="text-sm font-medium text-gray-500">Qisqa nomi</dt>
                    <dd className="col-span-2 text-sm text-gray-900">{school.short_name || '-'}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <dt className="text-sm font-medium text-gray-500">Manzil</dt>
                    <dd className="col-span-2 text-sm text-gray-900">{school.address || '-'}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <dt className="text-sm font-medium text-gray-500">Telefon</dt>
                    <dd className="col-span-2 text-sm text-gray-900">{school.phone || '-'}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <dt className="text-sm font-medium text-gray-500">Email</dt>
                    <dd className="col-span-2 text-sm text-gray-900">{school.email || '-'}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <dt className="text-sm font-medium text-gray-500">Koordinatalar</dt>
                    <dd className="col-span-2 text-sm text-gray-900">{school.latitude}, {school.longitude}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <dt className="text-sm font-medium text-gray-500">Vaqt mintaqasi</dt>
                    <dd className="col-span-2 text-sm text-gray-900">{school.timezone}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <dt className="text-sm font-medium text-gray-500">Geofence radius</dt>
                    <dd className="col-span-2 text-sm text-gray-900">{school.geofence_radius_meters} metr</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <dt className="text-sm font-medium text-gray-500">Maks. GPS aniqligi</dt>
                    <dd className="col-span-2 text-sm text-gray-900">{school.max_gps_accuracy_meters} metr</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <dt className="text-sm font-medium text-gray-500">Darsdan oldin ochilishi</dt>
                    <dd className="col-span-2 text-sm text-gray-900">{school.checkin_opening_minutes_before} daqiqa</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <dt className="text-sm font-medium text-gray-500">Kechikish chadri</dt>
                    <dd className="col-span-2 text-sm text-gray-900">{school.missing_grace_minutes} daqiqa</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <dt className="text-sm font-medium text-gray-500">Holat</dt>
                    <dd className="col-span-2">
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                        school.status === 'ACTIVE' && 'bg-green-100 text-green-800',
                        school.status === 'INACTIVE' && 'bg-gray-100 text-gray-800',
                        school.status === 'SUSPENDED' && 'bg-red-100 text-red-800'
                      )}>
                        {school.status === 'ACTIVE' && 'Faol'}
                        {school.status === 'INACTIVE' && 'Nofaol'}
                        {school.status === 'SUSPENDED' && 'To\'xtatilgan'}
                      </span>
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tezkor harakatlar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href={`/admin/schools/${id}/teachers`}>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Ustozlarni boshqarish
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href={`/admin/schools/${id}/classes`}>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                    </svg>
                    Sinflarni boshqarish
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href={`/admin/schools/${id}/schedule`}>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Dars jadvalini sozlash
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href={`/admin/schools/${id}/qr-codes`}>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2m2 4a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                    </svg>
                    QR kodlarni yaratish
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href={`/admin/schools/${id}/reports`}>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Hisobot yaratish
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href={`/admin/schools/${id}/security`}>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Xavfsizlik hodisalari
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Placeholder tabs for other sections */}
        {tabs.slice(1).map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{tab.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-500 text-center py-8">
                  {tab.label} bo'limi tez orada qo'shiladi
                </p>
                <div className="flex justify-center space-x-3">
                  <Button asChild variant="outline">
                    <Link href={`/admin/${tab.id}?school_id=${id}`}>Ochish</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}