import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!

function verifyWebhookSecret(request: NextRequest): boolean {
  const secretHeader = request.headers.get('x-telegram-bot-api-secret-token')
  return secretHeader === WEBHOOK_SECRET
}

function verifyInitData(initData: string): boolean {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  params.delete('hash')

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  return calculatedHash === hash
}

export async function POST(request: NextRequest) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 })
  }

  const body = await request.json()
  const supabase = createClient()

  try {
    // Handle different update types
    if (body.message) {
      await handleMessage(body.message, supabase)
    } else if (body.callback_query) {
      await handleCallbackQuery(body.callback_query, supabase)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleMessage(message: any, supabase: any) {
  const chatId = message.chat.id
  const text = message.text
  const from = message.from

  // Find or create telegram account
  let { data: tgAccount } = await supabase
    .from('telegram_accounts')
    .select('*, profiles(*)')
    .eq('telegram_user_id', from.id)
    .single()

  if (!tgAccount) {
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
    await sendStartMessage(chatId, tgAccount, supabase)
    return
  }

  // Handle other commands
  if (text?.startsWith('/')) {
    await handleCommand(text, chatId, tgAccount, supabase)
  }
}

async function handleCallbackQuery(callbackQuery: any, supabase: any) {
  const chatId = callbackQuery.message.chat.id
  const data = callbackQuery.data
  const from = callbackQuery.from

  // Answer callback query
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQuery.id }),
  })

  // Handle callback data
  if (data.startsWith('school_request_')) {
    const schoolId = data.replace('school_request_', '')
    await handleSchoolRequest(chatId, from.id, schoolId, supabase)
  }
}

async function sendStartMessage(chatId: number, tgAccount: any, supabase: any) {
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

async function handleCommand(command: string, chatId: number, tgAccount: any, supabase: any) {
  if (command === '/help') {
    await sendMessage(chatId, 'Yordam: /start - bosh menyu, /profile - profil, /schools - maktablar')
  }
}

async function handleSchoolRequest(chatId: number, telegramUserId: number, schoolId: string, supabase: any) {
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

  // Create membership request
  await supabase
    .from('school_memberships')
    .insert({
      school_id: schoolId,
      profile_id: tgAccount.profile_id,
      membership_role: 'TEACHER',
      status: 'PENDING',
    })

  await sendMessage(chatId, '✅ A\'zolik so\'rovingiz yuborildi. Maktab admini tasdiqlaguncha kuting.')
}

async function sendMessage(chatId: number, text: string) {
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
}