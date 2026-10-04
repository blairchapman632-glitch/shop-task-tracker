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

## 2026-10-04 — Performance reviews (QSPP-4.9-PERF-FORM v1.0, QSPP 2.4.1.3(d))

### Done
- **Part 1 — Admin (commit `8159248`).** `lib/performanceReview.js` holds the exact paper-form wording (7 all-staff areas, 3 dispensary areas, 5 Section 2 questions, labels, form version) and the shared "who is due" helper (string date maths; probation = start + 3 months, annual = last signed + 12 months; excludes Locums, inactive staff and anyone excluded from reviews; "Start date not set" when there's no start date).
  - Staff Profile ticks: "Can conduct performance reviews" and "Exclude from performance reviews".
  - New **Reviews tab** on the staff form (hidden for Locums): start a review (type suggested, dispensary tick, reviewer list, position), editor with autosave + Save button, sign-off (typed name + confirm; soft warnings for missing meeting date, unrated areas or summary) locks the review and files the PDF. Signed reviews: Download PDF, Copy given + date, next due date. Only in-progress reviews can be deleted.
  - **Overview panel** replaces the empty staff screen: Due now/overdue, Due in the next 30 days, In progress, Start date not set.
  - **PDF** drawn from scratch with pdf-lib (`lib/reviewPdf.js`): header, sections 1–6, tick-box ratings, office-use block, footer on every page, WinAnsi-safe text. Stored privately at `performance-reviews/<staff_id>/<review_id>.pdf`. Routes `sign`, `pdf-url`, `copy-given` (ticking Copy given rebuilds the PDF so the office-use block matches).
  - `sanitise` in `lib/contractPdf.js` is now exported (no behaviour change).
- **Part 2 — staff phone side (commit `2bff771`).** `/me` "Details" renamed **Profile** (key still `details`). "My performance review" section: Section 2 form while the review is in progress (edit and resubmit until signed); after signing, only a comment box until `comment_window_ends`; nothing otherwise. Roster banner (prep waiting / comment invite) and red "1" Profile badge while Section 2 is waiting (`components/MyReview.js`).
  - Staff routes `my-review`, `save-prep`, `save-comment`: check the Supabase login token, find the staff row by exact email, and only act on that person's current review. They return staff-facing fields only. Saving a comment sets `staff_comments_seen = false` and rebuilds the PDF.
  - Admin: Section 2/5 show the staff member's answers with "Last updated". Overview has a "New staff comments" list (opens that review and marks the comment seen). Settings has "Performance review comment window (days)".
- Security check: all staff routes return 401 with no token or a fake one (tested on a temporary local server).

### Schema changes
- `docs/sql/2026-10-04_performance_reviews.sql` (run): `staff.can_conduct_reviews`, `staff.exclude_from_reviews`, `pharmacy_settings.review_comment_window_days` (default 14), new table `performance_reviews`, private bucket `performance-reviews`.

### New tables (add to RLS pass)
- `performance_reviews` (RLS off).
- Private bucket `performance-reviews` (no policies; all access via service-role API routes).

### RLS pass (#11)
- Admin review routes (`sign`, `pdf-url`, `copy-given`) have **no server-side auth** — marked TODO, same as contracts.
- Admin creates, edits, deletes and marks seen on `performance_reviews` straight from the browser (anon key). When RLS goes on, staff must have **no direct access** to this table; `/me` already uses only the token-checked API routes.

### Follow-ups / parked
- Staff using an old `/me?token=` link (no Auth session) don't see reviews at all.
- A manager with a review already open doesn't see newly submitted Section 2 answers until they reopen it.
- If the PDF rebuild after a staff comment fails, only the server log records it; the next rebuild (e.g. ticking Copy given) catches it up.
- Office-use block often lands alone on the last PDF page; could tighten the layout.
- Test data: delete any test reviews (`performance_reviews` rows + `performance-reviews` storage files) once testing is done.
- Still open from earlier: Admin staff/locum PIN fields use `type="password"`; Locum "Add booking" inserts `roster_shifts` without `pharmacy_id`.

### Not committed
- Nothing. Part 1 = `8159248`, Part 2 = `2bff771`; these notes were committed with the training plan below.

## 2026-10-04 (cont.) — Training & Development Plan (QSPP 2.4.1.5), Admin side

### Done
- First built a heavier version (role requirement lists, Mark done, completion history, per-person add/remove), then **reworked to a simpler design** before committing. Only the simple version is in the code.
- **Plan = Pharmacy Assistant, DAA Coordinator and Retail Manager** (fixed constants at the top of `lib/trainingPlan.js`: `HOURS_PER_YEAR = 3`, `S2S3_DOC_TYPE = 's2_s3_cert'`, `PLAN_ROLES`). Staff Training tab shows:
  - **S2/S3:** "Done" + Open link if they have a Documents file of type `s2_s3_cert`; else "Due by start + 3 months"; then "Not done".
  - **Hours** from training records (every record counts): "This training year: x of N" and "This QSPP cycle: x of M". 3 hrs/year, pro-rata in the starting year (rounded up to 0.5), 0 before they started. Cycle = 3 training years from `qspp_cycle_start_date` (2024-03-01 → current cycle ends 28 Feb 2027). "Not required this training year" tick + reason sets that year to 0.
- **Goals** for all staff except Locums: Section 4 goals from the latest signed review (read-only, "Open review →") + manual goals (goal, notes, Done, edit, delete, "Completed goals" fold).
- **Training record PDF** (date range, download only, built in the browser) — `lib/trainingRecordPdf.js`.
- **Documents:** optional inline "Expires" date on each staff file (not resumes). Only the newest file of each type counts for alerts.
- **Admin → QSPP → 🎓 Training:** QSPP anniversary date (moved from Settings — same column; Settings no longer shows or saves it), training year + cycle shown, Needs attention (S2/S3 not done; year/cycle hours short within 60 days of the end; certificates expired or expiring within 60 days, all non-locum staff), hours table. (A "Plan settings" block was built, then removed — the rules are now hard-coded.)
- Removed the old "QSPP Training x / 9 hrs" box from the staff Training tab. `lib/qspp.js` kept (`pages/training.js` uses it).
- Date rules tested: pro-rata, rounding, leap years, 29 Feb anchor, cycle boundary (28 Feb vs 1 Mar 2027), dates before the anchor.
- Files: `lib/trainingPlan.js`, `lib/trainingRecordPdf.js`, `components/TrainingPlan.js`, `components/TrainingAdmin.js`, `pages/admin.js`.

### Schema changes
- `docs/sql/2026-10-04_training_plan.sql` (run): tables `training_requirements` (9 Byford rows seeded), `staff_training_overrides`, `staff_training_completions`.
- `docs/sql/2026-10-04_training_plan_rework.sql` (run): backup `training_requirements_backup_20261004`; `pharmacy_settings.training_hours_per_year` / `training_s2s3_doc_type` / `training_plan_roles`; `locum_documents.expiry_date`; tables `staff_training_goals`, `staff_training_exemptions`; 7 requirement rows deactivated (2 still active, but unused).

### New tables (add to RLS pass)
- `staff_training_goals`, `staff_training_exemptions` (in use).
- `training_requirements`, `staff_training_overrides`, `staff_training_completions` (RLS off, **unused**).

### RLS pass (#11)
- Admin reads/writes all training tables and `locum_documents.expiry_date` straight from the browser (anon key), like the rest of Admin.

### Follow-ups / parked
- **Candidates to drop later (unused, empty or seed-only):** `training_requirements`, `staff_training_overrides`, `staff_training_completions`, backup `training_requirements_backup_20261004`. Nothing reads them now.
- **Unused columns (left in place):** `pharmacy_settings.training_hours_per_year`, `training_s2s3_doc_type`, `training_plan_roles` — the plan rules are hard-coded in `lib/trainingPlan.js` instead.
- Part 2: staff seeing their plan/records on `/me` Profile.
- `lib/qspp.js` (used by `pages/training.js`) does date maths with `toISOString` — the Perth off-by-one gotcha. Consider moving `training.js` onto `lib/trainingPlan.js`.
- Expiry can only be set on a file's row after upload (not in the upload step); onboarding uploads have no expiry.
- (Superseded by the Documents rework below: newest file per section counts; each named Other qualification is checked separately.)

### Not committed
- Nothing. Training plan = `30040a0`; hard-coded rules + Plan settings removal = `fce7e20`.

## 2026-10-04 (cont.) — Admin layout, New starter fixes, pharmacist services + Documents rework (commit `fce7e20`)

### Done
- **Admin → QSPP → 📝 Reviews:** review overview moved here from the Staff screen (due/overdue, next 30 days, in progress, new staff comments, start date not set), plus "X of Y staff reviewed in the last 12 months" (Y = reviewable, employed > 3 months, start date set) and a Signed reviews list. Clicking opens Admin → Staff on that person's Reviews tab (and that review).
- **Admin → Staff main screen → Needs attention:** Reviews (due/overdue, in progress, new comments), Training (S2/S3 not done, hours short near year/cycle end), Certificates (expiring/expired; pharmacist certificates), New starters (electronic contract issued not accepted, or accepted with onboarding not finished — active staff only; paper-only staff never flagged). Each line opens the right tab; empty groups hidden; "All clear". Training/certificate rules shared with QSPP → Training via `loadTrainingData()` / `trainingAttention()` in `lib/trainingPlan.js`.
- **New starter tab:** read-only **Current contract** card (accepted/issued values + PDF links) instead of a blank form; "Issue a new contract" prefills from it (same template, today's dates). **Mark onboarding complete** button (confirm, sets `onboarding_completed_at`). Issuing a contract now fills the staff `start_date` **only if empty** (DB-guarded); form + list refresh so Save can't wipe it.
- **Training plan rules hard-coded** in `lib/trainingPlan.js`: `HOURS_PER_YEAR = 3`, `S2S3_DOC_TYPE = 's2_s3_cert'`, `PLAN_ROLES` = Pharmacy Assistant, DAA Coordinator, Retail Manager (Retail Managers now have a plan). Plan settings block removed.
- **Pharmacist services:** editable in QSPP → Training (services + certificates, one-off or renews every X months; hide, never delete). Seeded Vaccinating (7 certs), Medication reviews, UTI prescribing, Oral contraceptive prescribing. Pharmacist/intern Profile ticks (saved immediately; untick = `active` false).
- **Staff Documents rework** (`lib/staffDocuments.js`, reusable `components/DocumentSections.js`): role-aware sections with Required/Optional + status (✅ Current until / ⚠️ Expiring within 60 days / ❌ Expired / Missing). Everyone: contract, induction checklist (required), resume, other. Assistant group: S2/S3 (required), first aid, CPR (typed expiry). Pharmacists/interns: AHPRA + indemnity (required, typed expiry), one section per ticked-service certificate (completion date → expiry worked out live from `renew_months`), other qualifications (name + optional expiry). Newest file counts, older kept as history; unmatched files shown under "Older / other files". No more "Replace" (which deleted the old file).
- **Pharmacist/intern Training tab:** "CPD managed by the pharmacist under Pharmacy Board requirements." + required certificates with status (read from Documents).
- **Needs attention (both screens):** pharmacist AHPRA/indemnity/service certificates Missing, Expired, Expiring or missing a completion date; generic expiry rule skips those so nothing is listed twice.
- **Onboarding page:** pharmacists/interns use the shared sections (Resume, AHPRA, Indemnity, ticked-service certificates with completion date, Other qualifications). Assistants unchanged (Resume, S2/S3, Other Documents).
- "Goals" → "Training & development goals" on the Training tab.

### Schema changes
- `docs/sql/2026-10-04_pharmacist_services.sql` (run): tables `pharmacist_services`, `service_certificates`, `staff_services` (+ Byford seed: 4 services, 10 certificates); `locum_documents.service_certificate_id`, `completion_date`, `title`.

### New tables (add to RLS pass)
- `pharmacist_services`, `service_certificates`, `staff_services` (RLS off).

### RLS pass (#11)
- Onboarding page reads `pharmacist_services` / `service_certificates` / `staff_services` and writes `locum_documents` with the anon key (gated only by the onboarding token), same as before.

### Follow-ups / parked
- **Staff documents are still in the PUBLIC `locum-documents` bucket** — now also service certificates. Moving to private is still open.
- `/me` uploads: `DocumentSections` takes upload/remove/update actions, so `/me` can reuse it with token-checked API routes.
- Pharmacists' onboarding no longer has "Other Documents" (Other qualifications replaces it).
- Retired slots: Signed confidentiality policy (0 files) and Vaccination accreditation (only Test Contract's test file); pharmacist First aid / CPR now live under Vaccinating.
- Blair's indemnity expires 30 Oct 2026 (shows in Needs attention).
- Annamore Simakwere: start date to be set by Blair; use "Mark onboarding complete".
- Test data (Test Contract, staff 23) — Blair will clean up separately.

### Not committed
- Nothing (notes committed with the policy acknowledgment work below).

## 2026-10-04 (cont.) — Policy acknowledgment (QSPP library)

### Done
- **Admin → QSPP → Documents:** "Ask staff to read" on each document (Everyone / By role / Individual people; active non-locum staff only; shows "This will ask N people", skips anyone with it outstanding, notes re-reads). "x of y read" with an expandable list (read: date + phone/kiosk; not yet: Cancel with confirm). Counts use each person's latest non-cancelled request; inactive staff not counted. Rules in `lib/policyReads.js`, UI in `components/PolicyRequests.js`.
- **Guards added to the existing library:** Delete refuses for any document with read requests (QSPP evidence; it used to delete the file first). Replace keeps the old file if a read record points at it (snapshot link stays valid). Requests are never changed by Replace.
- **/me:** routes `/api/policies/mine` + `/api/policies/acknowledge` (same token check as reviews; own requests only, someone else's looks "not found"). Roster banner "📄 You have N policies to read", Profile badge = review waiting + policies to read, Profile → Policies to read (Open + "I have read and understood") and Policies read (`components/MyPolicies.js`).
- **Kiosk** (`pages/documents.js`): "📄 Policies to read" → pick name (active, non-locum, no PIN) → Open + "I have read and understood" (read_via kiosk, file snapshot).
- **Staff Training tab:** read-only Policies section (To read / Read with date + phone/kiosk).
- **Staff Needs attention:** Policies group ("Title · N of M still to read") → opens QSPP → Documents on that policy with its list open.
- Security check: both new routes return 401 with no token or a fake one.

### Schema changes
- `docs/sql/2026-10-04_policy_reads.sql` (run): table `policy_read_requests` + partial unique index (one outstanding per document + person) + indexes. FK to `pharmacy_documents` with no cascade.

### New tables (add to RLS pass)
- `policy_read_requests` (RLS off).

### RLS pass (#11)
- Kiosk reads and completes requests with the anon key (name only, no PIN — same as incident reports). Admin creates/cancels from the browser. `/me` uses only the token-checked API routes.

### Follow-ups / parked
- QSPP library files are in a public bucket (like staff documents).
- A dev server left running on port 3005 from an earlier test was stopped (it was answering test requests with stale files).

### Not committed
- Nothing — committed with this note.
