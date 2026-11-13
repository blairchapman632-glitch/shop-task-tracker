-- Performance review: unsent Section 2 answers ("draft") — 2026-11-13
-- Kiosk "Answer your review questions": when the page closes (Close button or 3-minute timeout) any typing that
-- hasn't been sent is saved here, NOT into staff_prep, so the reviewer never sees half-finished answers.
-- The kiosk and /me both start from the draft if there is one; Send copies it into staff_prep and clears these.
-- Additive only — no existing data changes.

alter table performance_reviews add column if not exists staff_prep_draft jsonb;
alter table performance_reviews add column if not exists staff_prep_draft_at timestamptz;

-- Check
select column_name, data_type from information_schema.columns
where table_name = 'performance_reviews' and column_name in ('staff_prep_draft', 'staff_prep_draft_at');
