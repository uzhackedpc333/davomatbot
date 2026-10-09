import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/utils/cn'
import { format } from 'date-fns'

const NOTIFICATION_TYPES = ['IN_APP', 'TELEGRAM']
const DELIVERY_STATUSES = ['PENDING', 'SENT', 'FAILED']

async function getNotifications(supabase: any, schoolId: string | undefined, searchParams: {
  page?: string; type?: string; delivery_status?: string; is_read?: string; date_from?: string; date_to?: string;
}) {
  const page = parseInt(searchParams.page || '1')
  const limit = 20
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('notifications')
    .select(`
      *,
      recipient:profiles!recipient_profile_id(full_name, phone),
      school:schools(name, short_name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (schoolId) {
    query = query.eq('school_id', schoolId)
  }

  if (searchParams.type && searchParams.type !== 'all') {
    query = query.eq('type', searchParams.type)
  }

  if (searchParams.delivery_status && searchParams.delivery_status !== 'all') {
    query = query.eq('telegram_delivery_status', searchParams.delivery_status)
  }

  if (searchParams.is_read && searchParams.is_read !== 'all') {
    query = query.eq('is_read', searchParams.is_read === 'true')
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
    notifications: data || [],
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
    currentPage: page,
  }
}

export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id?: string }>
  searchParams: Promise<{ page?: string; type?: string; delivery_status?: string; is_read?: string; date_from?: string; date_to?: string }>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id: schoolId } = await params
  const resolvedParams = await searchParams

  // Check access for school-specific view
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
    // Global view - only super admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('system_role')
      .eq('id', user.id)
      .single()

    if (profile?.system_role !== 'SUPER_ADMIN') {
      redirect('/unauthorized')
    }
  }

  const { notifications, totalCount, totalPages, currentPage } = await getNotifications(supabase, schoolId, resolvedParams)

  // Stats
  const stats = notifications.reduce((acc: any, n: any) => {
    acc[n.type] = (acc[n.type] || 0) + 1
    if (!n.is_read) acc.unread = (acc.unread || 0) + 1
    return acc
  }, {})

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
          <h1 className="text-2xl font-bold text-gray-900">Bildirishnomalar</h1>
          <p className="text-gray-500 mt-1">Tizim bildirishnomalarini ko'rish va boshqarish</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Jami</p>
              <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">O'qilmagan</p>
              <p className="text-2xl font-bold text-blue-600">{stats.unread || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Ichki</p>
              <p className="text-2xl font-bold text-green-600">{stats.IN_APP || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Telegram</p>
              <p className="text-2xl font-bold text-purple-600">{stats.TELEGRAM || 0}</p>
            </div>
          </div>
        </Card>
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
                {/* Schools would be loaded dynamically */}
              </select>
            )}

            <select
              name="type"
              value={resolvedParams.type || 'all'}
              className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Barcha turlari</option>
              <option value="IN_APP">Ichki</option>
              <option value="TELEGRAM">Telegram</option>
            </select>

            <select
              name="delivery_status"
              value={resolvedParams.delivery_status || 'all'}
              className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Yetkazish holati</option>
              <option value="PENDING">Kutilmoqda</option>
              <option value="SENT">Yuborilgan</option>
              <option value="FAILED">Xatolik</option>
            </select>

            <select
              name="is_read"
              value={resolvedParams.is_read || 'all'}
              className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">O'qilganligi</option>
              <option value="true">O'qilgan</option>
              <option value="false">O'qilmagan</option>
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
              href={schoolId ? `/admin/schools/${schoolId}/notifications` : '/admin/notifications'}
              className="h-10 flex items-center justify-center px-4"
            >
              <Button type="button" variant="outline">Tozalash</Button>
            </a>
          </form>
        </CardContent>
      </Card>

      {/* Notifications Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sana / Vaqt</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qabul qiluvchi</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Maktab</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Turi</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sarlavha</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matn</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">O'qilgan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Telegram holati</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Harakatlar</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {notifications.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    Bildirishnomalar topilmadi
                  </td>
                </tr>
              ) : (
                notifications.map((notification: any) => (
                  <tr key={notification.id} className={cn('hover:bg-gray-50', !notification.is_read && 'bg-blue-50')}>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {format(new Date(notification.created_at), 'dd.MM.yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {notification.recipient?.full_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {notification.school?.name || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex items-center px-2 py-1 rounded text-xs font-medium',
                        notification.type === 'IN_APP' && 'bg-blue-100 text-blue-800',
                        notification.type === 'TELEGRAM' && 'bg-purple-100 text-purple-800'
                      )}>
                        {notification.type === 'IN_APP' ? 'Ichki' : 'Telegram'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 max-w-xs truncate">
                      {notification.title}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {notification.body}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex items-center px-2 py-1 rounded text-xs font-medium',
                        notification.is_read ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      )}>
                        {notification.is_read ? 'Ha' : 'Yo\'q'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {notification.telegram_delivery_status && (
                        <span className={cn(
                          'inline-flex items-center px-2 py-1 rounded text-xs font-medium',
                          notification.telegram_delivery_status === 'SENT' && 'bg-green-100 text-green-800',
                          notification.telegram_delivery_status === 'PENDING' && 'bg-yellow-100 text-yellow-800',
                          notification.telegram_delivery_status === 'FAILED' && 'bg-red-100 text-red-800'
                        )}>
                          {notification.telegram_delivery_status}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      {!notification.is_read && (
                        <Button variant="ghost" size="sm" onClick={() => markAsRead(notification.id)}>
                          O'qilgan deb belgilash
                        </Button>
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
              {totalCount} ta bildirishnomadan {(currentPage - 1) * 20 + 1} - {Math.min(currentPage * 20, totalCount)} gacha ko'rsatilmoqda
            </div>
            <div className="flex space-x-2">
              {currentPage > 1 && (
                <a
                  href={`?page=${currentPage - 1}&type=${resolvedParams.type || ''}&delivery_status=${resolvedParams.delivery_status || ''}&is_read=${resolvedParams.is_read || ''}&date_from=${resolvedParams.date_from || ''}&date_to=${resolvedParams.date_to || ''}`}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Oldingi
                </a>
              )}
              {currentPage < totalPages && (
                <a
                  href={`?page=${currentPage + 1}&type=${resolvedParams.type || ''}&delivery_status=${resolvedParams.delivery_status || ''}&is_read=${resolvedParams.is_read || ''}&date_from=${resolvedParams.date_from || ''}&date_to=${resolvedParams.date_to || ''}`}
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

function markAsRead(notificationId: string) {
  // Would call API to mark as read
  console.log('Mark as read:', notificationId)
  window.location.reload()
}