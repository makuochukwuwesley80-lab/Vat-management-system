# VAT Management System — Setup Guide (Android Phone Only)

You only need a Samsung Galaxy A16 (or any Android phone) and a mobile browser.
No computer or PowerShell is required.

---

## 1. Supabase Database (do this first)

1. Open Chrome on your phone → go to https://supabase.com and sign in.
2. Open your project.
3. Tap the left menu → **SQL Editor**.
4. Run the four migration files **in this exact order**.
   Copy each file from the project folder `supabase/migrations/` and paste into the SQL Editor, then tap **Run**.

| Order | File | What it does |
|-------|------|--------------|
| 1 | `0001_schema.sql` | Creates all tables, indexes, triggers |
| 2 | `0002_rls.sql` | Turns on Row Level Security and role policies |
| 3 | `0003_functions_cron.sql` | Attendance deadline function + optional pg_cron |
| 4 | `0004_seed.sql` | Inserts the 7 official centres and defaults |

After each file you should see **Success. No rows returned** (seed may show inserted rows).

Quick verification (run in SQL Editor):

```sql
select count(*) from centers;          -- expect 7
select name from centers order by display_order;
select key from system_config;
```

---

## 2. Create the first System Manager

1. Supabase → **Authentication** → **Users** → **Add user** → **Create user**.
2. Enter your email + a strong password.
3. Toggle **Auto Confirm User** ON.
4. Tap Create.
5. Go back to **SQL Editor** and run **once**:

```sql
select public.bootstrap_system_manager('your-email@example.com');
```

Replace with the exact email you just created.
The function refuses to run if a System Manager already exists.

---

## 3. Deploy with GitHub + Vercel (all from the phone browser)

### A. Put the project on GitHub
1. Go to https://github.com on your phone and sign in.
2. Create a new repository (e.g. `vat-management-system`).
3. Upload the project files (or push from a computer if you later get one).
   Do **not** upload `.env.local` or any real secret keys.

### B. Connect to Vercel
1. Go to https://vercel.com and sign in with the same GitHub account.
2. **Add New Project** → import the repository.
3. Vercel detects Next.js automatically.

### C. Environment variables (Vercel → Project → Settings → Environment Variables)

Add these four:

| Name | Value | Notes |
|------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase → Project Settings → API | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase → Project Settings → API | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase → Project Settings → API | **Secret** — never share |
| `CRON_SECRET` | any long random string (e.g. 32+ characters) | **Secret** |

Optional:
| `NEXT_PUBLIC_SITE_URL` | your Vercel URL e.g. `https://vat-portal.vercel.app` | Used for auth redirects |

### D. Deploy
Tap Deploy. When it finishes, open the live URL on your phone.

---

## 4. First login test

1. Open the live Vercel URL.
2. You should land on the login page.
3. Sign in with the System Manager email + password you created.
4. You should enter the System Manager dashboard.

If you see a redirect loop:
- Clear site data for the Vercel domain in Chrome (Settings → Site settings → clear data).
- Try again in a private/incognito tab.

---

## 5. Creating Media / other users later

Once logged in as System Manager (or Media with permission):
- Use the in-app forms to register workers, principals, foster parents, etc.
- The app uses the service-role key on the server so the current user is **not** logged out when creating accounts.

Never insert rows directly into `auth.users` with raw SQL — it breaks tokens. Always use the Dashboard UI or the app’s registration forms.

---

## 6. Attendance automation

- Vercel Cron is already configured in `vercel.json` to hit `/api/cron/attendance-deadline` at 11:00 UTC (12:00 WAT).
- The route is protected by `CRON_SECRET`.
- It calls the database function `process_attendance_deadline()` which flags missing attendance and notifies form teachers.

---

## Official centres (seeded)

1. Kaduna Headquarters
2. Nnewi
3. Aguata
4. Onitsha
5. Nudes
6. Zaria
7. Manchok

Kaduna Headquarters is marked as headquarters but **not** automatically as Center One. The System Manager can set Center One later.

---

## Remaining decisions for the owner

- Official student registration-number format (currently configurable).
- Official grading scale (currently marked “pending”).
- Language subject per centre (already configurable).
- Which centre is officially “Center One”.
