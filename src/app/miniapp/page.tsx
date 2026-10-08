'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/utils/cn'

interface SessionData {
  profile: any
  telegram_account: any
  memberships: any[]
  pending_memberships: any[]
  today_lessons: any[]
}

export default function MiniAppPage() {
  const router = useRouter()
  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'lessons' | 'attendance' | 'profile'>('lessons')

  useEffect(() => {
    loadSession()
  }, [])

  async function loadSession() {
    try {
      const initData = (window as any).Telegram?.WebApp?.initData || ''
      const res = await fetch('/api/teacher/miniapp-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      })
      const data = await res.json()
      if (data.profile) {
        setSession(data)
        if (data.memberships.length > 0 && !selectedSchoolId) {
          setSelectedSchoolId(data.memberships[0].school_id)
        }
      } else {
        router.push('/login')
      }
    } catch (error) {
      console.error('Failed to load session:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  if (!session) {
    return null
  }

  const currentMembership = session.memberships.find(m => m.school_id === selectedSchoolId)
  const currentSchool = currentMembership?.schools
  const currentLessons = session.today_lessons.filter(l =>
    currentMembership && session.memberships.some(m => m.id === currentMembership.id)
  )

  // Telegram WebApp setup
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
      tg.MainButton.setParams({ color: '#3b82f6', text_color: '#ffffff' })
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">MaktabDavomat</h1>
              <p className="text-xs text-gray-500">Ustoz paneli</p>
            </div>
          </div>

          {session.memberships.length > 1 && (
            <select
              value={selectedSchoolId || ''}
              onChange={(e) => setSelectedSchoolId(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {session.memberships.map(m => (
                <option key={m.school_id} value={m.school_id}>
                  {(m as any).schools?.short_name || (m as any).schools?.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="sticky top-16 z-30 bg-white border-b border-gray-200 px-4">
        <div className="flex space-x-1 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveTab('lessons')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors',
              activeTab === 'lessons'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-700'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            Bugungi darslar
          </button>
          <button
            onClick={() => setActiveTab('attendance')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors',
              activeTab === 'attendance'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-700'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            Davomat tarixi
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors',
              activeTab === 'profile'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-700'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            Profil
          </button>
        </div>
      </div>

      {/* Content */}
      <main className="px-4 py-4">
        {activeTab === 'lessons' && (
          <LessonsTab
            lessons={currentLessons}
            school={currentSchool}
            membership={currentMembership}
          />
        )}

        {activeTab === 'attendance' && (
          <AttendanceTab membership={currentMembership} school={currentSchool} />
        )}

        {activeTab === 'profile' && (
          <ProfileTab profile={session.profile} telegram={session.telegram_account} memberships={session.memberships} pending={session.pending_memberships} />
        )}
      </main>

      {/* Pending memberships banner */}
      {session.pending_memberships.length > 0 && (
        <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-96">
          <Card className="border-yellow-300">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Kutilayotgan so'rovlar</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {session.pending_memberships.length} maktab a'zolik so'rovingiz ko'rib chiqilmoqda
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function LessonsTab({ lessons, school, membership }: { lessons: any[], school: any, membership: any }) {
  if (!school) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">Maktab tanlanmagan</h3>
        <p className="mt-2 text-gray-500">Iltimos, yuqoridan maktabni tanlang</p>
      </div>
    )
  }

  if (lessons.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">Bugun darslar yo'q</h3>
        <p className="mt-2 text-gray-500">Bugun uchun rejalashtirilgan darslar topilmadi</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{school.name}</h2>
        <span className="text-sm text-gray-500">{lessons.length} ta dars</span>
      </div>

      <div className="space-y-3">
        {lessons.map((lesson) => (
          <LessonCard key={lesson.id} lesson={lesson} membership={membership} />
        ))}
      </div>
    </div>
  )
}

function LessonCard({ lesson, membership }: { lesson: any, membership: any }) {
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null)

  const statusColors: Record<string, string> = {
    PRESENT: 'bg-green-100 text-green-800',
    LATE: 'bg-yellow-100 text-yellow-800',
    MISSING: 'bg-red-100 text-red-800',
    PENDING: 'bg-gray-100 text-gray-800',
  }

  const statusLabels: Record<string, string> = {
    PRESENT: 'Keldi',
    LATE: 'Kechikdi',
    MISSING: 'Kelmadi',
    PENDING: 'Kutilmoqda',
  }

  async function handleScan() {
    if (!membership) return

    setScanning(true)
    setScanResult(null)

    try {
      // Get GPS location
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        })
      })

      const { latitude, longitude, accuracy } = position.coords

      // In a real app, you would scan QR code here
      // For now, we'll simulate with a prompt
      const scannedToken = prompt('QR kod tokenini kiriting (yoki skaner qo\'llab-quvvatlanganda avtomatik to\'ldiriladi):')
      if (!scannedToken) {
        setScanning(false)
        return
      }

      const requestId = crypto.randomUUID()
      const res = await fetch('/api/attendance/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          school_id: membership.school_id,
          lesson_occurrence_id: lesson.id,
          class_qr_code_id: lesson.class_qr_code_id, // This would come from the lesson data
          scanned_token: scannedToken,
          latitude,
          longitude,
          gps_accuracy_meters: accuracy,
        }),
      })

      const result = await res.json()

      if (result.success) {
        setScanResult({ success: true, message: result.message })
        // Refresh lesson status
        lesson.attendance_status = result.status
        lesson.late_minutes = result.late_minutes
      } else {
        setScanResult({ success: false, message: result.message })
      }
    } catch (error: any) {
      setScanResult({ success: false, message: error.message || 'Xatolik yuz berdi' })
    } finally {
      setScanning(false)
      // Clear scan result after 3 seconds
      setTimeout(() => setScanResult(null), 3000)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-sm font-medium text-gray-900">{lesson.subject}</span>
            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{lesson.class}</span>
          </div>
          <div className="flex items-center space-x-4 text-sm text-gray-500">
            <span className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{lesson.start_time} - {lesson.end_time}</span>
            </span>
            {lesson.room && (
              <span className="flex items-center space-x-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 22V12h6v10" />
                </svg>
                <span>{lesson.room}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2 ml-4">
          <span className={cn('px-2 py-1 rounded-full text-xs font-medium', statusColors[lesson.attendance_status])}>
            {statusLabels[lesson.attendance_status]}
            {lesson.late_minutes && ` (+${lesson.late_minutes} min)`}
          </span>

          {lesson.attendance_status === 'PENDING' && (
            <Button
              onClick={handleScan}
              disabled={scanning}
              size="sm"
              className="w-auto"
            >
              {scanning ? 'Tekshirilmoqda...' : 'QR skaner'}
            </Button>
          )}
        </div>
      </div>

      {scanResult && (
        <div className={cn('mt-3 p-3 rounded-lg text-sm', scanResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800')}>
          {scanResult.message}
        </div>
      )}
    </Card>
  )
}

function AttendanceTab({ membership, school }: { membership: any, school: any }) {
  return (
    <div className="space-y-4">
      {school ? (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{school.name} - Davomat tarixi</h3>
          <p className="text-gray-500 text-sm">Davomat tarixi funksiyasi tez orada qo'shiladi</p>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">Maktab tanlanmagan</p>
        </div>
      )}
    </div>
  )
}

function ProfileTab({ profile, telegram, memberships, pending }: { profile: any, telegram: any, memberships: any[], pending: any[] }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profil ma'lumotlari</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-2xl font-bold text-blue-700">
                {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-900">{profile?.full_name}</h4>
              <p className="text-sm text-gray-500">@{telegram?.username || 'username yo\'q'}</p>
              <p className="text-sm text-gray-500">{telegram?.first_name} {telegram?.last_name}</p>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h5 className="font-medium text-gray-900 mb-2">A'zoliklar</h5>
            {memberships.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-700">
                  {(m as any).schools?.name} ({(m as any).schools?.short_name})
                </span>
                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                  {m.membership_role}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Kutilayotgan so'rovlar</CardTitle>
          </CardHeader>
          <CardContent>
            {pending.map((m: any) => (
              <div key={m.id} className="py-2 border-b border-gray-100 last:border-0">
                <p className="text-sm font-medium text-gray-900">{(m as any).schools?.name}</p>
                <p className="text-xs text-gray-500">So'rov yuborilgan: {new Date(m.requested_at).toLocaleDateString('uz-UZ')}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}