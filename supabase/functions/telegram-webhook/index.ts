import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import crypto from 'https://deno.land/std@0.168.0/crypto/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token',
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

interface TelegramMessage {
  message_id: number
  from: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
  entities?: any[]
}

interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

interface TelegramChat {
  id: number
  type: string
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  data?: string
}

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function verifyWebhookSecret(request: Request): boolean {
  const secretHeader = request.headers.get('x-telegram-bot-api-secret-token')
  return secretHeader === WEBHOOK_SECRET
}

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

async function sendMessage(chatId: number, text: string, options: any = {}) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options,
    }),
  })
}

async function answerCallbackQuery(callbackQueryId: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  })
}

async function handleMessage(message: TelegramMessage) {
  const chatId = message.chat.id
  const text = message.text
  const from = message.from

  // Find or create telegram account
  let { data: tgAccount, error } = await supabase
    .from('telegram_accounts')
    .select('*, profiles(*)')
    .eq('telegram_user_id', from.id)
    .single()

  if (error || !tgAccount) {
    // Create new telegram account
    const { data: newTgAccount } = await supabase
      .from('telegram_accounts')
      .insert({
        telegram_user_id: from.id,
        username: from.username,
        first_name: from.first_name,
        last_name: from.last_name,
        linking_status: 'UNLINKED',
      })
      .select()
      .single()
    tgAccount = newTgAccount
  }

  // Handle /start command
  if (text === '/start') {
    await sendStartMessage(chatId, tgAccount)
    return
  }

  // Handle other commands
  if (text?.startsWith('/')) {
    await handleCommand(text, chatId, tgAccount)
  }
}

async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery) {
  const chatId = callbackQuery.message?.chat.id
  const data = callbackQuery.data
  const from = callbackQuery.from

  // Answer callback query
  await answerCallbackQuery(callbackQuery.id)

  if (!chatId || !data) return

  // Handle callback data
  if (data.startsWith('school_request_')) {
    const schoolId = data.replace('school_request_', '')
    await handleSchoolRequest(chatId, from.id, schoolId)
  }
}

async function sendStartMessage(chatId: number, tgAccount: any) {
  let message = '👋 <b>MaktabDavomat ga xush kelibsiz!</b>\n\n'
  message += 'Bu bot ustozlarning dars davomatini boshqarish uchun mo\'ljallangan.\n\n'

  if (tgAccount.profile_id) {
    // Check memberships
    const { data: memberships } = await supabase
      .from('school_memberships')
      .select('*, schools(*)')
      .eq('profile_id', tgAccount.profile_id)

    const approvedMemberships = memberships?.filter(m => m.status === 'APPROVED') || []
    const pendingMemberships = memberships?.filter(m => m.status === 'PENDING') || []

    if (approvedMemberships.length > 0) {
      message += '✅ Siz tasdiqlangan maktablarda:\n'
      approvedMemberships.forEach((m: any) => {
        message += `• ${m.schools?.name} (${m.membership_role})\n`
      })
      message += '\n📱 <a href="https://t.me/YourBotName/your-miniapp">Mini App\'ni ochish</a>\n'
    } else if (pendingMemberships.length > 0) {
      message += '⏳ Sizning so\'rovlaringiz ko\'rib chiqilmoqda:\n'
      pendingMemberships.forEach((m: any) => {
        message += `• ${m.schools?.name}\n`
      })
    } else {
      message += '📝 Siz hali hech qanday maktabga a\'zo emassiz.\n'
      message += 'Maktab tanlash uchun Mini App\'ni oching.\n\n'
      message += '📱 <a href="https://t.me/YourBotName/your-miniapp">Mini App\'ni ochish</a>'
    }
  } else {
    message += '🔗 Avval hisobingizni bog\'lang.\n'
    message += '📱 <a href="https://t.me/YourBotName/your-miniapp">Mini App\'ni ochish</a>'
  }

  await sendMessage(chatId, message)
}

async function handleCommand(command: string, chatId: number, tgAccount: any) {
  if (command === '/help') {
    await sendMessage(chatId, 'Yordam: /start - bosh menyu, /profile - profil, /schools - maktablar')
  } else if (command === '/profile') {
    if (tgAccount.profile_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone, email')
        .eq('id', tgAccount.profile_id)
        .single()

      let msg = '👤 <b>Profil ma\'lumotlari</b>\n\n'
      msg += `Ism: ${profile?.full_name}\n`
      msg += `Telefon: ${profile?.phone || 'Yo\'q'}\n`
      msg += `Email: ${profile?.email || 'Yo\'q'}\n`
      msg += `Telegram ID: ${tgAccount.telegram_user_id}`

      await sendMessage(chatId, msg)
    } else {
      await sendMessage(chatId, 'Sizning profilingiz hali bog\'lanmagan.')
    }
  }
}

async function handleSchoolRequest(chatId: number, telegramUserId: number, schoolId: string) {
  // Get telegram account
  const { data: tgAccount } = await supabase
    .from('telegram_accounts')
    .select('profile_id')
    .eq('telegram_user_id', telegramUserId)
    .single()

  if (!tgAccount?.profile_id) {
    await sendMessage(chatId, '❌ Avval profilingizni bog\'lang.')
    return
  }

  // Check if already has membership
  const { data: existing } = await supabase
    .from('school_memberships')
    .select('*')
    .eq('school_id', schoolId)
    .eq('profile_id', tgAccount.profile_id)
    .single()

  if (existing) {
    await sendMessage(chatId, `ℹ️ Siz allaqachon bu maktabda ${existing.status} holidasiz.`)
    return
  }

  // Get school name
  const { data: school } = await supabase
    .from('schools')
    .select('name')
    .eq('id', schoolId)
    .single()

  // Create membership request
  await supabase
    .from('school_memberships')
    .insert({
      school_id: schoolId,
      profile_id: tgAccount.profile_id,
      membership_role: 'TEACHER',
      status: 'PENDING',
    })

  await sendMessage(chatId, `✅ <b>${school?.name}</b> maktabiga a'zolik so'rovingiz yuborildi. Maktab admini tasdiqlaguncha kuting.`)
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Verify webhook secret
  if (!verifyWebhookSecret(req)) {
    return new Response(JSON.stringify({ error: 'Invalid webhook secret' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body: TelegramUpdate = await req.json()

    if (body.message) {
      await handleMessage(body.message)
    } else if (body.callback_query) {
      await handleCallbackQuery(body.callback_query)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})