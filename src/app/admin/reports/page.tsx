import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils/cn'
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns'

const REPORT_TYPES = [
  { value: 'attendance', label: 'Davomat hisoboti', icon: 'clipboard-check' },
  { value: 'attendance_detailed', label: 'Batafsil davomat', icon: 'list' },
  { value: 'late_report', label: 'Kechikish hisoboti', icon: 'clock' },
  { value: 'missing_report', label: 'Kelmaganlar hisoboti', icon: 'user-x' },
  { value: 'workload', label: 'Ish yuklamasi', icon: 'briefcase' },
  { value: 'schedule', label: 'Dars jadvali', icon: 'calendar' },
  { value: 'security', label: 'Xavfsizlik hodisalari', icon: 'shield' },
  { value: 'teacher_performance', label: 'Ustoz samaradorligi', icon: 'trending-up' },
]

const PERIODS = [
  { value: 'today', label: 'Bugun', days: 0 },
  { value: 'yesterday', label: 'Kecha', days: 1 },
  { value: 'this_week', label: 'Bu hafta', days: 7 },
  { value: 'last_week', label: 'O\'tgan hafta', days: 14 },
  { value: 'this_month', label: 'Bu oy', days: 30 },
  { value: 'last_month', label: 'O\'tgan oy', days: 60 },
  { value: 'custom', label: 'Maxsus davr', days: null },
]

const FORMATS = [
  { value: 'xlsx', label: 'Excel (XLSX)' },
  { value: 'pdf', label: 'PDF' },
  { value: 'csv', label: 'CSV' },
]

async function getTeachers(supabase: any, schoolId: string) {
  const { data } = await supabase
    .from('school_memberships')
    .select('id, profiles(full_name)')
    .eq('school_id', schoolId)
    .eq('membership_role', 'TEACHER')
    .eq('status', 'APPROVED')
  return data || []
}

async function getClasses(supabase: any, schoolId: string) {
  const { data } = await supabase
    .from('classes')
    .select('id, name')
    .eq('school_id', schoolId)
    .eq('status', 'ACTIVE')
  return data || []
}

async function getSubjects(supabase: any, schoolId: string) {
  const { data } = await supabase
    .from('subjects')
    .select('id, name')
    .eq('school_id', schoolId)
    .eq('status', 'ACTIVE')
  return data || []
}

export default async function ReportsPage({
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

  const [teachers, classes, subjects] = await Promise.all([
    getTeachers(supabase, schoolId),
    getClasses(supabase, schoolId),
    getSubjects(supabase, schoolId),
  ])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href={`/admin/schools/${schoolId}`} className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block">
            ← Maktabga qaytish
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Hisobotlar</h1>
          <p className="text-gray-500 mt-1">Turli xil hisobotlarni yaratish va yuklab olish</p>
        </div>
      </div>

      {/* Report Generator Form */}
      <Card>
        <CardHeader>
          <CardTitle>Yangi hisobot yaratish</CardTitle>
        </CardHeader>
        <CardContent>
          <form id="report-form" className="space-y-6" onSubmit={handleGenerateReport}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-2">
                <Label>Hisobot turi *</Label>
                <select
                  name="report_type"
                  id="report_type"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onChange={handleReportTypeChange}
                >
                  <option value="">Tanlang...</option>
                  {REPORT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Davr *</Label>
                <select
                  name="period"
                  id="period"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onChange={handlePeriodChange}
                >
                  <option value="">Tanlang...</option>
                  {PERIODS.map((period) => (
                    <option key={period.value} value={period.value}>{period.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2" id="date-from-container" style={{ display: 'none' }}>
                <Label>Boshlanish sanasi *</Label>
                <Input
                  name="date_from"
                  type="date"
                  id="date_from"
                  className="w-full"
                />
              </div>

              <div className="space-y-2" id="date-to-container" style={{ display: 'none' }}>
                <Label>Tugash sanasi *</Label>
                <Input
                  name="date_to"
                  type="date"
                  id="date_to"
                  className="w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="filters-container" style={{ display: 'none' }}>
              <div className="space-y-2">
                <Label>Ustoz (ixtiyoriy)</Label>
                <select
                  name="teacher_id"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Barcha ustozlar</option>
                  {teachers.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.profiles?.full_name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Sinf (ixtiyoriy)</Label>
                <select
                  name="class_id"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Barcha sinflar</option>
                  {classes.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Fan (ixtiyoriy)</Label>
                <select
                  name="subject_id"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Barcha fanlar</option>
                  {subjects.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="format-container" style={{ display: 'none' }}>
              <div className="space-y-2">
                <Label>Format *</Label>
                <select
                  name="format"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Hisobot nomi *</Label>
                <Input
                  name="title"
                  placeholder="Masalan: 9-sinf oylik davomat hisoboti"
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <Button type="submit" disabled={false}>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Hisobot yaratish
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Recent Reports */}
      <Card>
        <CardHeader>
          <CardTitle>So'nggi yaratilgan hisobotlar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">Hali hisobotlar yo'q</h3>
            <p className="mt-2">Yuqoridan parametrlarni to'ldirib "Hisobot yaratish" tugmasini bosing</p>
          </div>
        </CardContent>
      </Card>

      {/* Report Templates */}
      <Card>
        <CardHeader>
          <CardTitle>Tayyor shablonlar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {REPORT_TYPES.map((type) => (
              <Button
                key={type.value}
                variant="outline"
                className="h-24 flex flex-col items-start justify-center p-4 text-left"
                onClick={() => selectReportType(type.value)}
              >
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {type.icon === 'clipboard-check' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />}
                    {type.icon === 'list' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />}
                    {type.icon === 'clock' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />}
                    {type.icon === 'user-x' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />}
                    {type.icon === 'briefcase' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />}
                    {type.icon === 'calendar' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />}
                    {type.icon === 'shield' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />}
                    {type.icon === 'trending-up' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />}
                  </svg>
                </div>
                <span className="font-medium text-gray-900">{type.label}</span>
                <span className="text-xs text-gray-500">Tezda yaratish uchun bosing</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function handleReportTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
  const filtersContainer = document.getElementById('filters-container')
  const formatContainer = document.getElementById('format-container')
  if (e.target.value) {
    filtersContainer!.style.display = 'grid'
    formatContainer!.style.display = 'grid'
  } else {
    filtersContainer!.style.display = 'none'
    formatContainer!.style.display = 'none'
  }
}

function handlePeriodChange(e: React.ChangeEvent<HTMLSelectElement>) {
  const dateFromContainer = document.getElementById('date-from-container')
  const dateToContainer = document.getElementById('date-to-container')
  if (e.target.value === 'custom') {
    dateFromContainer!.style.display = 'block'
    dateToContainer!.style.display = 'block'
  } else {
    dateFromContainer!.style.display = 'none'
    dateToContainer!.style.display = 'none'
  }
}

function handleGenerateReport(e: React.FormEvent) {
  e.preventDefault()
  alert('Hisobot yaratish API chaqiriladi. Bu funksiya Supabase Edge Function orqali amalga oshiriladi.')
}

function selectReportType(type: string) {
  const select = document.getElementById('report_type') as HTMLSelectElement
  if (select) {
    select.value = type
    handleReportTypeChange({ target: select } as any)
  }
  // Set default period
  const periodSelect = document.getElementById('period') as HTMLSelectElement
  if (periodSelect && !periodSelect.value) {
    periodSelect.value = 'this_month'
    handlePeriodChange({ target: periodSelect } as any)
  }
}