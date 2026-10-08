import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { approval_id, school_id, action, rejection_reason, admin_id, admin_notes } = body

    if (!approval_id || !school_id || !action || !admin_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if admin has permission
    const { data: membership } = await supabase
      .from('school_memberships')
      .select('membership_role, status')
      .eq('school_id', school_id)
      .eq('profile_id', admin_id)
      .single()

    const { data: profile } = await supabase
      .from('profiles')
      .select('system_role')
      .eq('id', admin_id)
      .single()

    const isSuperAdmin = profile?.system_role === 'SUPER_ADMIN'
    const isSchoolAdmin = membership?.membership_role === 'ADMIN' && membership?.status === 'APPROVED'
    const isZavuch = membership?.membership_role === 'ZAVUCH' && membership?.status === 'APPROVED'

    if (!isSuperAdmin && !isSchoolAdmin && !isZavuch) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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
      return new Response(JSON.stringify({ error: 'So\'rov topilmadi' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'approve') {
      // Approve membership
      const { error } = await supabase
        .from('school_memberships')
        .update({
          status: 'APPROVED',
          approved_at: new Date().toISOString(),
          approved_by: admin_id,
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
        actor_profile_id: admin_id,
        school_id,
        action: 'APPROVE_TEACHER',
        entity_type: 'school_membership',
        entity_id: approval_id,
        old_values: { status: 'PENDING' },
        new_values: { status: 'APPROVED', approved_by: admin_id, admin_notes },
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
        return new Response(JSON.stringify({ error: 'Rad etish sababi shart' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Reject membership
      const { error } = await supabase
        .from('school_memberships')
        .update({
          status: 'REJECTED',
          rejected_at: new Date().toISOString(),
          rejected_by: admin_id,
          rejection_reason: rejection_reason.trim(),
        })
        .eq('id', approval_id)

      if (error) throw error

      // Audit
      await supabase.from('audit_logs').insert({
        actor_profile_id: admin_id,
        school_id,
        action: 'REJECT_TEACHER',
        entity_type: 'school_membership',
        entity_id: approval_id,
        old_values: { status: 'PENDING' },
        new_values: { status: 'REJECTED', rejected_by: admin_id, rejection_reason: rejection_reason.trim() },
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

    return new Response(JSON.stringify({
      success: true,
      message: action === 'approve' ? 'Ustoz tasdiqlandi' : 'Ustoz rad etildi'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Approve membership error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function sendTelegramNotification(chatId: number, text: string) {
  if (!BOT_TOKEN) return

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
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