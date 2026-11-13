-- Staff memos (replaces staff emails / newsletters) — all stages in one go. 13 Nov 2026.
-- Additive only: 5 new tables, 2 new link columns, 1 storage bucket. Nothing existing changes.
-- New tables for the RLS pass: staff_memos, staff_memo_sections, staff_memo_recipients, staff_memo_seen, staff_memo_policies.
-- Every table has pharmacy_id. Staff ids are bigint (staff.id); documents / events are uuid.

-- 1. The memo
create table if not exists public.staff_memos (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  topics text[] not null default '{}',              -- Procedure change, Accreditation & training, WHS, … (Governance log)
  send_to_roles text[],                               -- null = all active staff; else only these roles
  created_by_staff_id bigint references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by_staff_id bigint references public.staff(id) on delete set null,
  -- Imported from email (Stage 5): no push / seen tracking / kiosk jobs / read requests
  imported boolean not null default false,
  import_kind text,                                   -- e.g. "Staff memo" / "Newsletter"
  import_sent_to text,                                -- the email's "sent to" note
  import_attachments text[] not null default '{}'     -- file names only (files stay in email)
);
create index if not exists staff_memos_pharmacy_status_idx on public.staff_memos (pharmacy_id, status, sent_at desc);

-- 2. Sections (in order). A section asked of a staff member has requested_staff_id; it's theirs to write until Send.
create table if not exists public.staff_memo_sections (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  memo_id uuid not null references public.staff_memos(id) on delete cascade,
  sort_order integer not null default 0,
  heading text,
  body text,                                          -- formatted text (simple Markdown: headings, bullets, bold, links)
  images jsonb not null default '[]',                 -- [{ url, path, name }]
  attachments jsonb not null default '[]',            -- [{ url, path, name }] — PDFs
  author_staff_id bigint references public.staff(id) on delete set null,
  signature_name text,
  signature_role text,
  requested_staff_id bigint references public.staff(id) on delete set null, -- "Ask for a section from…"
  requested_at timestamptz,
  submitted_at timestamptz,                           -- the asked person last saved it
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists staff_memo_sections_memo_idx on public.staff_memo_sections (memo_id, sort_order);
create index if not exists staff_memo_sections_requested_idx on public.staff_memo_sections (pharmacy_id, requested_staff_id);

-- 3. Who it was sent to (snapshot at Send — "Seen by 9 of 12", kiosk / To do jobs)
create table if not exists public.staff_memo_recipients (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  memo_id uuid not null references public.staff_memos(id) on delete cascade,
  staff_id bigint not null references public.staff(id) on delete cascade,
  unique (memo_id, staff_id)
);
create index if not exists staff_memo_recipients_staff_idx on public.staff_memo_recipients (pharmacy_id, staff_id);

-- 4. Seen (opened) — who, when, where
create table if not exists public.staff_memo_seen (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  memo_id uuid not null references public.staff_memos(id) on delete cascade,
  staff_id bigint not null references public.staff(id) on delete cascade,
  seen_at timestamptz not null default now(),
  seen_via text not null check (seen_via in ('kiosk', 'phone')),
  unique (memo_id, staff_id)
);

-- 5. Policies to read (QSPP library documents) — read requests are created on Send by the existing system
create table if not exists public.staff_memo_policies (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  memo_id uuid not null references public.staff_memos(id) on delete cascade,
  document_id uuid not null references public.pharmacy_documents(id) on delete cascade,
  sort_order integer not null default 0,
  unique (memo_id, document_id)
);

-- 6. Links
-- The memo's Wall post (created on Send) — replies / reactions reuse the Wall's
alter table public.kiosk_notes add column if not exists memo_id uuid references public.staff_memos(id) on delete set null;
-- A What's on date added from a memo
alter table public.calendar_events add column if not exists memo_id uuid references public.staff_memos(id) on delete set null;

-- 7. Storage for section images and PDF attachments. Public read (like message-images); uploads only through the
--    app's server route with one-time upload tokens, so no storage policies are needed.
insert into storage.buckets (id, name, public)
values ('staff-memos', 'staff-memos', true)
on conflict (id) do nothing;

-- Check — expect 5 tables, 2 link columns, 1 bucket
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('staff_memos', 'staff_memo_sections', 'staff_memo_recipients', 'staff_memo_seen', 'staff_memo_policies')
order by table_name;
select table_name, column_name from information_schema.columns
where table_schema = 'public' and column_name = 'memo_id' and table_name in ('kiosk_notes', 'calendar_events');
select id, public from storage.buckets where id = 'staff-memos';
