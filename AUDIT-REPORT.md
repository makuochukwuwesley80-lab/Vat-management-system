# VAT Management System — Project Audit Report
Date: 15 October 2026

## 1. What was already working

- Next.js App Router + TypeScript + Tailwind foundation
- Supabase Auth with SSR cookie handling
- Complete database schema (centers, profiles, workers, students, registrations, attendance, scores, PDR, GDC, foster links, notifications, audit logs)
- Row Level Security policies with role helper functions
- Seven official centres seeded correctly (Kaduna Headquarters is headquarters but NOT auto Center One)
- Role routing: System Manager, General Principal, Center Principal, Media, Worker, Foster Parent
- Worker dashboard correctly surfaces Form Teacher / Subject Teacher / GDC Teacher / PDR Parent based on assignments
- Media and System Manager dashboards with substantial functionality
- Theme toggle (light/dark), frosted-glass UI, custom VAT icon
- Vercel cron configuration for noon WAT attendance check
- Bootstrap System Manager function
- Server-only admin client for privileged account creation
- `.env.example` documents all required variables

## 2. What was broken / incomplete

| Issue | Severity | Status after this pass |
|-------|----------|------------------------|
| Cron route used anon client → blocked by RLS when writing warnings | High | **Fixed** — now uses service-role client and calls `process_attendance_deadline()` |
| Dashboard page had unreachable `if (!profile)` after `requireProfile()` | Low | **Fixed** |
| Middleware did not adjust `secure` cookie flag for localhost HTTP | Medium (caused redirect loops in local testing) | **Fixed** |
| Login used hard `window.location.href` | Low | **Improved** — uses `router.refresh()` + `router.push()` |
| Granular teacher roles are not separate `system_role` values | Design | Acceptable — handled via `worker` + `worker_assignments` + responsibilities |
| Full end-to-end live Supabase + Vercel testing | — | Requires owner’s live project (cannot be completed here) |

## 3. What remains for the owner

1. Run the four SQL migrations in order on your Supabase project.
2. Create the first auth user in Supabase Dashboard and call `bootstrap_system_manager(...)`.
3. Set the four environment variables in Vercel.
4. Deploy and test login on the phone.
5. Confirm official values for: registration-number format, grading scale, Center One designation, language subject per centre.

## 4. Security notes

- Service-role key is only imported via `server-only` module — never exposed to the browser.
- Cron endpoint requires `Authorization: Bearer <CRON_SECRET>`.
- RLS policies use security-definer helpers (`current_system_role`, `current_center_id`, etc.).
- PDR notes are restricted by policy; WorkerDashboard UI also states confidentiality.
- Direct SQL inserts into `auth.users` are discouraged (token/schema issues). Use Dashboard UI or app forms that call `auth.admin.createUser`.

## 5. Files changed in this correction pass

- `src/app/api/cron/attendance-deadline/route.ts` — admin client + RPC
- `src/app/dashboard/page.tsx` — clean role switch
- `src/middleware.ts` — localhost-safe cookies
- `src/app/login/page.tsx` — proper session refresh
- `SETUP-ANDROID.md` — new phone-only guide
- `AUDIT-REPORT.md` — this file

## 6. Recommended verification after deploy

- [ ] System Manager can log in and see all 7 centres
- [ ] Create a Media user from the System Manager / Media UI
- [ ] Media can register a Center Principal for one centre
- [ ] Center Principal cannot see another centre’s students
- [ ] Form Teacher can mark attendance for assigned class only
- [ ] PDR Parent sees only assigned students; notes stay private
- [ ] Foster Parent sees only linked students
- [ ] After noon WAT (or manual cron trigger with secret), outstanding attendance is flagged
