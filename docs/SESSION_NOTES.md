# Session notes

## 2026-09-29

### Done
- **Duplicate leave → Locums:** `lib/leaveCover.js` now gives one slot per pharmacist per date (approved beats pending), so duplicate/overlapping leave no longer shows a phantom 🔴 needs-locum.
- **Block leave over your own leave:** new purple "own" day state in `lib/leaveCalendar.js` (hard block like blackout/clash, legend entry). Submit guard in `/me` and `availability.js` refuses it. Calendar data now reloads after submit/withdraw (previously stale until page refresh — likely how the duplicate happened).
- **Tailwind now scans `lib/`** (colours set in `lib/leaveCalendar.js` only worked by luck before).
- **Manager Edit leave** (Roster → 📨 Leave Requests): type, dates, times, staff note, manager note; status unchanged. Warns (never blocks) on finished/confirmed pay periods (approved leave only) and on overlap with the same person's other leave.
- **Manager note no longer wiped:** note box pre-filled; Approve/Decline keep it; Reset to pending doesn't touch it.
- **Manager Delete leave** (hard delete, any status) with the same wages warning for approved leave in closed periods; shared check `leaveTouchesClosedPayPeriod` used by Edit + Delete.
- **Leave Requests panel cutoff:** approved/declined shown only if they end on/after the start of the previous pay period; pending always shown; "Older leave is in Admin → Staff (Leave history)" line.
- **`payPeriodFor()` in `lib/weekSchedule.js`** (UTC string maths). Verified identical to Wages `getPeriod` in Perth time: current period, Tue/Wed boundaries, Dec 2026 → Jan 2027 crossover. Used only by `roster.js` so far.
- **Admin → staff form: read-only Leave history** (all statuses, newest first) with per-year approved totals by type (all-day = calendar days, partial = hours). Hidden for Locums.
- **Staff Withdraw** replaces the old unguarded "Cancel request" on `/me` and `availability.js` (pending only). Delete guarded by id + staff_id + status = pending; 0 rows → "already decided" message + reload.
- `availability.js`: hard-coded "Paige:" label → "Manager:".

### Schema changes
- None.

### New tables (add to RLS pass)
- None.

### RLS pass (#11)
- `leave_requests`: staff Withdraw relies on the delete returning the deleted rows. Staff need **delete + select** on their own rows, or Withdraw will always say "already decided".

