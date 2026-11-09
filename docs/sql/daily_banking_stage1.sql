-- Daily Banking — Stage 1: settings, payment types, database tables. Run in the Supabase SQL editor.
-- Additive only — new pharmacy_settings columns + six new tables. No existing data changed.
-- RLS left OFF (matches the other recent tables). Add to the multi-pharmacy RLS pass:
--   banking_payment_types, daily_takings, daily_takings_tenders, cash_counts, bank_deposits, daily_takings_edits
--
-- How the tills work: Z POS, two tills share one cash drawer, each till has its own EFTPOS terminal (T1, T2).
-- The Z session is closed ~30–60 min before close and T1 / T2 readings taken; the final T1 printout at shop close (T3)
-- belongs to the NEXT day's Z session and is entered by the next day's till-close team.
--   Cash check:   (counted cash − float) vs Z Cash
--   EFTPOS check: T1 + T2 + T3 vs Z EFTPOS
-- Float $300; over/under limit $5 (past it a reason is required).

-- ── a) Settings ──
alter table public.pharmacy_settings add column if not exists banking_float_amount numeric(10,2) default 300;
alter table public.pharmacy_settings add column if not exists banking_variance_limit numeric(10,2) default 5;
update public.pharmacy_settings
set banking_float_amount = coalesce(banking_float_amount, 300),
    banking_variance_limit = coalesce(banking_variance_limit, 5)
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';

-- ── b) Payment types (EFTPOS terminals + Z "Other Payments") ──
create table if not exists public.banking_payment_types (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  key text not null,
  name text not null,
  kind text not null check (kind in ('eftpos', 'other')),
  counts_to_bendigo boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  unique (pharmacy_id, key)
);

insert into public.banking_payment_types (pharmacy_id, key, name, kind, counts_to_bendigo, active, sort_order)
select '81ab394f-d642-4246-b896-e71938b25671'::uuid, v.key, v.name, v.kind, v.bendigo, v.active, v.sort_order
from (values
  ('eftpos_t1',     'EFTPOS T1',              'eftpos', true,  true,  1),
  ('eftpos_t2',     'EFTPOS T2',              'eftpos', true,  true,  2),
  ('eftpos_t3',     'EFTPOS T3 (last night)', 'eftpos', true,  true,  3),
  ('medadvisor',    'MedAdvisor',             'other',  false, true,  4),
  ('loyalty',       'Loyalty',                'other',  false, true,  5),
  ('square_direct', 'Square/Direct',          'other',  false, false, 6)
) as v(key, name, kind, bendigo, active, sort_order)
on conflict (pharmacy_id, key) do nothing;

-- ── f) Bank deposits (created before daily_takings so the link can be added straight after) ──
create table if not exists public.bank_deposits (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  deposit_date date not null,
  amount numeric(12,2) not null,
  note text,
  created_by_staff_id bigint references public.staff(id),
  created_at timestamptz default now()
);

-- ── c) One row per trading day ──
create table if not exists public.daily_takings (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  takings_date date not null,
  status text not null default 'open' check (status in ('open', 'confirmed', 'closed', 'missing')),
  -- from the Z report
  z_cash numeric(12,2),
  z_eftpos numeric(12,2),
  customers int,
  gst_sales numeric(12,2),
  -- from the count
  counted_cash numeric(12,2),          -- all notes and coins counted
  float_amount numeric(10,2),          -- copy of the setting at the time
  cash_takings numeric(12,2),          -- counted cash − float
  -- results
  cash_variance numeric(12,2),         -- cash takings − Z cash (+ over, − under)
  eftpos_variance numeric(12,2),       -- EFTPOS tenders − Z EFTPOS
  variance_reason text,
  -- sign-off (two different people)
  confirmed_by_1 bigint references public.staff(id),
  confirmed_by_2 bigint references public.staff(id),
  confirmed_at timestamptz,
  bank_deposit_id uuid,                -- foreign key added below
  source text not null default 'app' check (source in ('app', 'import')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (pharmacy_id, takings_date),
  check (confirmed_by_1 is distinct from confirmed_by_2 or confirmed_by_2 is null)
);

alter table public.daily_takings drop constraint if exists daily_takings_bank_deposit_id_fkey;
alter table public.daily_takings add constraint daily_takings_bank_deposit_id_fkey
  foreign key (bank_deposit_id) references public.bank_deposits(id) on delete set null;

-- ── d) Tender amounts for the day (EFTPOS T1 / T2 / T3, MedAdvisor, Loyalty …) ──
create table if not exists public.daily_takings_tenders (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  daily_takings_id uuid not null references public.daily_takings(id) on delete cascade,
  payment_type_id uuid not null references public.banking_payment_types(id),
  amount numeric(12,2) not null default 0,
  unique (daily_takings_id, payment_type_id)
);

-- ── e) Cash count by denomination (0.05, 0.10, 0.20, 0.50, 1, 2, 5, 10, 20, 50, 100) ──
create table if not exists public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  daily_takings_id uuid not null references public.daily_takings(id) on delete cascade,
  denomination numeric(6,2) not null,
  quantity int not null default 0,
  unique (daily_takings_id, denomination)
);

-- ── g) Audit log of changes to a day ──
create table if not exists public.daily_takings_edits (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  daily_takings_id uuid not null references public.daily_takings(id) on delete cascade,
  edited_by_staff_id bigint references public.staff(id),
  edited_at timestamptz default now(),
  before jsonb,
  after jsonb,
  reason text
);

-- ── h) Indexes ──
create index if not exists daily_takings_pharmacy_date_idx on public.daily_takings (pharmacy_id, takings_date);
create index if not exists daily_takings_pharmacy_deposit_idx on public.daily_takings (pharmacy_id, bank_deposit_id);

-- Check — expect: 300.00 / 5.00; 6 payment types (Square/Direct inactive); the six tables exist
select banking_float_amount, banking_variance_limit from public.pharmacy_settings
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';
select sort_order, key, name, kind, counts_to_bendigo, active from public.banking_payment_types
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' order by sort_order;
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('banking_payment_types', 'daily_takings', 'daily_takings_tenders', 'cash_counts', 'bank_deposits', 'daily_takings_edits')
order by table_name;
