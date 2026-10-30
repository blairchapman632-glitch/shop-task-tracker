-- Stage 3 (QSPP 1.2, 1.4, 2.6, 2.8, 3.1, 4.3, 4.5, 4.6, 4.7): Other training records — courses, in-house sessions and
-- drills beyond S2/S3 hours and policy reads. These do NOT count towards S2/S3 hours (separate from training_records).
-- Additive only: three new tables + the starting topic list. RLS left OFF like the rest of the app — add
-- training_topics, other_training, other_training_attendees to the RLS pass.
-- Attachments go in the existing private training-certificates bucket (under other/…), opened with signed links.
-- Run in the Supabase SQL editor.

-- a) Topic list (config, not code — managers edit it in /qspp → Training overview → Training topics)
create table if not exists public.training_topics (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists training_topics_pharmacy_idx on public.training_topics (pharmacy_id, sort_order);

-- b) One record per course / session / drill (a group session = one record with many attendees)
create table if not exists public.other_training (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  topic_id uuid references public.training_topics(id) on delete set null,
  topic text not null,                          -- topic name as recorded (or the "Other" free text) — kept if the topic is renamed / removed
  kind text not null check (kind in ('course', 'inhouse', 'drill')),   -- Course / In-house session / Drill
  training_date date not null,
  provider text,                                -- provider / presenter (optional)
  duration_hours numeric check (duration_hours is null or duration_hours >= 0),
  outcome text,                                 -- outcome / notes (drills: what happened, anything to improve)
  attachment_path text,                         -- training-certificates bucket (private)
  attachment_name text,
  created_by_staff_id bigint references public.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists other_training_pharmacy_idx on public.other_training (pharmacy_id, training_date desc);

-- c) Attendees
create table if not exists public.other_training_attendees (
  training_id uuid not null references public.other_training(id) on delete cascade,
  staff_id bigint not null references public.staff(id),
  pharmacy_id uuid not null,
  primary key (training_id, staff_id)
);
create index if not exists other_training_attendees_staff_idx on public.other_training_attendees (staff_id);

-- d) Starting topics for Byford (skipped if it already has any)
insert into public.training_topics (pharmacy_id, name, sort_order)
select '81ab394f-d642-4246-b896-e71938b25671'::uuid, v.name, v.sort_order
from (values
  ('Infection control & hand hygiene', 10),
  ('Open disclosure', 20),
  ('Incident reporting', 30),
  ('Risk management', 40),
  ('Work health & safety', 50),
  ('Manual handling', 60),
  ('Fire / evacuation drill', 70),
  ('First aid equipment (defib, anaphylaxis kit)', 80),
  ('Business continuity plan', 90),
  ('IT & cyber security', 100),
  ('Privacy & records', 110),
  ('Advertising compliance', 120),
  ('Cultural awareness & inclusion', 130),
  ('De-escalation / difficult situations', 140),
  ('Other', 1000)
) as v(name, sort_order)
where not exists (select 1 from public.training_topics where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671');

-- Check: 15 topics (Other last); the two record tables exist and are empty
select name, sort_order from public.training_topics
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' order by sort_order;
select (select count(*) from public.other_training) as training_rows,
       (select count(*) from public.other_training_attendees) as attendee_rows;
