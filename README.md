# MaktabDavomat - Ko'p maktabli ustoz CRM va davomat tizimi

Bu loyiha ko'p maktablarda ishlaydigan ustozlar davomat tizimi va CRM platformasidir.

## 🏗️ Arxitektura

### Texnologiyalar
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, RLS, Storage, Realtime, Edge Functions, Cron)
- **Telegram**: Bot API (Webhook) + Mini App
- **Deploy**: Vercel (Frontend), Supabase (Backend)

### Tizim komponentlari
```
┌─────────────────────────────────────────────────────────────┐
│                      Vercel (Next.js)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Admin Web   │  │  Mini App    │  │   API Routes     │  │
│  │  (Dashboard) │  │  (Teacher)   │  │  (Telegram webhook)│
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Supabase                                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────┐ │
│  │   Auth  │ │PostgreSQL│ │ Storage │ │Realtime │ │ Cron  │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └───────┘ │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Edge Functions                        ││
│  │  Telegram Webhook │ MiniApp Session │ Attendance Checkin ││
│  │  Process Missing  │ Generate Report │ Send Notifications ││
│  │  Approve Member   │ Schedule Import │                    ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## 🗄️ Ma'lumotlar bazasi sxemasi

### Asosiy jadvallar
- `schools` - Maktablar
- `profiles` - Foydalanuvchi profillari (Supabase Auth bilan bog'langan)
- `teacher_profiles` - Ustozga xos ma'lumotlar
- `telegram_accounts` - Telegram hisoblari
- `school_memberships` - Maktab a'zoliklari (ko'p maktab qo'llab-quvvatlanadi)
- `school_staff_roles` - Admin/Zavuch vakolatlari
- `subjects` - Fanlar
- `classes` - Sinflar
- `rooms` - Xonalar
- `lessons` - Dars jadvali (haftalik)
- `lesson_occurrences` - Konkret dars vaziyatlari (sana bo'yicha)
- `class_qr_codes` - Sinf QR kodlari (xavfsiz token bilan)
- `attendance_records` - Davomat yozuvlari
- `security_events` - Xavfsizlik hodisalari
- `notifications` - Bildirishnomalar
- `documents` - Hujjatlar/Hisobotlar
- `audit_logs` - Audit loglari (o'chirib bo'lmaydi)
- `school_settings` - Maktab sozlamalari

### RLS (Row Level Security)
Barcha jadvallar uchun RLS yoqilgan. Foydalanuvchi faqat o'ziga tegishli ma'lumotlarni ko'rishi mumkin:
- **SUPER_ADMIN**: Barcha maktablar va ma'lumotlar
- **SCHOOL_ADMIN**: O'z maktab(lar)i
- **ZAVUCH**: Vakolat berilgan maktab(lar)
- **TEACHER**: Faqat o'z davomat va profil ma'lumotlari

## 🚀 O'rnatish va ishga tushirish

### 1. Supabase loyihasini yaratish
1. [Supabase Dashboard](https://supabase.com/dashboard) da yangi loyiha yarating
2. SQL Editor da `supabase/migrations` papkasidagi barcha migratsiyalarni ketma-ket ishga tushiring
3. Storage da `documents` bucket yarating (private)
4. Edge Functions ni deploy qiling:
   ```bash
   supabase functions deploy telegram-webhook
   supabase functions deploy miniapp-session
   supabase functions deploy attendance-checkin
   supabase functions deploy process-missing-attendance
   supabase functions deploy generate-report
   supabase functions deploy send-notifications
   supabase functions deploy approve-membership
   supabase functions deploy schedule-import
   ```

### 2. Telegram Bot sozlash
1. @BotFather da yangi bot yarating
2. Bot token ni oling
3. Webhook URL ni sozlang:
   ```
   https://your-project.supabase.co/functions/v1/telegram-webhook
   ```
4. Secret token generatsiya qiling va webhook ga qo'shing
5. Mini App URL ni sozlang (Vercel deploy dan keyin)

### 3. Muhit o'zgaruvchilari (.env.local)
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_WEBHOOK_SECRET=your_webhook_secret
TELEGRAM_BOT_USERNAME=your_bot_username

# Mini App
NEXT_PUBLIC_TELEGRAM_MINI_APP_URL=https://your-domain.com/miniapp
```

### 4. Loyihani ishga tushirish
```bash
# Dependencies o'rnatish
npm install

# Development server
npm run dev

# Production build
npm run build
npm start
```

### 5. Vercel ga deploy qilish
1. Vercel da yangi loyiha yarating
2. GitHub repository ni ulang
3. Environment variables ni qo'shing
4. Deploy qiling

