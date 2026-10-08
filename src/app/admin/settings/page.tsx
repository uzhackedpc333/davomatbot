import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils/cn'

async function getSchoolSettings(supabase: any, schoolId: string) {
  const { data, error } = await supabase
    .from('school_settings')
    .select('*')
    .eq('school_id', schoolId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data
}

async function getSchool(supabase: any, schoolId: string) {
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .eq('id', schoolId)
    .single()

  if (error) throw error
  return data
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = createClient()

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

  if (!isSuperAdmin && !isSchoolAdmin) {
    redirect('/unauthorized')
  }

  const [school, settings] = await Promise.all([
    getSchool(supabase, schoolId),
    getSchoolSettings(supabase, schoolId),
  ])

  const defaultSettings = {
    telegram_notifications_enabled: true,
    notify_teacher_on_approval: true,
    notify_teacher_on_rejection: true,
    notify_teacher_on_suspension: true,
    notify_admin_on_pending_membership: true,
    notify_admin_on_attendance: true,
    notify_admin_on_security_events: true,
    notify_admin_on_missing_attendance: true,
    document_retention_days: 365,
    auto_generate_daily_reports: true,
    auto_generate_monthly_reports: true,
  }

  const mergedSettings = { ...defaultSettings, ...settings }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/admin/schools/${schoolId}`} className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block">
            ← Maktabga qaytish
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Maktab sozlamalari</h1>
          <p className="text-gray-500 mt-1">{school.name} - Tizim sozlamalarini boshqarish</p>
        </div>
      </div>

      {/* School Info */}
      <Card>
        <CardHeader>
          <CardTitle>Maktab ma'lumotlari</CardTitle>
          <CardDescription>Asosiy ma'lumotlar (faqat super admin o'zgartira oladi)</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/api/admin/schools/[id]" method="POST" className="space-y-6">
            <input type="hidden" name="school_id" value={schoolId} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">Maktab nomi *</Label>
                <Input id="name" name="name" defaultValue={school.name} required disabled={!isSuperAdmin} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="short_name">Qisqa nom</Label>
                <Input id="short_name" name="short_name" defaultValue={school.short_name || ''} disabled={!isSuperAdmin} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Manzil</Label>
              <Input id="address" name="address" defaultValue={school.address || ''} disabled={!isSuperAdmin} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input id="phone" name="phone" type="tel" defaultValue={school.phone || ''} disabled={!isSuperAdmin} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Elektron pochta</Label>
                <Input id="email" name="email" type="email" defaultValue={school.email || ''} disabled={!isSuperAdmin} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="latitude">Kenglik (Latitude) *</Label>
                <Input
                  id="latitude"
                  name="latitude"
                  type="number"
                  step="0.00000001"
                  defaultValue={school.latitude}
                  required
                  disabled={!isSuperAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">Uzunlik (Longitude) *</Label>
                <Input
                  id="longitude"
                  name="longitude"
                  type="number"
                  step="0.00000001"
                  defaultValue={school.longitude}
                  required
                  disabled={!isSuperAdmin}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="timezone">Vaqt mintaqasi *</Label>
                <select
                  id="timezone"
                  name="timezone"
                  defaultValue={school.timezone}
                  required
                  disabled={!isSuperAdmin}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Asia/Tashkent">Asia/Tashkent (UTC+5)</option>
                  <option value="Asia/Samarkand">Asia/Samarkand (UTC+5)</option>
                  <option value="Asia/Bishkek">Asia/Bishkek (UTC+6)</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="geofence_radius_meters">Geofence radius (metr) *</Label>
                <Input
                  id="geofence_radius_meters"
                  name="geofence_radius_meters"
                  type="number"
                  min="50"
                  max="1000"
                  defaultValue={school.geofence_radius_meters}
                  required
                  disabled={!isSuperAdmin}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_gps_accuracy_meters">Maksimal GPS aniqligi (metr) *</Label>
                <Input
                  id="max_gps_accuracy_meters"
                  name="max_gps_accuracy_meters"
                  type="number"
                  min="10"
                  max="200"
                  defaultValue={school.max_gps_accuracy_meters}
                  required
                  disabled={!isSuperAdmin}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="checkin_opening_minutes_before">Darsdan oldin ochilishi (daqiqa) *</Label>
                <Input
                  id="checkin_opening_minutes_before"
                  name="checkin_opening_minutes_before"
                  type="number"
                  min="0"
                  max="60"
                  defaultValue={school.checkin_opening_minutes_before}
                  required
                  disabled={!isSuperAdmin}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="missing_grace_minutes">Kechikish chadru (daqiqa) *</Label>
                <Input
                  id="missing_grace_minutes"
                  name="missing_grace_minutes"
                  type="number"
                  min="1"
                  max="60"
                  defaultValue={school.missing_grace_minutes}
                  required
                  disabled={!isSuperAdmin}
                />
              </div>
            </div>

            {isSuperAdmin && (
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <Button type="submit">Saqlash</Button>
              </div>
            )}
            {!isSuperAdmin && (
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-500">Bu sozlamalarni faqat Super Admin o'zgartira oladi.</p>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Bildirishnoma sozlamalari</CardTitle>
          <CardDescription>Qaysi hodisalarda bildirishnoma yuborilmasini sozlang</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/api/admin/schools/[id]/settings/notifications" method="POST" className="space-y-6">
            <input type="hidden" name="school_id" value={schoolId} />

            <div className="space-y-4">
              <h4 className="font-medium text-gray-900">Telegram bildirishnomalari</h4>
              <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  name="telegram_notifications_enabled"
                  defaultChecked={mergedSettings.telegram_notifications_enabled}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Telegram orqali bildirishnoma yuborishni yoqish</span>
              </label>
            </div>

            <div className="border-t border-gray-200 pt-4 space-y-4">
              <h4 className="font-medium text-gray-900">Ustozlarga yuboriladigan bildirishnomalar</h4>
              <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  name="notify_teacher_on_approval"
                  defaultChecked={mergedSettings.notify_teacher_on_approval}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">A'zolik tasdiqlandigida</span>
              </label>
              <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  name="notify_teacher_on_rejection"
                  defaultChecked={mergedSettings.notify_teacher_on_rejection}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">A'zolik rad etilganda</span>
              </label>
              <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  name="notify_teacher_on_suspension"
                  defaultChecked={mergedSettings.notify_teacher_on_suspension}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Faoliyati to'xtatilganda</span>
              </label>
            </div>

            <div className="border-t border-gray-200 pt-4 space-y-4">
              <h4 className="font-medium text-gray-900">Admin/Zavuchlarga yuboriladigan bildirishnomalar</h4>
              <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  name="notify_admin_on_pending_membership"
                  defaultChecked={mergedSettings.notify_admin_on_pending_membership}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Yangi a'zolik so'rovi keldigida</span>
              </label>
              <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  name="notify_admin_on_attendance"
                  defaultChecked={mergedSettings.notify_admin_on_attendance}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Ustoz davomat belgilaganda (kechikishlar)</span>
              </label>
              <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  name="notify_admin_on_security_events"
                  defaultChecked={mergedSettings.notify_admin_on_security_events}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Xavfsizlik hodisasi yuz berganda</span>
              </label>
              <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  name="notify_admin_on_missing_attendance"
                  defaultChecked={mergedSettings.notify_admin_on_missing_attendance}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Ustoz darsga kelmaganda (avtomatik)</span>
              </label>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <Button type="submit">Bildirishnoma sozlamalarini saqlash</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Document & Report Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Hujjat va hisobot sozlamalari</CardTitle>
          <CardDescription>Avtomatik yaratish va saqlash muddatlari</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/api/admin/schools/[id]/settings/documents" method="POST" className="space-y-6">
            <input type="hidden" name="school_id" value={schoolId} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="document_retention_days">Hujjat saqlash muddati (kun) *</Label>
                <Input
                  id="document_retention_days"
                  name="document_retention_days"
                  type="number"
                  min="30"
                  max="2555"
                  defaultValue={mergedSettings.document_retention_days}
                  required
                />
                <p className="text-xs text-gray-500">Es Dirkda o'tgach hujjatlar avtomatik o'chiriladi (yoki arxivlanadi)</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auto_generate_daily_reports">Avtomatik kunlik hisobotlar</Label>
                <select
                  id="auto_generate_daily_reports"
                  name="auto_generate_daily_reports"
                  defaultValue={mergedSettings.auto_generate_daily_reports.toString()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="true">Yoqilgan</option>
                  <option value="false">O'chirilgan</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auto_generate_monthly_reports">Avtomatik oylik hisobotlar</Label>
                <select
                  id="auto_generate_monthly_reports"
                  name="auto_generate_monthly_reports"
                  defaultValue={mergedSettings.auto_generate_monthly_reports.toString()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="true">Yoqilgan</option>
                  <option value="false">O'chirilgan</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <Button type="submit">Hujjat sozlamalarini saqlash</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-900">Xavfli harakatlar</CardTitle>
          <CardDescription className="text-red-800">Bu harakatlar qaytarib bo'lmaydi. Ehtiyot bo'ling.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-red-200">
            <div>
              <p className="font-medium text-red-900">Maktabni to'xtatish</p>
              <p className="text-sm text-red-700">Maktab barcha foydalanuvchilar uchun nofaol holatga o'tkaziladi. Davomat va barcha funksiyalar to'xtatiladi.</p>
            </div>
            <Button variant="destructive" onClick={() => confirmSuspend()}>To'xtatish</Button>
          </div>

          <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-red-200">
            <div>
              <p className="font-medium text-red-900">Maktabni arxivlash</p>
              <p className="text-sm text-red-700">Maktab butunlay yashiriladi. Ma'lumotlar saqlanib qoladi lekin interfeysda ko'rinmaydi.</p>
            </div>
            <Button variant="destructive" onClick={() => confirmArchive()}>Arxivlash</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function confirmSuspend() {
  if (confirm('Haqiqatan ham bu maktabni to\'xtatmoqchimisiz? Bu harakat barcha ustozlar va adminlar uchun tizimni nofaol qiladi.')) {
    alert('Maktab to\'xtatish API chaqiriladi')
  }
}

function confirmArchive() {
  if (confirm('Haqiqatan ham bu maktabni arxivlamoqchimisiz? Bu harakat qaytarib bo\'lmaydi.')) {
    alert('Maktab arxivlash API chaqiriladi')
  }
}