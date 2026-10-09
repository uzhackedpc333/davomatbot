import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: schoolId } = await params

  try {
    const formData = await request.formData()

    // Check if user is admin for this school
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const settingsData = {
      telegram_notifications_enabled: formData.get('telegram_notifications_enabled') === 'on',
      notify_teacher_on_approval: formData.get('notify_teacher_on_approval') === 'on',
      notify_teacher_on_rejection: formData.get('notify_teacher_on_rejection') === 'on',
      notify_teacher_on_suspension: formData.get('notify_teacher_on_suspension') === 'on',
      notify_admin_on_pending_membership: formData.get('notify_admin_on_pending_membership') === 'on',
      notify_admin_on_attendance: formData.get('notify_admin_on_attendance') === 'on',
      notify_admin_on_security_events: formData.get('notify_admin_on_security_events') === 'on',
      notify_admin_on_missing_attendance: formData.get('notify_admin_on_missing_attendance') === 'on',
    }

    const { error } = await supabase
      .from('school_settings')
      .upsert({
        school_id: schoolId,
        ...settingsData,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      console.error('Update notification settings error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log audit
    await supabase
      .from('audit_logs')
      .insert({
        actor_profile_id: user.id,
        school_id: schoolId,
        action: 'UPDATE_NOTIFICATION_SETTINGS',
        entity_type: 'school_settings',
        new_values: settingsData,
      })

    return NextResponse.redirect(new URL(`/admin/schools/${schoolId}/settings`, request.url))
  } catch (error) {
    console.error('Update notification settings API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}