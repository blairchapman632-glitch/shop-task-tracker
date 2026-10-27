# Session notes

## 2026-10-26 / 27 — Staff Documents dates, inactive staff, /me speed, Tasks (section cleans, monthly tasks, checklists), locum cover

### Done
- **Staff Documents:** typed dates on file rows save once complete (no partial saves, focus kept, half-typed date reverts); Other qualifications upload box says "Type the qualification name first." (`64259f3`)
- **Inactive staff blocked:** /me re-checks `active` when the app returns to the foreground (max every 30s) → signs out + inactive screen; `/api/push` never sends to inactive staff. (`1a33ace`)
- **/me To do Training faster:** `api/me/certificates` loads everything in one parallel round; last known Training items shown instantly from this device (cleared on logout / inactive). ~0.9s → ~0.44s DB time. (`8f2e923`)
- **Tasks page:** shared `components/Sidebar.js` (Tasks / Wages / Admin / Insights); Section Cleans — red "Inactive — reassign" badge, per-person Sections panel, "+ Add staff", year arrows (Perth month), new year auto-copies last year's schedule (`lib/sectionCleans.js` ensureSectionYear, also on kiosk). (`26ceb04`)
- **Kiosk "today" from Perth time** (roster shifts, sick days, next shift, overdue/specific-date tasks, roster popup). (`0f48129`)
- **Monthly tasks** (`4d8290e`): "Nothing this month" (kiosk button; Insights "—" rows with Remove; counts as resolved); Tasks tabs **Assigned jobs** (one-off) / **Recurring tasks**; On the List Monthly **Show from day** (day or last day; red once passed; missed month carries over in red and counts for its own month via `completions.period_start`). "Twice a month" was built then dropped. Insights compliance months now Perth-based.
- **Consumables checklist (Part B)** (`1ea02b9`): Tasks → **Checklists** tab (tasks with `checklist_type`; Items / Suppliers / Settings (owner to order) / History by month + by item, printable). Kiosk sheet from the task card — counts or Low?, OK / Order / Owner / Shopping list, saves as you go, grouped items, Complete = normal completion + owner push. Follow-up kiosk cards "🧾 Consumables — N still to order" (assignee rostered) and "… for Blair to order" (owner rostered), red after 2 days, Ordered / Not ordering (who + when + note). History "Counted — N still to order" → "Complete"; Insights counts the month only when all orders are closed (points at count time). Items/suppliers deletable only if never used. Blair-to-order ticks in History record the owner.
- **Locum cover** (`1ea02b9`): Next 12 months; assign a **pharmacist** as cover (real role + `covers_leave`) as well as locums; edit times on red rows (`locum_slot_overrides` / `locum_gaps`, Reset); public holidays skipped; copy month keeps cover shifts and never copies them forward.
- CLAUDE.md: "wrap up" now adds the entry at the top of this file and shows it in the reply.

### Schema changes (all run by Blair)
- `task_month_skips` (Nothing this month); 12 board tasks split from Monthly Claims; `completions.period_start`; skip month may be the 16th (unused).
- Consumables: `pharmacy_settings.consumables_owner_staff_id` (+ `consumables_task_id`, no longer used); `tasks.checklist_type`; consumables tables + seed; `item_group` on items and lines; combined items split (+ fix-up by id); `checklist_lines.not_ordering*`; October test data cleared (backups `*_backup_20261026`).
- Locums: `roster_shifts.covers_leave`, `locum_slot_overrides`.
- Section cleans: unique index `section_clean_schedule (section_id, month)`.

### New tables (add to RLS pass)
- `task_month_skips`, `consumable_suppliers`, `consumable_items`, `checklist_sheets`, `checklist_lines`, `shopping_list_items`, `locum_slot_overrides`.

