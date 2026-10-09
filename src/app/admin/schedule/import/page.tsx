import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils/cn'
import * as XLSX from 'xlsx'

async function getAcademicYears(supabase: any, schoolId: string) {
  const { data } = await supabase
    .from('lessons')
    .select('academic_year')
    .eq('school_id', schoolId)
  const years = [...new Set(data?.map((d: any) => d.academic_year) || [])]
  return years.sort().reverse()
}

export default async function ScheduleImportPage({
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

  if (!isSuperAdmin && !isSchoolAdmin) {
    redirect('/unauthorized')
  }

  const academicYears = await getAcademicYears(supabase, schoolId)

  const currentYear = new Date().getFullYear().toString()
  const defaultYear = academicYears.includes(currentYear) ? currentYear : academicYears[0] || currentYear

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/admin/schools/${schoolId}/schedule`} className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block">
            ← Dars jadvaliga qaytish
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Jadvalni Excel dan import qilish</h1>
          <p className="text-gray-500 mt-1">XLSX fayl yuklab, dars jadvalini tez va to'g'ri import qiling</p>
        </div>
      </div>

      {/* Instructions */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-6">
          <h4 className="font-semibold text-blue-900 mb-3">📋 Import qo'llanmasi</h4>
          <div className="space-y-2 text-sm text-blue-800">
            <p><strong>1.</strong> Quyidagi ustun nomlari bilan Excel fayl tayyorlang</p>
            <p><strong>2.</strong> Majburiy ustunlar: <code className="px-1 bg-blue-100 rounded">Fan nomi</code>, <code className="px-1 bg-blue-100 rounded">Sinf nomi</code>, <code className="px-1 bg-blue-100 rounded">Hafta kuni</code>, <code className="px-1 bg-blue-100 rounded">Boshlanish vaqti</code>, <code className="px-1 bg-blue-100 rounded">Tugash vaqti</code></p>
            <p><strong>3.</strong> Vaqt formati: <code className="px-1 bg-blue-100 rounded">HH:MM</code> (masalan: 08:30)</p>
            <p><strong>4.</strong> Hafta kuni: Yakshanba, Dushanba, Seshanba, Chorshanba, Payshanba, Juma, Shanba</p>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer font-medium text-blue-900">Ustun nomlari ro'yxati (bosib ko'ring)</summary>
            <div className="mt-3 p-3 bg-white rounded border border-blue-200 font-mono text-xs overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-blue-600">
                    <th className="pb-2">Ustun nomi</th>
                    <th className="pb-2">Tavsif</th>
                    <th className="pb-2">Majburiy</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  <tr><td className="py-1">Fan nomi</td><td className="py-1">Fan to'liq nomi</td><td className="py-1 text-green-600">Ha</td></tr>
                  <tr><td className="py-1">Fan kodi</td><td className="py-1">Qisqa kod (mas: MATH, PHYS)</td><td className="py-1">Yo'q</td></tr>
                  <tr><td className="py-1">Sinf nomi</td><td className="py-1">Mas: 9-A, 10-B</td><td className="py-1 text-green-600">Ha</td></tr>
                  <tr><td className="py-1">Sinfi</td><td className="py-1">Raqam (9, 10, 11)</td><td className="py-1">Yo'q</td></tr>
                  <tr><td className="py-1">Harfi</td><td className="py-1">Harf (A, B, C)</td><td className="py-1">Yo'q</td></tr>
                  <tr><td className="py-1">Xona</td><td className="py-1">Xona nomi</td><td className="py-1">Yo'q</td></tr>
                  <tr><td className="py-1">Hafta kuni</td><td className="py-1">Yakshanba...Shanba</td><td className="py-1 text-green-600">Ha</td></tr>
                  <tr><td className="py-1">Boshlanish vaqti</td><td className="py-1">HH:MM formatida</td><td className="py-1 text-green-600">Ha</td></tr>
                  <tr><td className="py-1">Tugash vaqti</td><td className="py-1">HH:MM formatida</td><td className="py-1 text-green-600">Ha</td></tr>
                  <tr><td className="py-1">Ustoz telefoni</td><td className="py-1">+998 XX XXX XX XX</td><td className="py-1">Yo'q</td></tr>
                  <tr><td className="py-1">Ustoz FIO</td><td className="py-1">To'liq ism-familiya</td><td className="py-1">Yo'q</td></tr>
                </tbody>
              </table>
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Import Form */}
      <Card>
        <CardHeader>
          <CardTitle>Fayl yuklash</CardTitle>
          <CardDescription>Excel faylni tanlang va ta'lim yilini belgilang</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/api/admin/schedule/import" method="POST" encType="multipart/form-data" className="space-y-6">
            <input type="hidden" name="school_id" value={schoolId} />

            <div className="space-y-2">
              <Label htmlFor="academic_year">Ta'lim yili *</Label>
              <select
                id="academic_year"
                name="academic_year"
                required
                className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(academicYears as string[]).map((year: string) => (
                  <option key={year} value={year} selected={year === defaultYear}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">Excel fayl (.xlsx) *</Label>
              <Input
                id="file"
                name="file"
                type="file"
                accept=".xlsx,.xls"
                required
                className="w-full"
              />
              <p className="text-xs text-gray-500">Maksimal hajm: 5MB. Faqat .xlsx va .xls fayllar qabul qilinadi.</p>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <Link href={`/admin/schools/${schoolId}/schedule`}>
                <Button type="button" variant="outline">Bekor qilish</Button>
              </Link>
              <Button type="submit">Import qilish</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Sample Template Download */}
      <Card>
        <CardHeader>
          <CardTitle>Namuna shablon</CardTitle>
          <CardDescription>To'g'ri formatda fayl yaratish uchun namuna shablonni yuklab oling</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={downloadTemplate}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Namuna shablonni yuklab olish (.xlsx)
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function downloadTemplate() {
  // Create sample template
  const headers = [
    'Fan nomi', 'Fan kodi', 'Sinf nomi', 'Sinfi', 'Harfi',
    'Xona', 'Hafta kuni', 'Boshlanish vaqti', 'Tugash vaqti',
    'Ustoz telefoni', 'Ustoz FIO'
  ]

  const sampleData = [
    ['Matematika', 'MATH', '9-A', 9, 'A', '101-xona', 'Dushanba', '08:00', '08:45', '+998901234567', 'Aliyev Alisher'],
    ['Fizika', 'PHYS', '9-A', 9, 'A', '201-xona', 'Dushanba', '09:00', '09:45', '+998901234568', 'Valiyeva Malika'],
    ['Kimyo', 'CHEM', '9-B', 9, 'B', '301-xona', 'Seshanba', '08:00', '08:45', '', ''],
    ['Biologiya', 'BIO', '10-A', 10, 'A', '102-xona', 'Chorshanba', '10:00', '10:45', '+998901234569', 'Karimov Jasur'],
  ]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData])

  // Set column widths
  ws['!cols'] = headers.map(() => ({ wch: 20 }))

  XLSX.utils.book_append_sheet(wb, ws, 'Jadval Shabloni')
  XLSX.writeFile(wb, 'jadval_shablonu.xlsx')
}