### 6. Supabase Cron sozlash (pg_cron)
```sql
-- Har 5 daqiqada bir "kelmagan" davomatni tekshirish
SELECT cron.schedule('process-missing-attendance', '*/5 * * * *', 
  'SELECT net.http_post(
    url := ''https://your-project.supabase.co/functions/v1/process-missing-attendance'',
    headers := jsonb_build_object(''Authorization'', ''Bearer '' || current_setting(''supabase.service_role_key'')),
    body := ''{}''::jsonb
  )');
```

## 📱 Foydalanish

### Admin Web (Super Admin, School Admin, Zavuch)
- `/admin/dashboard` - Bosh sahifa
- `/admin/schools` - Maktablar boshqaruvi
- `/admin/teachers` - Ustozlar CRM
- `/admin/teacher-approvals` - Ustoz tasdiqlash
- `/admin/schedule` - Dars jadvali (Excel import)
- `/admin/qr-codes` - QR kodlar
- `/admin/attendance` - Davomat monitoring
- `/admin/live-monitoring` - Jonli kuzatuv (Realtime)
- `/admin/security` - Xavfsizlik hodisalari
- `/admin/reports` - Hisobotlar generatsiya
- `/admin/documents` - Hujjatlar arxivi
- `/admin/settings` - Maktab sozlamalari

### Telegram Mini App (Ustoz)
1. Bot ni oching (`/start`)
2. "Mini App ochish" tugmasini bosing
3. Agar ro'yxatdan o'tmagan bo'lsa - ro'yxatdan o'ting
4. Maktab tanlang, a'zolik so'rovi yuboring
5. Tasdiqlangach - bugungi darslarni ko'ring
6. Dars kartasidan "QR skaner" bosing
7. Sinf QR kodini skanerlang + GPS ruxsat bering
8. Davomat belgilanadi ✅

## 🔐 Xavfsizlik

### GPS spoofing himoyasi
- Server-side masofa hisobi (Haversine formula)
- Geofence radius (default 200m, sozlanishi mumkin)
- GPS aniqlik tekshiruvi (default 50m, sozlanishi mumkin)
- Vaqt oynasi tekshiruvi (darsdan 5 min oldin - dars tugagacha)
- QR token hash saqlash (SHA-256 + salt)
- Request ID bilan idempotency
- Xavfsizlik hodisalari loglanishi

### Ma'lumotlar xavfsizligi
- `service_role` key faqat Edge Functions da
- Frontend da faqat `anon` key (RLS bilan himoyalangan)
- Telegram `initData` HMAC-SHA-256 tekshiruvi
- Webhook secret token tekshiruvi
- Audit loglari o'chirib bo'lmaydi

## 📊 Hisobot turlari
- **Davomat hisoboti** - Keldi/Kechikdi/Kelmadi statistikasi
- **Batafsil davomat** - Har bir ustoz/dars uchun
- **Kechikish hisoboti** - Kechikish minutlari bilan
- **Kelmaganlar hisoboti** - Avtomatik "MISSING"lar
- **Ish yuklamasi** - Ustoz haftalik/oylik soatlari
- **Dars jadvali** - Haftalik/oylik jadval
- **Xavfsizlik hodisalari** - Barcha xavfsizlik buzilishlari

## 🧪 Testlar
```bash
# Unit/Integration testlar
npm run test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## 📁 Loyiha tuzilishi
```
maktabdavomat/
├── src/
│   ├── app/
│   │   ├── admin/           # Admin panel sahifalari
│   │   ├── miniapp/         # Telegram Mini App
│   │   ├── api/             # API routes
│   │   ├── login/           # Login sahifasi
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/              # UI komponentlar
│   │   ├── admin/           # Admin komponentlar
│   │   └── teacher/         # Ustoz komponentlar
│   ├── lib/
│   │   └── supabase/        # Supabase clientlar
│   ├── types/               # TypeScript tiplar
│   ├── utils/               # Utility funksiyalar
│   └── hooks/               # Custom React hooks
├── supabase/
│   ├── functions/           # Edge Functions
│   └── migrations/          # SQL migratsiyalar
├── public/
└── package.json
```

## 📝 Muhim eslatmalar

1. **GPS spoofing to'liq oldin olinmaydi** - Browser GPS API dan foydalangan holda, server-side validatsiya bilan himoyalanadi
2. **Telegram bot token** - Faqat Supabase Edge Functions secrets da saqlanadi, frontendga chiqmaydi
3. **RLS policies** - Barcha ma'lumotlar bazasi jadvallarda yoqilgan
4. **Cron jobs** - Supabase pg_cron orqali ishga tushiriladi (Vercel Cron emas)
5. **Storage** - Barcha hujjatlar private bucket da, signed URL orqali yuklab olinadi

## 📞 Aloqa
Savollar bo'lsa: GitHub Issues yoki Telegram: @your_username

---

**MaktabDavomat** - Zamonaviy, xavfsiz va qulay maktab boshqaruv tizimi 🏫✨