### Follow-ups / parked
- **Part C — Shopping list kiosk card** not built yet (table exists; consumables already adds low "Buy in person" items to it).
- Backups to drop once happy: `consumable_items_backup_20261026`, `consumable_items_backup_20261026b`, `checklist_sheets_backup_20261026`, `checklist_lines_backup_20261026`, `shopping_list_items_backup_20261026`, `completions_task116_backup_20261026`, `task_month_skips_task116_backup_20261026` (plus the induction template backups listed below).
- Items / suppliers / owner are shared by every consumables checklist task (add `task_id` to items if a second list is ever needed).
- Insights only loads completions inside the chosen period — a carried-over month done in the next month doesn't count when viewing "Last Month".
- Roster drag-copy (Alt-drag) inserts without `pharmacy_id` and drops `covers_leave` — existing bug, not fixed.
- Copy month `.neq("role","Locum")` skips null-role shifts (known gotcha) — unchanged.
- Locums "Upcoming Bookings" still uses `toISOString` for today.
- `2026-10-27_locum_cover_improvements.sql` was reconstructed from the plan — paste the exact text if it matters.
- Toner items are not "owner to order" (left off on purpose).

### Not committed
- CLAUDE.md "End of session" change and this session-notes entry.

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
- Nothing (committed in `22b09d4`).

## 2026-10-04 (cont.) — Policy reads move to the kiosk

### Done
- Background: policy files opened from `/me` (especially the iPhone home-screen app) stall and never load, so staff now read and tick on the kiosk only.
- **Kiosk home → Today's Jobs** (`pages/index.js`): a "📄 Read: [policy title]" card with the person's name for each outstanding request of active staff rostered on today (sick shifts excluded; cancelled/read and inactive documents never show). Projected from `policy_read_requests` — no task rows, no completions, no leaderboard/Activity feed, not in the Today's Jobs progress count. Tap → policy opens in a new tab + panel "For [name]" → "I have read and understood" (read_via kiosk + file snapshot, via `acknowledgeRequest`). Today's Jobs also shows when policy cards are the only jobs.
- **/me** (`components/MyPolicies.js`): read-only. Banner "📄 You have N policies to read — find them in Today's Jobs on the kiosk"; Profile → Policies: "To read" (titles only) and "Policies read" (date + phone/kiosk). Badge count unchanged.
- Kept: QSPP Library "📄 Policies to read" (second way in); Admin, Training tab and Needs attention unchanged.

### Schema changes
- None.

### New tables (add to RLS pass)
- None.

### RLS pass (#11)
- Kiosk home now also reads and completes `policy_read_requests` with the anon key (same as the QSPP Library kiosk flow).

### Follow-ups / parked
- `/api/policies/acknowledge` is still in place but **nothing calls it** now (/me no longer acknowledges). Keep for a future phone fix or remove later.
- Opening files on iPhone from `/me` (home-screen app) stalls — not investigated; may also affect other file links on `/me`.
- `/me` still passes an unused `onChanged` prop to `MyPoliciesSection` (harmless).

