# VAT Management System (VAT Portal)

A centralized management platform for **Vacation Adolescent Training (VAT)** — a two-week
annual program held every August across centers in Nigeria.

Built with **Next.js 15 + TypeScript + Tailwind CSS + Supabase (PostgreSQL, Auth, RLS)**,
deployable on **Vercel**.

---

## What is included

| Area | Highlights |
|---|---|
| Authentication | Supabase Auth; worker & foster-parent accounts provisioned by the media team; secure System Manager bootstrap |
| Roles | System Manager, General Principal, Center Principal, Media, Form Teacher, Subject Teacher, GDC Teacher, PDR Parent, Foster Parent — all enforced by **Row Level Security**, not just the UI |
| Centers | Database-driven center list (7 official centers seeded); centers created dynamically — no code changes needed |
| Sessions | Annual VAT sessions (2026, 2027, …) with configurable activation dates and automatic activation |
| Students | New & existing-student registration, permanent identity vs. per-year registration, configurable registration-number format, automatic promotion (JS1→…→SS3→Alumni), spiritual/vocational submission records |
| Workers | Directory, multi-responsibility assignment ("Assign Tasks"), reassignment with preserved history |
| Academics | English / Mathematics / configurable Language; First CA 20, Second CA 20, Exam 60; automatic totals, validation, audit-trail on edits, result approval |
| Attendance | Daily marking & review, per-class submissions, noon deadline warnings (12:00 WAT via pg_cron), principal dashboards |
| GDC / PDR | GDC groups & attendance; confidential PDR notes in a **separate table** readable only by the assigned parent; conclusions surfaced for printing only |
| Foster parents | Home roster, student search-and-link, center isolation |
| Results | 12-element official result sheet, print preview, batch printing, A4 print stylesheet, no fabricated grading bands |
| UI/UX | Apple-inspired glassmorphism, full light/dark mode with persistence, mobile-first responsive layouts, reduced-motion support |

---

## Quick start

### 1. Create the database (Supabase)

Open your Supabase project → **SQL Editor** and run the migration files
**in this exact order** (each file is safe to verify individually):

| Order | File | What it does |
|---|---|---|
| 1 | `supabase/migrations/0001_schema.sql` | Tables, keys, constraints, indexes, triggers |
| 2 | `supabase/migrations/0002_rls.sql` | RLS enabled on every table + role-aware policies |
| 3 | `supabase/migrations/0003_functions_cron.sql` | Bootstrap, promotion, deadline jobs (pg_cron at 11:00 UTC = 12:00 WAT) |
| 4 | `supabase/migrations/0004_seed.sql` | 7 official centers, classes, subjects, VAT 2026, default config |

**How to verify success:** after each file, the SQL Editor should report
`Success. No rows returned` (the seed reports inserted rows once). Then run:

```sql
select count(*) from centers;            -- expect 7
select count(*) from school_classes;     -- expect 6
select key from system_config;           -- expect 6 rows
select jobname, active from cron.job;    -- expect 2 active jobs
```

If a file errors: fix nothing blindly — re-run the file; every statement is
idempotent (`if not exists` / `on conflict do nothing`). If pg_cron is unavailable
on your plan, the deadline logic still runs via the Vercel cron route (below).

### 2. Bootstrap the System Manager (you)

1. Supabase Dashboard → **Authentication → Users → Add user** —
   create your account with your email and a strong password (never share it).
2. Back in the **SQL Editor**, run exactly once:

   ```sql
   select public.bootstrap_system_manager('your-email@example.com');
   ```

   It refuses to run if a System Manager already exists.

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where it's used | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Everywhere | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Everywhere | Public (publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** (account provisioning) | 🔴 Secret — never in the browser or git |
| `CRON_SECRET` | Vercel cron route | 🔴 Secret |

### 4. Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

### 5. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. Vercel → **New Project** → import the repo (Next.js is auto-detected).
3. Add the four environment variables above under **Settings → Environment Variables**.
4. Deploy. The `vercel.json` already registers the daily noon (WAT) attendance-deadline cron.

---

## Center One & headquarters

`centers.is_headquarters` and `centers.is_center_one` are **independent flags**.
Kaduna Headquarters is seeded as headquarters but **not** as Center One — the
System Manager decides Center One from the Center management screen.

## Configurable (not hardcoded) — owner input needed

- **Registration-number format** — `system_config.registration_number_format`
  (default placeholder `VAT/{year}/{pdr}/{gdc}/{serial}`).
- **Grading scale** — no invented bands; set the official scheme in
  `system_config.grading_scale` when supplied.
- **Language subject name** — `centers.language_subject` per center (Igbo/Yoruba/Hausa…).
- **Media center-creation permission** — `system_config.media_can_create_centers`.
- **Attendance deadline** — `system_config.attendance_deadline_wat` (default 12:00 WAT).

## Testing report (what was actually run)

- `tsc --noEmit` — type check **passed** (see TESTING.md for the log summary).
- `next build` — production build **passed**.
- `vitest` — unit tests for score validation, attendance rate, promotion rules,
  registration-number formatting, PDR identifier rules, credential derivation.
- What could **not** be tested here: live Supabase connection (no project
  credentials in this environment) and Vercel deployment. Run the SQL order
  above and the workflows in TESTING.md on your project.

## Security notes

- RLS is enabled on **all** tables; default posture is deny.
- PDR notes live in `pdr_notes` with policies limited to the assigned PDR parent;
  media users can only read the final conclusion through a security-definer RPC
  (`get_pdr_conclusion_for_result`) used solely for result printing.
- The service-role key is imported only from a `server-only` module.
- Users cannot change their own role/center (`profiles_update_self_limited`).
- Duplicate student registration (same student + session) and duplicate
  attendance/scores are blocked by database constraints.
