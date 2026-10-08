import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/utils/cn'

const navigation = [
  { name: 'Bosh sahifa', href: '/admin/dashboard', icon: 'home' },
  { name: 'Maktablar', href: '/admin/schools', icon: 'building' },
  { name: 'Ustozlar', href: '/admin/teachers', icon: 'users' },
  { name: 'Tasdiqlash', href: '/admin/teacher-approvals', icon: 'user-check' },
  { name: 'Sinflar', href: '/admin/classes', icon: 'graduation-cap' },
  { name: 'Fanlar', href: '/admin/subjects', icon: 'book' },
  { name: 'Xonalar', href: '/admin/rooms', icon: 'door-open' },
  { name: 'Dars jadvali', href: '/admin/schedule', icon: 'calendar' },
  { name: 'QR kodlar', href: '/admin/qr-codes', icon: 'qr-code' },
  { name: 'Davomat', href: '/admin/attendance', icon: 'clipboard-check' },
  { name: 'Kuzatuv', href: '/admin/live-monitoring', icon: 'activity' },
  { name: 'Ish yuklamasi', href: '/admin/workload', icon: 'briefcase' },
  { name: 'Xavfsizlik', href: '/admin/security', icon: 'shield' },
  { name: 'Hujjatlar', href: '/admin/documents', icon: 'file-text' },
  { name: 'Hisobotlar', href: '/admin/reports', icon: 'bar-chart' },
  { name: 'Bildirishnomalar', href: '/admin/notifications', icon: 'bell' },
  { name: 'Audit loglar', href: '/admin/audit-logs', icon: 'history' },
  { name: 'Sozlamalar', href: '/admin/settings', icon: 'settings' },
]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, system_role, avatar_url')
    .eq('id', user.id)
    .single()

  const { data: memberships } = await supabase
    .from('school_memberships')
    .select(`
      id,
      school_id,
      membership_role,
      status,
      schools (id, name, short_name)
    `)
    .eq('profile_id', user.id)
    .eq('status', 'APPROVED')

  const adminMemberships = memberships?.filter(m =>
    ['ADMIN', 'ZAVUCH'].includes(m.membership_role)
  ) || []

  const isSuperAdmin = profile?.system_role === 'SUPER_ADMIN'

  // Get current school from URL or default to first admin membership
  // This would be handled by a school selector context in a real app

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 lg:translate-x-0">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
            <Link href="/admin/dashboard" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <span className="text-xl font-bold text-gray-900">MaktabDavomat</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Asosiy navigatsiya">
            {navigation.map((item) => {
              const isActive = false // Would be determined by current path
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  )}
                >
                  <span className="mr-3">{item.name}</span>
                </Link>
              )
            })}
          </nav>

          {/* User Profile */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-700 font-medium">
                  {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {profile?.full_name || 'Foydalanuvchi'}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {profile?.system_role?.toLowerCase().replace('_', ' ') || 'rol'}
                </p>
              </div>
            </div>
            <div className="mt-3 flex space-x-2">
              <Link
                href="/admin/profile"
                className="flex-1 text-center text-sm text-gray-600 hover:text-gray-900 py-2 px-3 rounded-lg hover:bg-gray-100"
              >
                Profil
              </Link>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="flex-1 text-center text-sm text-gray-600 hover:text-gray-900 py-2 px-3 rounded-lg hover:bg-gray-100"
                >
                  Chiqish
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center space-x-4">
              {/* School Selector */}
              <div className="relative">
                <select
                  className="appearance-none bg-white border border-gray-300 rounded-md py-2 pl-10 pr-32 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  aria-label="Maktab tanlash"
                >
                  {isSuperAdmin && <option value="">Barcha maktablar</option>}
                  {adminMemberships.map((m) => (
                    <option key={m.school_id} value={m.school_id}>
                      {(m as any).schools?.short_name || (m as any).schools?.name}
                    </option>
                  ))}
                </select>
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Notifications */}
              <button className="relative p-2 text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.035-.585 1.426L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">3</span>
              </button>

              {/* Theme Toggle */}
              <button className="p-2 text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="py-6">
          <div className="px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}