import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils/cn'

async function getSubjects(supabase: any, schoolId: string, searchParams: { page?: string; search?: string }) {
  const page = parseInt(searchParams.page || '1')
  const limit = 15
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('subjects')
    .select('*', { count: 'exact' })
    .eq('school_id', schoolId)
    .order('name', { ascending: true })
    .range(from, to)

  if (searchParams.search) {
    query = query.or(`name.ilike.%${searchParams.search}%,code.ilike.%${searchParams.search}%`)
  }

  const { data, count, error } = await query

  if (error) throw error

  return {
    subjects: data || [],
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
    currentPage: page,
  }
}

export default async function SubjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string; search?: string }>
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

  const { subjects, totalCount, totalPages, currentPage } = await getSubjects(supabase, schoolId, resolvedParams)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href={`/admin/schools/${schoolId}`} className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block">
            ← Maktabga qaytish
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Fanlar</h1>
          <p className="text-gray-500 mt-1">Fanlarni boshqarish</p>
        </div>
        <Button asChild>
          <Link href={`/admin/schools/${schoolId}/subjects/new`}>Yangi fan qo'shish</Link>
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <form className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="search" className="sr-only">Qidirish</Label>
              <Input
                id="search"
                name="search"
                placeholder="Fan nomi yoki kodi bo'yicha qidirish..."
                value={resolvedParams.search || ''}
                className="max-w-md"
              />
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Subjects Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kodi</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tavsif</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Holat</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Harakatlar</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {subjects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    Fanlar topilmadi
                  </td>
                </tr>
              ) : (
                subjects.map((subject: any) => (
                  <tr key={subject.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{subject.name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{subject.code || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{subject.description || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                        subject.status === 'ACTIVE' && 'bg-green-100 text-green-800',
                        subject.status === 'INACTIVE' && 'bg-gray-100 text-gray-800'
                      )}>
                        {subject.status === 'ACTIVE' && 'Faol'}
                        {subject.status === 'INACTIVE' && 'Nofaol'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                      <Link
                        href={`/admin/schools/${schoolId}/subjects/${subject.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Ko'rish
                      </Link>
                      {(isSchoolAdmin || isZavuch) && (
                        <Link
                          href={`/admin/schools/${schoolId}/subjects/${subject.id}/edit`}
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {totalCount} ta fandan {(currentPage - 1) * 15 + 1} - {Math.min(currentPage * 15, totalCount)} gacha ko'rsatilmoqda
            </div>
            <div className="flex space-x-2">
              {currentPage > 1 && (
                <a
                  href={`?page=${currentPage - 1}${resolvedParams.search ? `&search=${resolvedParams.search}` : ''}`}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Oldingi
                </a>
              )}
              {currentPage < totalPages && (
                <a
                  href={`?page=${currentPage + 1}${resolvedParams.search ? `&search=${resolvedParams.search}` : ''}`}
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