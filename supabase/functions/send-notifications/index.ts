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
    const { notification_ids } = await req.json()

    if (!notification_ids || !Array.isArray(notification_ids)) {
      return new Response(JSON.stringify({ error: 'notification_ids array required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get pending Telegram notifications
    const { data: notifications } = await supabase
      .from('notifications')
      .select(`
        *,
        recipient:profiles!recipient_profile_id(full_name, phone),
        telegram_accounts!inner(telegram_user_id)
      `)
      .in('id', notification_ids)
      .eq('type', 'TELEGRAM')
      .eq('telegram_delivery_status', 'PENDING')

    if (!notifications || notifications.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let sentCount = 0
    let failedCount = 0

    for (const notification of notifications) {
      const telegramUserId = notification.telegram_accounts?.[0]?.telegram_user_id

      if (!telegramUserId) {
        await supabase
          .from('notifications')
          .update({
            telegram_delivery_status: 'FAILED',
            telegram_error: 'Telegram user ID not found',
            telegram_sent_at: new Date().toISOString(),
          })
          .eq('id', notification.id)
        failedCount++
        continue
      }

      try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramUserId,
            text: `<b>${notification.title}</b>\n\n${notification.body}`,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        })

        await supabase
          .from('notifications')
          .update({
            telegram_delivery_status: 'SENT',
            telegram_sent_at: new Date().toISOString(),
          })
          .eq('id', notification.id)

        sentCount++
      } catch (error) {
        await supabase
          .from('notifications')
          .update({
            telegram_delivery_status: 'FAILED',
            telegram_error: error.message,
            telegram_sent_at: new Date().toISOString(),
          })
          .eq('id', notification.id)
        failedCount++
      }
    }

    return new Response(JSON.stringify({
      success: true,
      sent: sentCount,
      failed: failedCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Send notifications error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})