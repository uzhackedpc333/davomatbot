import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils/cn'

async function getSchools(supabase: any, searchParams: { page?: string; search?: string; status?: string }) {
  const page = parseInt(searchParams.page || '1')
  const limit = 10
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('schools')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (searchParams.search) {
    query = query.or(`name.ilike.%${searchParams.search}%,short_name.ilike.%${searchParams.search}%`)
  }

  if (searchParams.status && searchParams.status !== 'all') {
    query = query.eq('status', searchParams.status)
  }

  const { data, count, error } = await query

  if (error) throw error

  return {
    schools: data || [],
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
    currentPage: page,
  }
}

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>
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

  if (!isSuperAdmin) {
    redirect('/unauthorized')
  }

  const resolvedParams = await searchParams
  const { schools, totalCount, totalPages, currentPage } = await getSchools(supabase, resolvedParams)

  const statusOptions = [
    { value: 'all', label: 'Barchasi' },
    { value: 'ACTIVE', label: 'Faol' },
    { value: 'INACTIVE', label: 'Nofaol' },
    { value: 'SUSPENDED', label: 'To\'xtatilgan' },
  ]

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maktablar</h1>
          <p className="text-gray-500 mt-1">Maktablarni boshqarish va monitoring qilish</p>
        </div>
        <Button asChild>
          <Link href="/admin/schools/new">Yangi maktab qo'shish</Link>
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
                placeholder="Maktab nomi yoki qisqa nomi bo'yicha qidirish..."
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

      {/* Schools Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Maktab</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Manzil</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Telefon</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Holat</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Yaratilgan</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Harakatlar</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {schools.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    Maktablar topilmadi
                  </td>
                </tr>
              ) : (
                schools.map((school: any) => (
                  <tr key={school.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{school.name}</div>
                      <div className="text-sm text-gray-500">{school.short_name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{school.address || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{school.phone || '-'}</td>
                    <td className="px-6 py-4">
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
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(school.created_at).toLocaleDateString('uz-UZ')}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                      <Link
                        href={`/admin/schools/${school.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Ko'rish
                      </Link>
                      <Link
                        href={`/admin/schools/${school.id}/edit`}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        Tahrirlash
                      </Link>
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
              {totalCount} ta maktabdan {(currentPage - 1) * 10 + 1} - {Math.min(currentPage * 10, totalCount)} gacha ko'rsatilmoqda
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