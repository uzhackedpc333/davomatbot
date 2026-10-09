import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!

function verifyInitData(initData: string): { valid: boolean; user?: any } {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  params.delete('hash')

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  if (calculatedHash !== hash) {
    return { valid: false }
  }

  // Check auth_date freshness (24 hours)
  const authDate = parseInt(params.get('auth_date') || '0')
  const now = Math.floor(Date.now() / 1000)
  if (now - authDate > 86400) {
    return { valid: false }
  }

  // Parse user data
  const userParam = params.get('user')
  let user = null
  if (userParam) {
    try {
      user = JSON.parse(userParam)
    } catch {
      // ignore
    }
  }

  return { valid: true, user }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { initData } = body

    if (!initData) {
      return NextResponse.json({ error: 'initData required' }, { status: 400 })
    }

    const { valid, user } = verifyInitData(initData)

    if (!valid || !user) {
      return NextResponse.json({ error: 'Invalid initData' }, { status: 401 })
    }

    // Find telegram account
    const { data: tgAccount } = await supabase
      .from('telegram_accounts')
      .select('*, profiles(*)')
      .eq('telegram_user_id', user.id)
      .single()

    if (!tgAccount) {
      return NextResponse.json({ error: 'Telegram account not linked' }, { status: 404 })
    }

    // Get approved memberships
    const { data: memberships } = await supabase
      .from('school_memberships')
      .select(`
        *,
        schools (id, name, short_name, latitude, longitude, timezone, geofence_radius_meters, max_gps_accuracy_meters, checkin_opening_minutes_before, missing_grace_minutes)
      `)
      .eq('profile_id', tgAccount.profile_id)
      .eq('status', 'APPROVED')
      .eq('membership_role', 'TEACHER')

    // Get pending memberships
    const { data: pendingMemberships } = await supabase
      .from('school_memberships')
      .select(`
        *,
        schools (id, name, short_name)
      `)
      .eq('profile_id', tgAccount.profile_id)
      .eq('status', 'PENDING')

    // Get today's lessons for each approved membership
    const today = new Date().toISOString().split('T')[0]
    let todayLessons: any[] = []

    if (memberships && memberships.length > 0) {
      const schoolIds = memberships.map(m => m.school_id)
      const { data: occurrences } = await supabase
        .from('lesson_occurrences')
        .select(`
          *,
          lessons (
            id, subject_id, class_id, room_id, start_time, end_time,
            subjects (name),
            classes (name),
            rooms (name)
          ),
          lesson_occurrence_teachers!inner (
            school_membership_id
          )
        `)
        .eq('occurrence_date', today)
        .eq('status', 'SCHEDULED')
        .in('lesson_occurrence_teachers.school_membership_id', memberships.map(m => m.id))

      // Get attendance records for today
      const { data: attendance } = await supabase
        .from('attendance_records')
        .select('lesson_occurrence_id, status, late_minutes, scanned_at')
        .in('school_membership_id', memberships.map(m => m.id))
        .eq('scanned_at', today)

      // Combine lessons with attendance
      todayLessons = (occurrences || []).map((occ: any) => {
        const lesson = occ.lessons
        const attendanceRecord = attendance?.find((a: any) => a.lesson_occurrence_id === occ.id)
        return {
          id: occ.id,
          subject: lesson.subjects?.name,
          class: lesson.classes?.name,
          room: lesson.rooms?.name,
          start_time: lesson.start_time,
          end_time: lesson.end_time,
          attendance_status: attendanceRecord?.status || 'PENDING',
          late_minutes: attendanceRecord?.late_minutes,
          scanned_at: attendanceRecord?.scanned_at,
        }
      })
    }

    return NextResponse.json({
      profile: tgAccount.profiles,
      telegram_account: {
        id: tgAccount.id,
        telegram_user_id: tgAccount.telegram_user_id,
        username: tgAccount.username,
        first_name: tgAccount.first_name,
        last_name: tgAccount.last_name,
      },
      memberships: memberships || [],
      pending_memberships: pendingMemberships || [],
      today_lessons: todayLessons,
    })
  } catch (error) {
    console.error('MiniApp session error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}