### Follow-ups / parked
- **Pay-period maths is duplicated** in `pages/wages.js` (`getPeriod`), `pages/me.js`, `pages/index.js`, `pages/admin.js` and `pages/api/cron/wage-reminder.js`. Consolidate them all onto `payPeriodFor()` in `lib/weekSchedule.js` in a future cleanup.
- Manager "Add leave" in Roster → Availability (`availAddLeave`, `roster.js`) has no duplicate/overlap check — can still create duplicate approved leave (Locums view is now protected, but the row itself isn't prevented).
- Old dead "Submit anyway?" same-role warn-confirm code in `/me` and `availability.js` handleSubmitLeave (unreachable since clashes hard-block) — left in place.

### Not committed
- All code committed and pushed in `f2f8627`. Only this wrap-up of `docs/SESSION_NOTES.md` is uncommitted.

## 2026-10-03 — Employment contracts (covers QSPP Stage 6 item #61: signed employment contracts on file)

### Done
- **Electronic offers of employment.** 4 fillable PDF templates (perm pharmacist, perm assistant, casual assistant, casual student) filled with pdf-lib in `lib/contractPdf.js`: auto-shrink to fit, WinAnsi-safe characters (warns), flatten + dangling-widget cleanup (Fair Work links kept), copy to fresh doc, no object streams.
- **Server routes** `pages/api/contracts/*` (service role, `lib/supabaseAdmin.js` + `lib/contractServer.js`): preview, issue (stores PDF + sha256, supersedes earlier unaccepted, saves classification to staff), admin-url, onboard, accept (Perth timestamp, IP, user agent; regenerates PDF with "Accepted electronically – name"), signature, paper.
- **Admin → Staff → New starter tab:** Basics (shares the staff form + save) → contract form (template auto-picked from role + employment type; hours prefilled from regular schedule minus lunch rule; Full-time/Part-time suggested from hours, 38+ = Full-time; classification from `staff.classification`) → onboarding link + status (issued / accepted / onboarding complete) → history.
- **Onboarding page:** contract step first (view, Fair Work links, tick + typed name, address if missing); payroll form hidden until accepted and prefilled with the address; "Signed Employment Contract" upload slot removed; submit sets `staff.onboarding_completed_at`.
- **Signature:** Admin → Settings: signatory name + title, signature image upload (private). Image drawn in the letter-page slot after flattening; contract boxes show the typed name.
- **Admin → Staff → Documents: Employment contracts list** — paper + accepted electronic, newest = Current. Paper uploads go privately to `employment-contracts/paper/<staff_id>/` (direct-to-storage signed upload, avoids Vercel 4.5 MB limit) with required Date signed; undated old uploads can have a date set.
- **Moved the 2 existing paper contracts** (Izabella Bilich, Test Contract) from the public `locum-documents` bucket to private; byte-verified; old public links dead. Backup of the 2 original rows saved locally (session scratchpad JSON).

### Schema changes
- SQL in `docs/sql/2026-10-02_employment_contracts.sql`, `2026-10-03_contracts_round2.sql`, `2026-10-03_contract_signatory_title.sql`, `2026-10-03_paper_contracts.sql` (all run).
- New tables `contract_templates` (4 Byford rows seeded) and `employment_contracts` (column is `field_values` — `values` is reserved).
- `pharmacy_settings`: `contract_signatory_name`, `contract_signatory_title`, `contract_signature_path`.
- `staff`: `classification`, `onboarding_completed_at`.
- `locum_documents`: `signed_date`, `storage_path`; `url` now nullable; check (url or storage_path).
- Backup table `contract_templates_backup_20261003` (can be dropped once happy).
- New env var `SUPABASE_SERVICE_ROLE_KEY` (.env.local + Vercel).

### New tables (add to RLS pass)
- `contract_templates`, `employment_contracts` (RLS off).
- Private bucket `employment-contracts` (templates/, issued/, accepted/, paper/, settings/) — no policies; all access via service-role API routes.

### RLS pass (#11)
- All `/api/contracts/*` Admin routes (preview, issue, admin-url, signature, paper) have **no server-side auth** — marked TODO. onboard/accept are gated only by the onboarding token.
- Admin contract drafts, the Documents "set date" and the history read go straight to the tables from the browser (anon key).

### Follow-ups / parked
- **Other staff documents are still in the PUBLIC `locum-documents` bucket** (resumes, certificates, etc.) — anyone with the link can open them. Worth moving to private.
- Accepted PDF is regenerated at acceptance with the *current* template file and signature image — if either is replaced between issue and acceptance, the accepted copy uses the new one.
- `onboarding_completed_at` updates on every "Submit my details", including existing staff resubmitting bank details.
- Unrelated bugs spotted, not fixed: Admin staff/locum PIN fields use `type="password"` (CLAUDE.md says text + disc); Locum form "Add booking" inserts `roster_shifts` without `pharmacy_id`.
- Test data: Test Contract (staff 23) has 3 accepted contracts + contract files; "Test Casual" no longer exists. Delete test staff, their `employment_contracts` rows and storage objects (issued/, accepted/, paper/23/) when done.

### Not committed
- Everything from this session: `lib/contractPdf.js`, `lib/contractServer.js`, `lib/supabaseAdmin.js`, `pages/api/contracts/*`, `components/ContractTab.js`, `components/EmploymentContractsList.js`, `pages/admin.js`, `pages/staff-onboard.js`, `docs/sql/*`, this file. (`pages/admin.js` also had a few uncommitted lines from before this session.)
