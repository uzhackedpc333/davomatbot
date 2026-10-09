import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { approval_id, school_id, action, rejection_reason, admin_notes } = body

    if (!approval_id || !school_id || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check access
    const { data: membership } = await supabase
      .from('school_memberships')
      .select('membership_role, status')
      .eq('school_id', school_id)
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get the pending membership
    const { data: pendingMembership } = await supabase
      .from('school_memberships')
      .select('*')
      .eq('id', approval_id)
      .eq('school_id', school_id)
      .eq('status', 'PENDING')
      .single()

    if (!pendingMembership) {
      return NextResponse.json({ error: 'So\'rov topilmadi' }, { status: 404 })
    }

    if (action === 'approve') {
      // Approve membership
      const { error } = await supabase
        .from('school_memberships')
        .update({
          status: 'APPROVED',
          approved_at: new Date().toISOString(),
          approved_by: user.id,
        })
        .eq('id', approval_id)

      if (error) throw error

      // Create teacher profile
      await supabase
        .from('teacher_profiles')
        .upsert({
          profile_id: pendingMembership.profile_id,
          is_active: true,
        }, { onConflict: 'profile_id' })

      // Audit
      await supabase.from('audit_logs').insert({
        actor_profile_id: user.id,
        school_id,
        action: 'APPROVE_TEACHER',
        entity_type: 'school_membership',
        entity_id: approval_id,
        old_values: { status: 'PENDING' },
        new_values: { status: 'APPROVED', approved_by: user.id, admin_notes },
      })

      // Notify teacher
      await supabase.from('notifications').insert({
        recipient_profile_id: pendingMembership.profile_id,
        school_id,
        type: 'IN_APP',
        title: 'A\'zolik tasdiqlandi',
        body: `Sizning ${pendingMembership.schools?.name || 'maktab'} a'zolik so'rovingiz tasdiqlandi. Endi davomat tizimidan foydalana olasiz.`,
        related_entity_type: 'membership',
        related_entity_id: approval_id,
      })

      // Try Telegram notification
      const { data: tgAccount } = await supabase
        .from('telegram_accounts')
        .select('telegram_user_id')
        .eq('profile_id', pendingMembership.profile_id)
        .single()

      if (tgAccount) {
        await sendTelegramNotification(tgAccount.telegram_user_id,
          '✅ <b>A\'zolik tasdiqlandi</b>\n\n' +
          `Sizning <b>${pendingMembership.schools?.name || 'maktab'}</b> a'zolik so'rovingiz tasdiqlandi. ` +
          'Endi davomat tizimidan foydalana olasiz.\n\n' +
          '📱 <a href="https://t.me/YourBotName/your-miniapp">Mini App\'ni ochish</a>'
        )
      }

    } else if (action === 'reject') {
      if (!rejection_reason) {
        return NextResponse.json({ error: 'Rad etish sababi shart' }, { status: 400 })
      }

      // Reject membership
      const { error } = await supabase
        .from('school_memberships')
        .update({
          status: 'REJECTED',
          rejected_at: new Date().toISOString(),
          rejected_by: user.id,
          rejection_reason: rejection_reason.trim(),
        })
        .eq('id', approval_id)

      if (error) throw error

      // Audit
      await supabase.from('audit_logs').insert({
        actor_profile_id: user.id,
        school_id,
        action: 'REJECT_TEACHER',
        entity_type: 'school_membership',
        entity_id: approval_id,
        old_values: { status: 'PENDING' },
        new_values: { status: 'REJECTED', rejected_by: user.id, rejection_reason: rejection_reason.trim() },
      })

      // Notify teacher
      await supabase.from('notifications').insert({
        recipient_profile_id: pendingMembership.profile_id,
        school_id,
        type: 'IN_APP',
        title: 'A\'zolik rad etildi',
        body: `Sizning ${pendingMembership.schools?.name || 'maktab'} a'zolik so'rovingiz rad etildi. Sabab: ${rejection_reason.trim()}`,
        related_entity_type: 'membership',
        related_entity_id: approval_id,
      })

      // Try Telegram notification
      const { data: tgAccount } = await supabase
        .from('telegram_accounts')
        .select('telegram_user_id')
        .eq('profile_id', pendingMembership.profile_id)
        .single()

      if (tgAccount) {
        await sendTelegramNotification(tgAccount.telegram_user_id,
          '❌ <b>A\'zolik rad etildi</b>\n\n' +
          `Sizning <b>${pendingMembership.schools?.name || 'maktab'}</b> a'zolik so'rovingiz rad etildi.\n` +
          `Sabab: ${rejection_reason.trim()}\n\n` +
          'Batafsil ma\'lumot uchun maktab administratori bilan bog\'laning.'
        )
      }
    }

    return NextResponse.json({ success: true, message: action === 'approve' ? 'Ustoz tasdiqlandi' : 'Ustoz rad etildi' })
  } catch (error: any) {
    console.error('Teacher approval error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function sendTelegramNotification(chatId: number, text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
  } catch (error) {
    console.error('Failed to send Telegram notification:', error)
  }
}