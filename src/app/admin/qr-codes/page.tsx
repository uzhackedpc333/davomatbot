import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils/cn'
import QRCode from 'qrcode'

async function getQRCodes(supabase: any, schoolId: string) {
  const { data, error } = await supabase
    .from('class_qr_codes')
    .select(`
      *,
      classes!inner(id, name, grade, section, academic_year)
    `)
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return data || []
}

async function getClassesWithoutQR(supabase: any, schoolId: string) {
  const { data, error } = await supabase
    .from('classes')
    .select('id, name, grade, section, academic_year')
    .eq('school_id', schoolId)
    .eq('status', 'ACTIVE')
    .not('id', 'in', `(${supabase.from('class_qr_codes').select('class_id').eq('school_id', schoolId).eq('status', 'ACTIVE')})`)

  if (error) throw error

  return data || []
}

export default async function QRCodesPage({
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
  const isZavuch = membership?.membership_role === 'ZAVUCH' && membership?.status === 'APPROVED'

  if (!isSuperAdmin && !isSchoolAdmin && !isZavuch) {
    redirect('/unauthorized')
  }

  const [qrCodes, classesWithoutQR] = await Promise.all([
    getQRCodes(supabase, schoolId),
    getClassesWithoutQR(supabase, schoolId),
  ])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href={`/admin/schools/${schoolId}`} className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block">
            ← Maktabga qaytish
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">QR kodlar</h1>
          <p className="text-gray-500 mt-1">Sinf QR kodlarini yaratish va boshqarish</p>
        </div>
        {classesWithoutQR.length > 0 && (
          <Button asChild>
            <Link href={`/admin/schools/${schoolId}/qr-codes/new`}>Yangi QR kod yaratish</Link>
          </Button>
        )}
      </div>

      {/* QR Codes List */}
      <Card>
        <CardHeader>
          <CardTitle>Mavjud QR kodlar ({qrCodes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {qrCodes.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2m2 4a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">QR kodlar yo'q</h3>
              <p className="mt-2 text-gray-500">Yangi QR kod yarating</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {qrCodes.map((qr: any) => (
                <QRCodeCard key={qr.id} qr={qr} schoolId={schoolId} canManage={isSchoolAdmin || isZavuch} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Classes without QR */}
      {classesWithoutQR.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-yellow-900">QR kodi yo'q sinflar ({classesWithoutQR.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-yellow-800 text-sm mb-4">
              Quyidagi sinflar uchun hali QR kod yaratilmagan. Ustozlar bu sinflar uchun davomat qila olmaydi.
            </p>
            <div className="flex flex-wrap gap-2">
              {classesWithoutQR.map((cls: any) => (
                <span key={cls.id} className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                  {cls.name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function QRCodeCard({ qr, schoolId, canManage }: { qr: any, schoolId: string, canManage: boolean }) {
  const [qrImage, setQrImage] = React.useState<string | null>(null)
  const [showToken, setShowToken] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    generateQR()
  }, [qr.id])

  async function generateQR() {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const qrData = JSON.stringify({
        t: 'class_qr',
        c: qr.classes.id,
        s: schoolId,
        // Token would be retrieved from secure storage in real app
      })
      const dataUrl = await QRCode.toDataURL(qrData, {
        width: 256,
        margin: 2,
        color: { dark: '#1f2937', light: '#ffffff' },
      })
      setQrImage(dataUrl)
    } catch (error) {
      console.error('QR generation error:', error)
    }
  }

  async function handleRegenerate() {
    if (!confirm('Eski QR kod bekor qilinadi va yangi yaratiladi. Davom etmoqchimisiz?')) return

    setLoading(true)
    try {
      const res = await fetch(`/api/admin/qr-codes/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: qr.classes.id, school_id: schoolId }),
      })
      const result = await res.json()
      if (result.success) {
        window.location.reload()
      } else {
        alert(result.message || 'Xatolik yuz berdi')
      }
    } catch (error) {
      alert('Xatolik yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  async function handleDisable() {
    if (!confirm('QR kodni o\'chirasizmi? Ustozlar bu sinf uchun davomat qila olmaydi.')) return

    setLoading(true)
    try {
      const res = await fetch(`/api/admin/qr-codes/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: qr.classes.id, school_id: schoolId }),
      })
      const result = await res.json()
      if (result.success) {
        window.location.reload()
      } else {
        alert(result.message || 'Xatolik yuz berdi')
      }
    } catch (error) {
      alert('Xatolik yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className={cn('relative', qr.status === 'DISABLED' && 'opacity-50')}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h4 className="font-semibold text-gray-900">{qr.classes.name}</h4>
            <p className="text-sm text-gray-500">
              {qr.classes.grade}-sinf {qr.classes.section} harfi • {qr.classes.academic_year}
            </p>
          </div>
          <span className={cn(
            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
            qr.status === 'ACTIVE' && 'bg-green-100 text-green-800',
            qr.status === 'DISABLED' && 'bg-gray-100 text-gray-800'
          )}>
            {qr.status === 'ACTIVE' ? 'Faol' : 'O\'chirilgan'}
          </span>
        </div>

        {qrImage && (
          <div className="flex flex-col items-center space-y-3">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <img src={qrImage} alt={`QR kod - ${qr.classes.name}`} className="w-40 h-40" />
            </div>

            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <span className="flex-1 text-center break-all font-mono bg-gray-100 px-2 py-1 rounded">
                {qr.token_hash.slice(0, 16)}...
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowToken(!showToken)}
                className="whitespace-nowrap"
              >
                {showToken ? 'Yashirish' : 'Ko\'rsatish'}
              </Button>
            </div>

            {showToken && (
              <div className="w-full p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
                <strong>Diqqat: </strong> Tokenni faqat o'zingizga qoldiring. Bu token bilan har kim davomat qila oladi.
              </div>
            )}

            {canManage && (
              <div className="flex space-x-2 w-full pt-2 border-t border-gray-200">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleRegenerate}
                  disabled={loading}
                >
                  {loading ? 'Yaratilmoqda...' : 'Yangilash'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-red-600 border-red-300 hover:bg-red-50"
                  onClick={handleDisable}
                  disabled={loading || qr.status === 'DISABLED'}
                >
                  O'chirish
                </Button>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={() => {
                if (qrImage) {
                  const link = document.createElement('a')
                  link.href = qrImage
                  link.download = `qr-${qr.classes.name}.png`
                  link.click()
                }
              }}
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              PNG yuklab olish
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}