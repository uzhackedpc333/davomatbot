import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils/cn'

async function getPendingApprovals(supabase: any, schoolId?: string, searchParams: { page?: string; search?: string } = {}) {
  const page = parseInt(searchParams.page || '1')
  const limit = 15
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('school_memberships')
    .select(`
      *,
      profiles!inner(id, full_name, phone, email, avatar_url),
      schools!inner(id, name, short_name)
    `, { count: 'exact' })
    .eq('status', 'PENDING')
    .eq('membership_role', 'TEACHER')
    .order('requested_at', { ascending: true })
    .range(from, to)

  if (schoolId) {
    query = query.eq('school_id', schoolId)
  }

  if (searchParams.search) {
    query = query.or(`profiles.full_name.ilike.%${searchParams.search}%,profiles.phone.ilike.%${searchParams.search}%,schools.name.ilike.%${searchParams.search}%`)
  }

  const { data, count, error } = await query

  if (error) throw error

  return {
    approvals: data || [],
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
    currentPage: page,
  }
}

export default async function TeacherApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; school_id?: string }>
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

  const resolvedParams = await searchParams
  const schoolId = resolvedParams.school_id

  // If not super admin, get user's admin schools
  let adminSchools: any[] = []
  if (!isSuperAdmin) {
    const { data: memberships } = await supabase
      .from('school_memberships')
      .select('school_id, schools(id, name, short_name)')
      .eq('profile_id', user.id)
      .eq('membership_role', 'ADMIN')
      .eq('status', 'APPROVED')

    adminSchools = memberships?.map((m: any) => m.schools).filter(Boolean) || []
  }

  const { approvals, totalCount, totalPages, currentPage } = await getPendingApprovals(supabase, schoolId, resolvedParams)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ustoz tasdiqlash</h1>
          <p className="text-gray-500 mt-1">Kutilayotgan a'zolik so'rovlarini ko'rib chiqish va tasdiqlash</p>
        </div>
      </div>

      {/* School Selector (for super admin) */}
      {isSuperAdmin && adminSchools.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-4">
              <Label htmlFor="school-filter" className="text-sm font-medium text-gray-700">Maktab:</Label>
              <select
                id="school-filter"
                value={schoolId || 'all'}
                onChange={(e) => {
                  const params = new URLSearchParams(window.location.search)
                  if (e.target.value === 'all') {
                    params.delete('school_id')
                  } else {
                    params.set('school_id', e.target.value)
                  }
                  params.delete('page')
                  window.location.search = params.toString()
                }}
                className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Barcha maktablar</option>
                {adminSchools.map((school: any) => (
                  <option key={school.id} value={school.id}>{school.short_name || school.name}</option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approvals Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ustoz</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Maktab</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kontakt</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">So'rov sanasi</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Harakatlar</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {approvals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    Kutilayotgan so'rovlar yo'q
                  </td>
                </tr>
              ) : (
                approvals.map((approval: any) => (
                  <tr key={approval.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-blue-700">
                            {approval.profiles?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{approval.profiles?.full_name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {approval.schools?.name}
                      {approval.schools?.short_name && ` (${approval.schools.short_name})`}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div>{approval.profiles?.phone || '-'}</div>
                      <div>{approval.profiles?.email || '-'}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(approval.requested_at).toLocaleString('uz-UZ')}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                      <Link
                        href={`/admin/teachers/${approval.profiles?.id}?school_id=${approval.school_id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Batafsil
                      </Link>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleApprove(approval.id, approval.school_id)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        Tasdiqlash
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReject(approval.id, approval.school_id)}
                        className="text-red-600 hover:text-red-700 border-red-300"
                      >
                        Rad etish
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
              {totalCount} ta so'rovdan {(currentPage - 1) * 15 + 1} - {Math.min(currentPage * 15, totalCount)} gacha ko'rsatilmoqda
            </div>
            <div className="flex space-x-2">
              {currentPage > 1 && (
                <a
                  href={`?page=${currentPage - 1}${resolvedParams.search ? `&search=${resolvedParams.search}` : ''}${schoolId ? `&school_id=${schoolId}` : ''}`}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Oldingi
                </a>
              )}
              {currentPage < totalPages && (
                <a
                  href={`?page=${currentPage + 1}${resolvedParams.search ? `&search=${resolvedParams.search}` : ''}${schoolId ? `&school_id=${schoolId}` : ''}`}
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

function handleApprove(approvalId: string, schoolId: string) {
  // Would call approve API
  console.log('Approve:', approvalId, schoolId)
  alert('Tasdiqlash funksiyasi API orqali amalga oshiriladi')
}

function handleReject(approvalId: string, schoolId: string) {
  const reason = prompt('Rad etish sababini kiriting:')
  if (reason) {
    console.log('Reject:', approvalId, schoolId, reason)
    alert('Rad etish funksiyasi API orqali amalga oshiriladi')
  }
}