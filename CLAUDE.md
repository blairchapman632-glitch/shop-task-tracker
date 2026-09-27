# CLAUDE.md — Byford Pharmacy Chalkboard

Read this at the start of every session. It is the standing context for this repo.

## What this is
Chalkboard is an internal pharmacy management PWA for Byford Pharmacy (~12 staff): roster, availability/leave, wages, tasks, messaging, locums, deliveries, QSPP library, incidents, training.
- **Owner / sole developer:** Blair (pharmacist-owner, relatively new developer). Explain things in plain English, keep reports short.
- **Live:** `chalkboard.au` (Vercel, auto-deploys from `main`). **Repo:** `blairchapman632-glitch/shop-task-tracker`.
- **Local dev:** `npm run dev` → `localhost:3000` (port shared with other projects on this machine).
- **Shell:** PowerShell — chain with `;`, never `&&`.
- **Key people:** Paige (roster manager), Arthur (external accountant — receives the fortnightly Excel wages export, uses MYOB).

## Stack
Next.js 14 (pages router), Supabase (DB, Auth, Storage), Tailwind, Vercel (hosting + cron), Node 24.
Libraries: `xlsx` (Excel), `pdf-lib` (PDFs — jsPDF is incompatible with Node 24), `web-push`.
Pharmacy ID (Byford): `81ab394f-d642-4246-b896-e71938b25671` — currently hard-coded as `PHARMACY_ID` in many pages; leave existing ones alone unless asked (they belong to the future multi-pharmacy auth pass).

Shared libs (single sources of truth — reuse, don't duplicate logic):
- `lib/wageCalc.js` — all wage calculation (desktop wages, `/me` Wages, Excel export). **Do not change its maths unless explicitly asked.**
- `lib/weekSchedule.js` — `weekAB`, `normalShiftFor` (regular schedules, Week A/B from `pharmacy_settings.payroll_start_date`)
- `lib/leaveCover.js` — locum gap detection
- `lib/leaveCalendar.js` — leave rules, `nextDayStr`, `LeaveCalendar` component
- `lib/availability.js`, `lib/qspp.js`

## How Blair works with you

### Two modes
1. **APPROVED PLAN** — if Blair's message starts with `APPROVED PLAN`, the plan has already been agreed (usually planned in a separate Claude chat). **Implement it directly without asking for permission first.** Only stop and ask if:
   - the actual code contradicts an assumption in the plan,
   - the change would alter any wage, leave or pay figures,
   - it would delete or overwrite existing data,
   - it needs a database schema change (see Database rules),
   - something in the plan is genuinely ambiguous.
2. **Anything else** — read the relevant code, explain your plan in plain English, and **wait for Blair's OK** before changing code.

### Always
- Never guess file contents — read the actual files first.
- Run `npm run build` before reporting back; fix any errors you introduced.
- When done, report briefly: what changed (files), anything surprising you found, and a short numbered list of **exactly what Blair should test** locally.
- Ask one question at a time, in plain text.
- **Never commit or push unless Blair asks.** When asked, always use exactly:
  `git add -A ; git commit -m "<message>" ; git push`
  (always `git add -A`, never individual file paths).
- If you spot an unrelated bug, mention it — don't fix it unasked.

### Database rules (Supabase)
- Read-only queries to investigate are fine.
- **Any schema change or data change** (create/alter table, update/delete rows, grants, policies): write the SQL and give it to Blair to run in the Supabase SQL editor. Don't run it yourself.
- Before any bulk data change, give Blair a backup statement first, e.g. `create table roster_shifts_backup_YYYYMMDD as select * from roster_shifts;`
- **RLS:** currently OFF on almost all tables (known; fixed later in a dedicated pass). Never batch RLS statements — one table at a time, verified individually. Any new table: note it for the multi-pharmacy RLS pass.
- Every insert into a pharmacy-scoped table must set `pharmacy_id` (nulls fail silently downstream).

### Product principles
- **Config not code:** pharmacy-specific values (hours, rules, rates, names) go in `pharmacy_settings` / Admin, not hard-coded.
- Staff-facing text must be generic — never hard-code "Paige" (say "roster manager").
- Wages terminology: "Confirm hours / Confirmed" (not "Approve").
- Locum wages are calculated manually by Arthur — never automate them.
- Don't replicate WhatsApp-style chat; never auto-generate praise.

## Technical gotchas (hard-won — follow these)
- **Staff IDs are `bigint`.** `Number()` on them is fine. **UUID columns must be compared with `String()`, never `Number()`** (returns `NaN`, fails silently).
- **`.neq()` drops null rows.** Filtering staff by role: use `.or("role.is.null,role.neq.Locum")`, not `.neq("role","Locum")`.
- **Supabase returns max 1,000 rows per request, silently.** Anything that loads an unbounded table must paginate (see `fetchAllShifts()` in `roster.js`) or filter by date range.
- **Dates / UTC+8:** never walk date ranges with `toISOString()` (off-by-one in Perth). Use string stepping (`nextDayStr`). Never hand-build month boundaries like `month + 2` — use `monthStartStr(year, monthIndex)` in `roster.js` (December rollover bug).
- **Canonical roles:** Pharmacist, Intern Pharmacist, Pharmacy Assistant, DAA Coordinator, Retail Manager, Locum. Write roles exactly as stored on the staff record.
- **Supabase embedded joins** (`staff:staff_id(...)`) need a real foreign key or they silently return empty.
- **PIN inputs:** `type="text"` with `style={{ WebkitTextSecurity: "disc" }}`, never `type="password"`.
- **Service worker:** `public/sw.js` is registered in production only; dev unregisters it. Don't let it handle `/_next/` requests.
- If the home page shows "No pharmacy linked to this account", the logged-in account has no `profiles` row — usually a staff `/me` login instead of the dashboard login.
- Vercel env var changes only take effect after a new deployment.

## Pharmacy / payroll rules
- Employment types: **Permanent, Salary, Casual** (locums are staff with role Locum). Permanent/Salary: Blair (Salary), Amanda, Jasmine, Kelly, Ashleigh. Everyone else is Casual.
- Pay period: fortnightly, Wed–Tue, anchored on `pharmacy_settings.payroll_start_date` (2026-05-27 = Week A).
- Fortnight OT threshold 76 hrs; sick/leave excluded from OT. Lunch: 30 min deducted on shifts > 5 hrs unless `no_lunch_deduction` or per-shift "no lunch".
- Public holidays: every `public_holidays` row = closed day. PH pay for Permanent staff comes from their regular schedule.
- Sick + carer's share one pool; compassionate leave is separate. Casuals and Salary staff are excluded from leave pay routing.
- Salary Excel export uses Contracted = base − leave (Arthur's sheet relies on this).
- Locum bookings are `roster_shifts` rows with `role = "Locum"`.

## Roster copy-month (current design)
- Anyone with a regular schedule (`weekly_schedule` / `week_ab_schedule`, any employment type) gets shifts **generated** from it.
- Everyone else is **copied** from last month by weekday + occurrence; a 5th occurrence missing in the target month is dropped.
- Locums untouched; public holidays skipped; approved leave ignored (roster shows the clash); undo supported.

## End of session
When Blair says "wrap up" (or similar), append a short summary to `docs/SESSION_NOTES.md` (create it if missing) with the date and these headings: **Done**, **Schema changes**, **New tables (add to RLS pass)**, **Follow-ups / parked**, **Not committed**. Keep it concise — Blair uploads it to his planning project.
