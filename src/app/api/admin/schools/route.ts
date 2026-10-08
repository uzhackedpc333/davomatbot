import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('system_role')
    .eq('id', user.id)
    .single()

  if (profile?.system_role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 10
  const from = (page - 1) * limit
  const to = from + limit - 1
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''

  let query = supabase
    .from('schools')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (search) {
    query = query.or(`name.ilike.%${search}%,short_name.ilike.%${search}%`)
  }
  if (status) {
    query = query.eq('status', status)
  }

  const { data, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    schools: data || [],
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
    currentPage: page,
  })
}

export async function POST(request: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('system_role')
    .eq('id', user.id)
    .single()

  if (profile?.system_role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const {
      name, short_name, address, phone, email,
      latitude, longitude, timezone,
      geofence_radius_meters, max_gps_accuracy_meters,
      checkin_opening_minutes_before, missing_grace_minutes,
    } = body

    if (!name || latitude === undefined || longitude === undefined) {
      return NextResponse.json({ error: 'Required fields missing' }, { status: 400 })
    }

    const schoolData = {
      name,
      short_name: short_name || null,
      address: address || null,
      phone: phone || null,
      email: email || null,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      timezone: timezone || 'Asia/Tashkent',
      geofence_radius_meters: parseInt(geofence_radius_meters) || 200,
      max_gps_accuracy_meters: parseInt(max_gps_accuracy_meters) || 50,
      checkin_opening_minutes_before: parseInt(checkin_opening_minutes_before) || 5,
      missing_grace_minutes: parseInt(missing_grace_minutes) || 5,
      status: 'ACTIVE',
    }

    const { data: school, error } = await supabase
      .from('schools')
      .insert(schoolData)
      .select()
      .single()

    if (error) throw error

    // Create default school settings
    await supabase.from('school_settings').insert({ school_id: school.id })

    // Audit
    await supabase.from('audit_logs').insert({
      actor_profile_id: user.id,
      school_id: school.id,
      action: 'CREATE_SCHOOL',
      entity_type: 'school',
      entity_id: school.id,
      new_values: schoolData,
    })

    return NextResponse.json({ success: true, school })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}