### Not committed
- Nothing — committed with this note.

  ## 2026-10-07 — Parked for later (noted during Stage 1 planning)

  ### Follow-ups / parked
  - `message-images` and `staff-photos` storage buckets are **public** (anyone with a link can open them). Not in Stage 1's scope.
  - `locum-documents` has no delete policy, so browser "Remove" (Admin Documents, onboarding) deletes the row but leaves the file; Admin's Locum form delete doesn't try. Kiosk /training "Replace" leaves the old certificate. 12 orphan files so far (11 in locum-documents, 1 in training-certificates) — left for later.
  - Every new Supabase Auth user (including each staff /me login) gets a `profiles` row via the `on_auth_user_created_profile` trigger, with role "owner" and no pharmacy.

  ### RLS pass (#11)
  - Kiosk `/training` loads every active staff member's PIN into the browser and checks it there.
  - Kiosk policy ticks (Today's Jobs card, QSPP Library → Policies to read) have no PIN — name pick only.
  - Multi-pharmacy: once browser writes to `profiles` are revoked (Stage 1 A2a), `/login`'s "create a pharmacy" sign-up can't set the new profile's pharmacy — accepted; redo it server-side in the multi-pharmacy auth pass.

  ## 2026-10-05 → 10-08 — /me tweaks, Stage 1 (private staff files, kiosk hours rules), Stage 2 (/me Training + To do)

  ### Done
  - **/me tweaks** (committed `aca0b44`, `18023bd`): Deliveries moved off the nav to a driver-only Roster card (today's run status; green when all delivered, amber when finished with couldn't-deliver drops) → full Deliveries view with ← Back. "Policies read" shows the newest 5 + Show all, titles without file extensions.
  - **Staff Documents dates** (`504d674`): upload without a date; newest service certificate with no completion date → "⚠️ Add completion date"; newest AHPRA / indemnity / first aid / CPR with no expiry → "⚠️ Add expiry date" and flagged in Needs attention (other qualifications stay optional). Optional "Expires" box at upload for typed sections.
  - **Stage 1 A2a — Admin login check** (`8bee181`): `lib/adminAuth.js` (`requireDashboard` = real Supabase login whose `profiles` row has a pharmacy; `assertSamePharmacy`) + `lib/adminFetch.js` (adds the token). Applied to contracts `preview`, `issue`, `admin-url`, `signature`, `paper` and reviews `sign`, `pdf-url`, `copy-given`. Proves "the pharmacy's dashboard account", not which person passed the Admin PIN.
  - **Stage 1 A2b — private staff files** (`8bee181`): `locum-documents` and `training-certificates` are now **private** (made private in place, no copy). Paths in `locum_documents.storage_path` / `training_records.certificate_path`; files open via 10-minute signed links, uploads go straight to storage with one-time upload URLs (no 4.5 MB limit). Server: `lib/staffFilesServer.js`; browser: `lib/staffFiles.js`. Routes: `/api/staff-docs` (Admin), `/api/staff-docs/onboard` (onboarding token, own documents only, POST only), `/api/training-certs` (Admin), `/api/training-certs/kiosk` (PIN re-checked on the server). Remove / Delete / Replace now delete the file as well (fixes the orphan-file bug).
  - **Stage 1 Part B — kiosk `/training` on `lib/trainingPlan.js`** (not committed): plan roles (not just Pharmacy Assistant), anniversary training year, 3-year cycle, pro-rata starting year, exemptions shown as "Not required this training year" (reason never loaded). No card for non-plan roles; plain message if no anniversary date. Old "under 12 months" text removed. **`lib/qspp.js` deleted** (its toISOString off-by-ones went with it); CLAUDE.md shared-libs list updated.
  - **Stage 2 — /me** (not committed):
    - Nav: Roster · Time off · Wages · Messages · Training · To do. Profile left the bar — tap the header photo/name for a panel (photo, name, role, email, Log out).
    - **To do**: performance review + policies (moved from Training), red badge moved here, empty state "Nothing to do right now." Review banner says "Open in To do →"; both banners open To do. Review/policies load once at start (badge + banners) and again when To do is opened — no longer on every tab switch.
    - **Training → Records** (`components/MyTraining.js`): own records newest first with year dividers; Add training (topic, date, hours, provider, optional certificate; same duplicate warning; record kept if the certificate fails); 📎 Add / Replace / open certificate (signed link, open-window-first). Add only — "Ask your manager".
    - **Training → Plan** (read-only): S2/S3 + this training year / this QSPP cycle hours for plan roles (same `lib/trainingPlan.js` functions as Admin and kiosk); CPD line for pharmacists/interns; goals for everyone except Locums — Section 4 goals of the latest **signed** review only, plus manual goals (open first, completed fold).
    - New route `pages/api/me/training.js` (login token via `staffFromRequest`; own records only; staff-facing fields only — no file paths/URLs, no exemption reasons, no ratings/summary/reviewer/pdf_path). Training data loads only when the tab is opened.
    - Admin: "Staff can see this" hint under the manual goal notes field.

  ### Schema changes
  - `docs/sql/2026-10-07_private_staff_files.sql` (run): backups `locum_documents_backup_20261007`, `training_records_backup_20261007`; `training_records.certificate_path`; backfill (18 + 39 rows verified); both buckets private + 5 public storage policies dropped.
  - `revoke insert, update, delete, truncate on public.profiles from anon, authenticated;` (run, verified).

  ### New tables (add to RLS pass)
  - None (two backup tables only — drop once happy).

  ### RLS pass (#11)
  - Admin routes check the dashboard login only; per-person admin rights still to do. Kiosk certificate routes trust the 4-digit PIN (no rate limit).

  ### Follow-ups / parked
  - During A2b testing, old document id 11 (Test Contract, resume "Birth Certificate - Mabel.pdf") was removed — row is in the backup table, file is gone.
  - Old `url` / `certificate_url` values are still stored (unused now that paths exist) — clear later if wanted. 12 orphan files (now private) still to decide on.
  - A3 iPhone test: `/me` has no file links except training certificates now — test PDF vs photo certificate from the home-screen app; .docx can't be uploaded (PDF/JPG/PNG only).
  - Not reviewed for auth: `api/push.js`, `api/hire-due-back.js`, `api/cron/wage-reminder.js`.
  - Stage 3: Training → Certificates and To do nudges.

  ### Not committed
  - Stage 1 Part B (kiosk `/training`, `lib/qspp.js` deleted, CLAUDE.md) and all of Stage 2.

  ## 2026-10-08 — Stage 3: /me Training → Certificates + To do nudges

  ### Done
  - **Training → Certificates** (third sub-tab; `components/MyCertificates.js`): certificate sections only, from `docSections` — pharmacists/interns: AHPRA, Indemnity, ticked-service certificates, Other qualifications; plan roles: S2/S3, First aid, CPR. (Contract, induction checklist, resume and other documents stay Admin/onboarding only.) Same status as Admin (`sectionStatus`); current file opens via signed link (open-window-first); older files read-only under "Show older files". Upload new (PDF/photo, optional completion/expiry date, name for other qualifications) straight to private storage — newest counts. Staff can **add** a date only where it's empty (server-checked); no editing dates, delete or replace.
  - **To do → Training nudges**: Admin's own `trainingAttention` run for the logged-in person only (missing / expired / expiring / no-date certificates, S2/S3 not done, hours short when the year or cycle ends within 60 days — staff wording "1.5 hrs short — year ends 28 Feb"). Each opens Training on the right sub-tab, scrolled to the certificate section. To do badge = review + policies + training nudges.
  - New route `pages/api/me/certificates.js` (login token; own certificates only; no storage paths/URLs; `?view=todo` returns just the nudges for the badge). `saveDoc` takes server-set fields so `uploaded_via` can't come from the browser.
  - **Admin**: files uploaded from /me show "Uploaded by <name>, <date>" in Staff → Documents.

  ### Schema changes
  - `alter table locum_documents add column uploaded_via text;` (run) — `'me'` for /me uploads; empty for Admin/onboarding/older rows.

  ### New tables (add to RLS pass)
  - None.

  ### Follow-ups / parked
  - S2/S3 nudge follows Admin exactly: only "Not done" (after the 3-month grace period), not "Due by" — the plan mentioned "Due by"; add to both together if wanted.
  - To do nudges refresh when the app opens and when To do is opened (not live while the app sits open).

  ### Not committed
  - Stage 1 Part B, Stage 2 and Stage 3.

  ## 2026-10-09 — QSPP Library: domain groups + document version control

  ### Done
  - **Grouped library** (`lib/docFolders.js` shared by kiosk + Admin): folders grouped by `document_folders.group_name`, group order = lowest `sort_order`, ungrouped → "Other" at the end.
  - **Kiosk `/documents` Library tab**: two-column layout (wider page) — groups expand one at a time, section highlighted; phone gets group + section dropdowns. Search unchanged. Incidents tab untouched.
  - **Admin QSPP → Documents**: folder list under group headings; Add folder and "Rename / group" take a Group (pick or type new); move-to-folder dropdown grouped.
  - **File-type tag** now from `file_name` (PDF red / DOC blue / XLS green / grey FILE) on kiosk and Admin (Admin had a 📄 icon before).
  - **Upload titles**: extension and leading "1.2 - " prefix stripped (`titleFromFileName`).
  - **Version control**: "Replace" → "Upload new version" modal (version prefilled next minor, Updated by required, optional note). New file goes to a new timestamped path in the same folder; old files never deleted; title unchanged; `document_versions` row added. New uploads need "Updated by", start at v1.0 with "First version". Rows show "v1.1 · updated 9 Oct 2026 by Name" (Perth date); History list with Current marker and Open links. Delete (still blocked by read requests) removes every version's file. Kiosk shows grey "v1.1" next to titles.
  - Committed: `5ae1bfc` (groups, tags, titles), `2119283` (version control).

  ### Schema changes
  - Run by Blair before the work: `document_folders.group_name` (filled); `pharmacy_documents.version` / `updated_by_staff_id` / `updated_at`; new `document_versions` table (208 rows, v1.0 "Initial import").

  ### New tables (add to RLS pass)
  - `document_versions`.

  ### Follow-ups / parked
  - Delete removes the document row first, then the storage files (leftover files at worst, never a row pointing at missing files).
  - New document uploads still use the old `<folder-slug>/<timestamp>_<name>` storage path; new versions use `<same folder>/<timestamp> - <name>`.
  - If a new version's history entry fails to save, the document is already on the new version (error says so).

  ### Not committed
  - This session-notes entry.

  ## 2026-10-25 — Staff induction, Stage 1 of 5 (Admin core)

  ### Done
  - **`lib/induction.js`** (new): role → position (Pharmacist PH, Intern INT, Pharmacy Assistant / Retail Manager PA, DAA Coordinator DT, Locum excluded), sections, due date = start + 3 months, progress (any result counts, N/A included), Needs attention state (amber 14 days before due, red overdue).
  - **Admin → New starter → "4. Induction"** (`components/InductionTab.js`): Start induction (supervisor = active non-locum staff; asks for start date if missing and fills the empty staff start date; "Pharmacy student" tick, pre-ticked from a Casual Pharmacy Student contract). Snapshots active template lines for the person's position (student-only lines only for students).
  - Checklist: Section 1 read-only header, progress line + change supervisor, collapsible sections with x of y, Done / N/A / Declined (Section 4 "Competent"), click again to untick, notes (with prompts), "Pharmacist" label, "Add other item" in Sections 4 and 5 (removable), Section 6 placeholder, "Mark section done" on Getting started only, "Delete induction" (confirm; not once signed off).
  - Contract history moved under step 2. Profile tab: "Paper induction on file" tick (hides step 4).
  - **Needs attention → New starters**: "Induction x of y · Due [date]" for in-progress inductions.
  - Template is now **v2.2**: streamlined (6 lines inactive, 3 reworded) + new "Getting started" section (16 lines; PDF label "Practical — not a QSPP requirement" for Stage 5).
  - Committed: `11ace0f`.

  ### Schema changes (all run by Blair)
  - `2026-10-25_inductions.sql`: 3 new tables; `staff.can_sign_inductions`, `staff.paper_induction_on_file`; `policy_read_requests.induction_id`; v2.1 template seed (63).
  - `2026-10-25_inductions_students.sql`: `student_only` on template + induction items, `staff_inductions.is_student`; student lines + separate AHPRA student line.
  - `2026-10-25_inductions_v2_2.sql`: section check allows `start`; template renamed v2.1 → v2.2; 74 active / 80 rows.

  ### New tables (add to RLS pass)
  - `induction_template_items`, `staff_inductions`, `staff_induction_items`.

  ### Follow-ups / parked
  - Drop later once happy: `induction_template_items_backup_20261025`, `induction_template_items_backup_20261025b`.
  - Stage 2: /me sign-off for senior staff (`can_sign_inductions` UI). Stage 3: induction policies + kiosk card (`kind = policy`, `document_id`, `policy_read_requests.induction_id`). Stage 4: auto-ticks (`auto_source` keys incl. `issued_items`). Stage 5: Section 6 from the probation review + PDF (`pdf_path`).
  - Admin ticks store `signed_via = admin` with no staff member (Admin login isn't a staff record).
  - Template lines are snapshotted at start — template changes don't reach inductions already started.

  ### Not committed
  - This session-notes entry.

  ## 2026-10-25 (cont.) — Staff induction, Stages 2–5

  ### Done
  - **Stage 2 — /me sign-off:** "Can sign off inductions" flag (Profile tab). Routes `pages/api/inductions/{list,detail,answer,mark-section}` (staff login + flag, else 401/403; rules in `lib/inductionServer.js`): no own induction, no Office use, Section 3 read-only, pharmacist-only lines need role Pharmacist, someone else's tick can't be changed from /me. /me To do → "Inductions" card (`components/MyInductions.js`), not in the badge. Admin shows the signer's name for /me ticks.
  - **Stage 3 — policies:** all 26 Section 3 template lines linked to library documents (exact title match). Start induction sends read requests (`induction_id` set; an outstanding one is reused). Reading (any path through `acknowledgeRequest` or `/api/policies/acknowledge`) ticks the line ("Read [date] · kiosk"); an Admin N/A isn't overwritten. Kiosk: one "📋 Name's induction · x of y policies read" card instead of separate "📄 Read:" cards. Needs attention Policies group leaves out induction requests. Delete cancels only requests the induction created (`requested_at` = induction `created_at`); reused ones stay outstanding.
  - **Stage 4 — auto-checks** (`lib/inductionAuto.js`), run on every load of an in-progress induction (Admin, /me detail, kiosk): contract accepted, emergency contact (name + phone), AHPRA / indemnity / S2/S3 / first aid or CPR on file and not expired (pharmacists: the Vaccinating service's first aid + CPR certificates), Vaccinating certificates complete, training plan (plan roles only), uniform (Uniforms Supplied ≥ 1 and Badge supplied). Manual answers always win; auto ticks drop back if the source goes. Admin "Add" links open the right tab.
  - **Stage 5 — sign-off:** Section 6 in Admin (probation review link, outcome Confirmed / Extended to / Not confirmed, completed in 3 months + late reason). Order enforced server-side: ready → employee confirms on the kiosk ("📋 Confirm your induction", rostered on today) → supervisor signs off in Admin or their /me (`pages/api/inductions/{kiosk-confirm,sign-off}`). Locked after sign-off; gone from Needs attention / /me / kiosk. PDF (`lib/inductionPdf.js`, header from `FORM_META` in `lib/induction.js`) in the private bucket, opened by 10-minute signed URL from step 4 and the Documents tab. Rebuild PDF and Reopen (reason, keeps ticks) in Admin.
  - Committed: `8c2fee6`.

  ### Schema changes (all run by Blair)
  - `2026-10-25_induction_policy_links.sql`: `document_id` on the 26 Section 3 template lines.
  - `2026-10-25_induction_signoff.sql`: `staff_inductions.probation_outcome`, `probation_extended_to`, `probation_review_id`, `signed_off_via`, `reopened_at`, `reopened_reason`; new private bucket `staff-inductions`.

  ### New tables (add to RLS pass)
  - No new tables. Add the **`staff-inductions`** storage bucket (private, service-role routes only) and the new `staff_inductions` columns above (table already listed).

  ### Follow-ups / parked
  - Drop later once happy: `induction_template_items_backup_20261025`, `induction_template_items_backup_20261025b`, `induction_template_items_backup_20261025c`, `induction_template_items_backup_20261025d`.
  - Test inductions started before each stage keep their old copy — delete and restart them.
  - A change to a line after the employee has confirmed doesn't clear the confirmation (sign-off still re-checks readiness).
  - Kiosk confirm list leaves out Office use lines.
  - Admin ticks / Section 6 saves use the browser client (like the rest of Admin); sign-off, confirm, PDF and reopen are server routes.

  ### Not committed
  - This session-notes entry.

  ## 2026-10-25 (cont.) — Induction speed fixes + template tweaks

  ### Done
  - **/me speed:** ticks update instantly (optimistic; answer / mark-section routes return the saved lines; failed saves put the line back with the error); one save per line at a time (also Admin, which stops a double-click unticking). Inductions list preloaded when /me loads. Opening an induction shows saved lines at once (placeholder while loading); auto-checks run in the background via new `pages/api/inductions/auto-check` ("checking…" by Refresh). Admin step 4 and kiosk cards also show saved lines first and merge auto-check changes after. Committed `6d089c7`, `9f5a460`.
  - **Template (still v2.2):** Section 4 "Supplying Pharmacy and Pharmacist Only medicines…" deactivated (S2/S3 certificate covers it; run by hand). RUM line reworded; "Disposal of Expired & Unwanted Products (Procedure)" added to Section 3 All staff (linked). Section 5 lines moved: Training page → Getting started / Chalkboard; Training & Development Plan → Office use (still auto for plan roles). Empty Section 5 hidden everywhere; sign-off section now shown as "5. Probation review and sign-off" (display only). Committed `17e55ac`.

  ### Schema changes
  - `2026-10-25_induction_rum_section5.sql` (run): template rows only. Now 74 active lines (start 17 · 2 = 4 · 3 = 27 · 4 = 13 · office = 13).

  ### New tables (add to RLS pass)
  - None.

  ### Follow-ups / parked
  - Backup `induction_template_items_backup_20261025d` added to the drop-later list above.
  - Katelyn's test induction keeps its old lines (S2/S3 supply line → mark N/A; old Section 5 lines show under an unnumbered "Your training").

  ### Not committed
  - This session-notes entry.
