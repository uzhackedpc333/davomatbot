import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import crypto from 'https://deno.land/std@0.168.0/crypto/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function verifyInitData(initData: string): Promise<{ valid: boolean; user?: any }> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  params.delete('hash')

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const encoder = new TextEncoder()
  const secretKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const botTokenKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(BOT_TOKEN),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const secret = await crypto.subtle.sign('HMAC', botTokenKey, encoder.encode('WebAppData'))
  const calculatedHashBuffer = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(dataCheckString))
  const calculatedHash = Array.from(new Uint8Array(calculatedHashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { initData } = await req.json()

    if (!initData) {
      return new Response(JSON.stringify({ error: 'initData required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { valid, user } = await verifyInitData(initData)

    if (!valid || !user) {
      return new Response(JSON.stringify({ error: 'Invalid initData' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Find telegram account
    const { data: tgAccount } = await supabase
      .from('telegram_accounts')
      .select('*, profiles(*)')
      .eq('telegram_user_id', user.id)
      .single()

    if (!tgAccount) {
      return new Response(JSON.stringify({ error: 'Telegram account not linked' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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
      const membershipIds = memberships.map(m => m.id)

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
        .in('lesson_occurrence_teachers.school_membership_id', membershipIds)

      // Get attendance records for today
      const { data: attendance } = await supabase
        .from('attendance_records')
        .select('lesson_occurrence_id, status, late_minutes, scanned_at')
        .in('school_membership_id', membershipIds)
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
          class_qr_code_id: lesson.class_id, // This would need to be joined with class_qr_codes
          attendance_status: attendanceRecord?.status || 'PENDING',
          late_minutes: attendanceRecord?.late_minutes,
          scanned_at: attendanceRecord?.scanned_at,
        }
      })
    }

    return new Response(JSON.stringify({
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
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('MiniApp session error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})