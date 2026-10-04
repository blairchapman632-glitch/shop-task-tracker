-- Performance reviews (QSPP-4.9-PERF-FORM v1.0, QSPP 2.4.1.3(d)) — run in the Supabase SQL editor, project shop-task-tracker.
-- Additive only: two staff columns, one pharmacy_settings column, one new table, one new private bucket.
-- No existing rows are changed.
-- RLS: left OFF on performance_reviews (matches the rest of the app). Add the table + bucket to the #11 RLS pass.

-- a) Staff flags
alter table public.staff add column if not exists can_conduct_reviews boolean not null default false;
alter table public.staff add column if not exists exclude_from_reviews boolean not null default false;

-- b) Comment window after sign-off (days) — config, not code
alter table public.pharmacy_settings add column if not exists review_comment_window_days int not null default 14;

-- c) Reviews
create table if not exists public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  staff_id bigint not null references public.staff(id),
  review_type text not null check (review_type in ('probation', 'annual')),
  position text,
  include_dispensary_areas boolean not null default false,
  reviewer_staff_id bigint references public.staff(id),
  meeting_date date,
  last_review_date date,

  -- Section 2 (staff fill these in Part 2)
  staff_prep jsonb not null default '{}'::jsonb,
  staff_prep_updated_at timestamptz,

  -- Section 3
  ratings jsonb not null default '{}'::jsonb,  -- area key -> { rating: 'needs_work'|'meets'|'strength', comment }
  goals_progress text,
  overall_summary text,

  -- Section 4
  goals jsonb not null default '[]'::jsonb,    -- [{ goal, actions, target_date }]
  training_added boolean not null default false,
  training_added_date date,

  -- Section 5 (Part 2)
  staff_comments text,
  staff_comments_at timestamptz,
  staff_comments_seen boolean not null default true,

  -- Section 6 / office use
  status text not null default 'in_progress' check (status in ('in_progress', 'signed')),
  signed_by_staff_id bigint references public.staff(id),
  signed_name text,
  signed_at timestamptz,
  comment_window_ends date,
  copy_given boolean not null default false,
  copy_given_date date,
  pdf_path text,
  form_version text,

  created_by bigint references public.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists performance_reviews_staff_idx on public.performance_reviews (staff_id, created_at desc);
create index if not exists performance_reviews_pharmacy_idx on public.performance_reviews (pharmacy_id, status);

-- d) Private storage bucket (no public policies; all access via pages/api/reviews/* using the service role key)
insert into storage.buckets (id, name, public)
values ('performance-reviews', 'performance-reviews', false)
on conflict (id) do nothing;

-- Check
select column_name, data_type, column_default from information_schema.columns
where table_schema = 'public' and (
  (table_name = 'staff' and column_name in ('can_conduct_reviews', 'exclude_from_reviews'))
  or (table_name = 'pharmacy_settings' and column_name = 'review_comment_window_days')
);
select id, public from storage.buckets where id = 'performance-reviews';
select count(*) as reviews from public.performance_reviews;
