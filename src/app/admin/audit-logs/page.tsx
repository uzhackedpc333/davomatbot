import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils/cn'
import { format } from 'date-fns'

async function getAuditLogs(supabase: any, schoolId: string | undefined, searchParams: {
  page?: string; action?: string; entity_type?: string; actor_id?: string; date_from?: string; date_to?: string;
}) {
  const page = parseInt(searchParams.page || '1')
  const limit = 25
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('audit_logs')
    .select(`
      *,
      actor:profiles!actor_profile_id(full_name, email),
      school:schools(name, short_name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (schoolId) {
    query = query.eq('school_id', schoolId)
  }

  if (searchParams.action) {
    query = query.ilike('action', `%${searchParams.action}%`)
  }

  if (searchParams.entity_type) {
    query = query.eq('entity_type', searchParams.entity_type)
  }

  if (searchParams.actor_id) {
    query = query.eq('actor_profile_id', searchParams.actor_id)
  }

  if (searchParams.date_from) {
    query = query.gte('created_at', searchParams.date_from)
  }

  if (searchParams.date_to) {
    query = query.lte('created_at', searchParams.date_to + 'T23:59:59')
  }

  const { data, count, error } = await query

  if (error) throw error

  return {
    logs: data || [],
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
    currentPage: page,
  }
}

async function getEntityTypes(supabase: any, schoolId: string | undefined) {
  let query = supabase
    .from('audit_logs')
    .select('entity_type')
    .order('entity_type')

  if (schoolId) {
    query = query.eq('school_id', schoolId)
  }

  const { data } = await query
  const types = [...new Set(data?.map((d: any) => d.entity_type) || [])]
  return types
}

async function getActions(supabase: any, schoolId: string | undefined) {
  let query = supabase
    .from('audit_logs')
    .select('action')
    .order('action')

  if (schoolId) {
    query = query.eq('school_id', schoolId)
  }

  const { data } = await query
  const actions = [...new Set(data?.map((d: any) => d.action) || [])]
  return actions
}

export default async function AuditLogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id?: string }>
  searchParams: Promise<{ page?: string; action?: string; entity_type?: string; actor_id?: string; date_from?: string; date_to?: string }>
}) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id: schoolId } = await params
  const resolvedParams = await searchParams

  // Check access
  if (schoolId) {
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
  } else {
    const { data: profile } = await supabase
      .from('profiles')
      .select('system_role')
      .eq('id', user.id)
      .single()

    if (profile?.system_role !== 'SUPER_ADMIN') {
      redirect('/unauthorized')
    }
  }

  const [auditData, entityTypes, actions] = await Promise.all([
    getAuditLogs(supabase, schoolId, resolvedParams),
    getEntityTypes(supabase, schoolId),
    getActions(supabase, schoolId),
  ])

  const { logs, totalCount, totalPages, currentPage } = auditData

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          {schoolId && (
            <Link href={`/admin/schools/${schoolId}`} className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block">
              ← Maktabga qaytish
            </Link>
          )}
          <h1 className="text-2xl font-bold text-gray-900">Audit loglar</h1>
          <p className="text-gray-500 mt-1">Tizimdagi barcha o'zgarishlar tarixi (o'chirib bo'lmaydi)</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <form className="flex flex-col lg:flex-row gap-4" id="filter-form">
            {schoolId ? null : (
              <select
                name="school_id"
                className="w-full sm:w-48 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Barcha maktablar</option>
              </select>
            )}

            <select
              name="entity_type"
              value={resolvedParams.entity_type || ''}
              className="w-full sm:w-48 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Barcha ob'ekt turlari</option>
              {entityTypes.map((type: string) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>

            <select
              name="action"
              value={resolvedParams.action || ''}
              className="w-full sm:w-56 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Barcha harakatlar</option>
              {actions.map((action: string) => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>

            <div className="flex space-x-2">
              <input
                name="date_from"
                type="date"
                value={resolvedParams.date_from || ''}
                className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Sana dan"
              />
              <input
                name="date_to"
                type="date"
                value={resolvedParams.date_to || ''}
                className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Sana gacha"
              />
            </div>

            <Button type="submit">Filtrlash</Button>
            <a
              href={schoolId ? `/admin/schools/${schoolId}/audit-logs` : '/admin/audit-logs'}
              className="h-10 flex items-center justify-center px-4"
            >
              <Button type="button" variant="outline">Tozalash</Button>
            </a>
          </form>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sana / Vaqt</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amaldor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Maktab</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Harakat</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ob'ekt turi</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ob'ekt ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Eski qiymatlar</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Yangi qiymatlar</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP / User Agent</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    Audit loglar topilmadi
                  </td>
                </tr>
              ) : (
                logs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                      {format(new Date(log.created_at), 'dd.MM.yyyy HH:mm:ss')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {log.actor?.full_name || 'Tizim'}
                      {log.actor?.email && <div className="text-xs text-gray-500">{log.actor.email}</div>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {log.school?.name || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-medium font-mono">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{log.entity_type}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">
                      {log.entity_id ? log.entity_id.slice(0, 12) + '...' : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                      <pre className="text-xs font-mono bg-gray-50 p-2 rounded overflow-auto max-h-20">
                        {log.old_values ? JSON.stringify(log.old_values, null, 2) : '-'}
                      </pre>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                      <pre className="text-xs font-mono bg-gray-50 p-2 rounded overflow-auto max-h-20">
                        {log.new_values ? JSON.stringify(log.new_values, null, 2) : '-'}
                      </pre>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div>{log.ip_address || '-'}</div>
                      {log.user_agent && <div className="text-xs truncate max-w-xs">{log.user_agent}</div>}
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
              {totalCount} ta logdan {(currentPage - 1) * 25 + 1} - {Math.min(currentPage * 25, totalCount)} gacha ko'rsatilmoqda
            </div>
            <div className="flex space-x-2">
              {currentPage > 1 && (
                <a
                  href={`?page=${currentPage - 1}&action=${resolvedParams.action || ''}&entity_type=${resolvedParams.entity_type || ''}&actor_id=${resolvedParams.actor_id || ''}&date_from=${resolvedParams.date_from || ''}&date_to=${resolvedParams.date_to || ''}`}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Oldingi
                </a>
              )}
              {currentPage < totalPages && (
                <a
                  href={`?page=${currentPage + 1}&action=${resolvedParams.action || ''}&entity_type=${resolvedParams.entity_type || ''}&actor_id=${resolvedParams.actor_id || ''}&date_from=${resolvedParams.date_from || ''}&date_to=${resolvedParams.date_to || ''}`}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Keyingi
                </a>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Info Notice */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-blue-900 text-sm">
              <strong className="block mb-1">Audit loglar haqida:</strong>
              <ul className="list-disc list-inside space-y-1">
                <li>Audit loglar tizimdagi barcha muhim o'zgarishlarni avtomatik qayd etadi</li>
                <li>Ular o'chirib bo'lmaydi va tahrirlanmaydi (immutable)</li>
                <li>Super admin barcha maktablar loglarini ko'ra oladi, admin/zavuch - faqat o'z maktablarining</li>
                <li>Loglar xavfsizlik auditlari va huquqiy maqsadlar uchun ishlatiladi</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}