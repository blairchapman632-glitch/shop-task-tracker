-- Stage 2 (QSPP 1.2, 2.1, 2.2, 2.7, 3.2, 3.3, 4.7): Feedback register, incident gaps, annual incident & feedback review.
-- Additive only: new columns on incidents (all nullable / defaulted — the existing incidents are unchanged) and two new
-- tables. RLS: left OFF like the rest of the app — add feedback + incident_feedback_reviews to the RLS pass.
-- Run in the Supabase SQL editor.

-- ── 1. Incident gaps ────────────────────────────────────────────────────────
-- Clinical / non-clinical
alter table public.incidents add column if not exists clinical_type text
  check (clinical_type in ('clinical', 'non_clinical'));
-- Reported to third parties (several allowed): [{ "to": "PDL"|"TGA"|"Manufacturer"|"Pharmacy Board"|"Other", "date": "YYYY-MM-DD", "notes": "…" }]
-- Empty array = not reported to anyone.
alter table public.incidents add column if not exists third_party_reports jsonb not null default '[]'::jsonb;
-- Open disclosure
alter table public.incidents add column if not exists patient_harmed boolean;                 -- null = not answered yet
alter table public.incidents add column if not exists disclosure_date date;
alter table public.incidents add column if not exists disclosure_by_staff_id bigint references public.staff(id);
alter table public.incidents add column if not exists disclosure_notes text;
-- Feedback to staff (how the outcome was shared with the team)
alter table public.incidents add column if not exists staff_feedback_date date;
alter table public.incidents add column if not exists staff_feedback_how text;              -- e.g. staff meeting, message, Wall

-- ── 2. Feedback register ────────────────────────────────────────────────────
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  received_date date not null,
  logged_by_staff_id bigint references public.staff(id),
  feedback_type text not null check (feedback_type in ('positive', 'negative')),
  category text not null check (category in ('clinical', 'non_clinical')),
  received_via text not null check (received_via in ('in_person', 'phone', 'email', 'online_review', 'social_media', 'other')),
  details text not null,                       -- what was said
  contact text,                                -- patient name / contact (optional — only if a response is needed)
  -- follow-up (staff can fill; locked once filled, like incident actions)
  response text,                               -- response given to the patient
  responded_date date,
  improvement text,                            -- improvement made (optional)
  -- manager only
  closed_date date,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feedback_pharmacy_idx on public.feedback (pharmacy_id, received_date desc);

-- ── 3. Annual incident & feedback review ────────────────────────────────────
create table if not exists public.incident_feedback_reviews (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  review_date date not null,
  reviewed_by_staff_id bigint references public.staff(id),
  period_start date not null,
  period_end date not null,
  findings text,
  improvements text,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);
create index if not exists incident_feedback_reviews_pharmacy_idx on public.incident_feedback_reviews (pharmacy_id, review_date desc);

-- Check: 8 new incident columns, and both tables exist (0 rows each)
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'incidents'
  and column_name in ('clinical_type', 'third_party_reports', 'patient_harmed', 'disclosure_date', 'disclosure_by_staff_id',
                      'disclosure_notes', 'staff_feedback_date', 'staff_feedback_how')
order by column_name;
select (select count(*) from public.feedback) as feedback_rows,
       (select count(*) from public.incident_feedback_reviews) as review_rows;
