# Testing Report — VAT Management System

## Checks actually executed (2026-10-15, sandbox)

| Check | Command | Result |
|---|---|---|
| Dependency install | `npm install` | Passed (410 packages; Next.js upgraded to patched release after CVE advisory) |
| Type check | `npx tsc --noEmit` | Passed (0 errors — 17 errors found on first run and fixed) |
| Unit tests | `npx vitest run` | Passed (13/13) |
| Lint | `npx next lint` | Passed (no findings; Next 16 deprecation notice re: `middleware` → `proxy` convention noted, still supported) |
| Production build | `npx next build` | Passed — routes: `/`, `/login`, `/dashboard`, `/dashboard/results`, `/api/cron/attendance-deadline`, `/auth/callback` |

## Unit test coverage (src/lib/logic.test.ts)
- Score validation: CA max 20, exam max 60, negatives/non-numeric rejected
- Score totals (20/20/60)
- Attendance rate incl. divide-by-zero
- Promotion: JS1→JS2 … SS2→SS3; SS3 → ALUMNI (never into another class)
- Registration-number builder honors configurable format (no hardcoded format)
- PDR identifier rules: male single letter, female double letter
- Credential derivation (phone → sign-in email)

## Not executable in this environment (requires your credentials)
- Live Supabase SQL execution — run migrations 0001→0004 yourself (see README §Quick start)
- Live auth/RLS verification against your project — after setup, use the workflow
  checklist below with test accounts
- Vercel deployment

## Post-setup manual workflow checklist (30 items from the master spec)
1. Verify 7 seeded centers (Kaduna Headquarters, Nnewi, Aguata, Onitsha, Nudes, Zaria, Manchok)
2. Add a test center → confirm it appears in selectors; edit it; duplicate its code → expect error
3. Register new student → appears in class directory
4. Register existing student for new session → no duplicate identity
5. Create VAT 2027 → promote → students move up one class; SS3 → alumni; run twice → refused (idempotent)
6. Register worker (+account) → credentials shown once; sign in as worker
7. Assign multiple responsibilities → visible on worker dashboard
8. Unassign/reassign → history preserved, authorship not transferred
9. Assign subject teachers → enter First CA / Second CA / Exam → totals computed
10. Approve result → print preview; batch print (approved only)
11. Form teacher marks attendance → principal dashboard counts update; corrections recalc
12. Leave a class unsubmitted past noon → warning flagged (pg_cron 11:00 UTC / Vercel cron) → submits → clears
13. Create GDC groups → assign teacher + students → GDC attendance
14. Create PDR groups (male A…, female AA…) → assign parent → save confidential notes
15. Verify an ordinary worker/teacher CANNOT read pdr_notes (RLS) — attempt via table editor as that role
16. Register foster parent (+account) → sign in → search student → link to home; verify other homes invisible
17. Upload memory verse → visible on the class form-teacher dashboard
18. Send notification → recipient bell shows it; unread badge; mark read
19. Light/dark toggle on every dashboard; reload → preference persists
20. Phone (375px), tablet, desktop layouts — no horizontal page overflow
