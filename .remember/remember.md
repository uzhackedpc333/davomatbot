# Handoff

## State
MaktabDavomat project is **mostly complete** with full implementation:
- **Database**: 3 migration files (schema, RLS policies, functions) in `supabase/migrations/`
- **Admin Web**: All pages under `src/app/admin/` (dashboard, schools, teachers, approvals, classes, subjects, rooms, schedule, QR codes, attendance, live monitoring, security, documents, reports, notifications, audit logs, settings)
- **Mini App**: Telegram teacher app at `src/app/miniapp/page.tsx`
- **API Routes**: All endpoints under `src/app/api/` (auth, telegram webhook, attendance checkin, admin CRUD)
- **Edge Functions**: 8 functions in `supabase/functions/` (telegram-webhook, miniapp-session, attendance-checkin, process-missing-attendance, generate-report, send-notifications, approve-membership, schedule-import)
- **Documentation**: Complete README.md, .env.example
- **Tests**: Jest config with sample tests

## Next
1. **Deploy to Supabase**: Run migrations, deploy Edge Functions, set secrets
2. **Deploy to Vercel**: Connect repo, add env vars, deploy
3. **Configure Telegram Bot**: Set webhook URL, Mini App URL, test flow
4. **Run pg_cron**: Schedule missing attendance processor
5. **Test end-to-end**: Login, create school, approve teacher, test Mini App check-in

## Context
- **Supabase Project**: `wzqdryaldrsvhkjhgdkd` (ACTIVE_HEALTHY, ap-northeast-1)
- **All SQL migrations ready** - just need to execute via Supabase SQL Editor
- **Edge Functions** need `supabase functions deploy` + secrets set
- **Telegram Bot Token** must be set in Supabase secrets (never in frontend)
- **Mini App URL** will be Vercel domain + `/miniapp`
- **Ozbek language** used throughout UI (labels, notifications, errors)