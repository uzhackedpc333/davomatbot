import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils/cn'

async function getTeachers(supabase: any, schoolId: string, searchParams: { page?: string; search?: string; status?: string; subject?: string }) {
  const page = parseInt(searchParams.page || '1')
  const limit = 15
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('school_memberships')
    .select(`
      *,
      profiles!inner(id, full_name, phone, email, avatar_url),
      teacher_profiles(employment_date, is_active),
      school_id
    `, { count: 'exact' })
    .eq('school_id', schoolId)
    .eq('membership_role', 'TEACHER')
    .order('created_at', { ascending: false })
    .range(from, to)

  if (searchParams.search) {
    query = query.or(`profiles.full_name.ilike.%${searchParams.search}%,profiles.phone.ilike.%${searchParams.search}%,profiles.email.ilike.%${searchParams.search}%`)
  }

  if (searchParams.status && searchParams.status !== 'all') {
    query = query.eq('status', searchParams.status)
  }

  const { data, count, error } = await query

  if (error) throw error

  return {
    teachers: data || [],
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
    currentPage: page,
  }
}

async function getSubjects(supabase: any, schoolId: string) {
  const { data } = await supabase
    .from('subjects')
    .select('id, name')
    .eq('school_id', schoolId)
    .eq('status', 'ACTIVE')
    .order('name')
  return data || []
}

async function getClasses(supabase: any, schoolId: string) {
  const { data } = await supabase
    .from('classes')
    .select('id, name')
    .eq('school_id', schoolId)
    .eq('status', 'ACTIVE')
    .order('name')
  return data || []
}

export default async function TeachersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string; search?: string; status?: string }>
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

  const { teachers, totalCount, totalPages, currentPage } = await getTeachers(supabase, schoolId, resolvedParams)
  const subjects = await getSubjects(supabase, schoolId)
  const classes = await getClasses(supabase, schoolId)

  const statusOptions = [
    { value: 'all', label: 'Barchasi' },
    { value: 'APPROVED', label: 'Tasdiqlangan' },
    { value: 'PENDING', label: 'Kutilmoqda' },
    { value: 'REJECTED', label: 'Rad etilgan' },
    { value: 'SUSPENDED', label: 'Faol emas' },
  ]

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href={`/admin/schools/${schoolId}`} className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block">
            ← Maktabga qaytish
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Ustozlar CRM</h1>
          <p className="text-gray-500 mt-1">Ustozlarni boshqarish, a'zoliklar va ish yuklamasi</p>
        </div>
        <Button asChild>
          <Link href={`/admin/schools/${schoolId}/teachers/new`}>Yangi ustoz qo'shish</Link>
        </Button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <form className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="search" className="sr-only">Qidirish</Label>
              <Input
                id="search"
                name="search"
                placeholder="Ism, telefon, email bo'yicha qidirish..."
                value={resolvedParams.search || ''}
                className="max-w-md"
              />
            </div>
            <select
              name="status"
              value={resolvedParams.status || 'all'}
              onChange={(e) => {
                const params = new URLSearchParams(window.location.search)
                params.set('status', e.target.value)
                params.delete('page')
                window.location.search = params.toString()
              }}
              className="w-full sm:w-48 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </form>
        </CardContent>
      </Card>

      {/* Teachers Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ustoz</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kontakt</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Holat</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ishga qabul</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Telegram</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Harakatlar</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {teachers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    Ustozlar topilmadi
                  </td>
                </tr>
              ) : (
                teachers.map((teacher: any) => (
                  <tr key={teacher.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-blue-700">
                            {teacher.profiles?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{teacher.profiles?.full_name}</div>
                          <div className="text-xs text-gray-500">
                            {teacher.teacher_profiles?.is_active ? 'Faol' : 'Nofaol'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div>{teacher.profiles?.phone || '-'}</div>
                      <div>{teacher.profiles?.email || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                        teacher.status === 'APPROVED' && 'bg-green-100 text-green-800',
                        teacher.status === 'PENDING' && 'bg-yellow-100 text-yellow-800',
                        teacher.status === 'REJECTED' && 'bg-red-100 text-red-800',
                        teacher.status === 'SUSPENDED' && 'bg-gray-100 text-gray-800'
                      )}>
                        {teacher.status === 'APPROVED' && 'Tasdiqlangan'}
                        {teacher.status === 'PENDING' && 'Kutilmoqda'}
                        {teacher.status === 'REJECTED' && 'Rad etilgan'}
                        {teacher.status === 'SUSPENDED' && 'Faol emas'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {teacher.teacher_profiles?.employment_date
                        ? new Date(teacher.teacher_profiles.employment_date).toLocaleDateString('uz-UZ')
                        : '-'}
                    </td>
                    <td className="px-6 py-4">
                      {/* Telegram linked status would come from telegram_accounts join */}
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Tekshirilmoqda
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                      <Link
                        href={`/admin/schools/${schoolId}/teachers/${teacher.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Ko'rish
                      </Link>
                      {(isSchoolAdmin || isZavuch) && teacher.status === 'PENDING' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleApprove(teacher.id)}
                            className="text-green-600 hover:text-green-900"
                          >
                            Tasdiqlash
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReject(teacher.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Rad etish
                          </Button>
                        </>
                      )}
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
              {totalCount} ta ustozdan {(currentPage - 1) * 15 + 1} - {Math.min(currentPage * 15, totalCount)} gacha ko'rsatilmoqda
            </div>
            <div className="flex space-x-2">
              {currentPage > 1 && (
                <a
                  href={`?page=${currentPage - 1}${resolvedParams.search ? `&search=${resolvedParams.search}` : ''}${resolvedParams.status ? `&status=${resolvedParams.status}` : ''}`}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Oldingi
                </a>
              )}
              {currentPage < totalPages && (
                <a
                  href={`?page=${currentPage + 1}${resolvedParams.search ? `&search=${resolvedParams.search}` : ''}${resolvedParams.status ? `&status=${resolvedParams.status}` : ''}`}
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

function handleApprove(teacherId: string) {
  // Would call approve API
  console.log('Approve teacher:', teacherId)
}

function handleReject(teacherId: string) {
  // Would call reject API
  console.log('Reject teacher:', teacherId)
}