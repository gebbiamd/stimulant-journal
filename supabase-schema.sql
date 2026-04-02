create extension if not exists pgcrypto;

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('dose', 'note', 'refill', 'adjustment', 'trt-dose', 'trt-restock', 'trt-adjustment')),
  timestamp timestamptz not null,
  amount numeric,
  tablet_count numeric,
  mg_per_tablet numeric,
  note text not null default '',
  compound_id text,
  compound_name text,
  ml numeric,
  half_life_hours numeric,
  vials numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  medication_name text not null default '',
  dose_unit text not null default 'mg',
  daily_target numeric not null default 40,
  monthly_target numeric not null default 300,
  dose_days_target integer not null default 16,
  monthly_tablets numeric not null default 30,
  mg_per_tablet numeric not null default 10,
  decay_half_life_hours numeric not null default 10,
  vacation_threshold integer not null default 10,
  vacation_dose_threshold numeric not null default 10,
  vacation_frequency_days integer not null default 30,
  openai_relay_url text not null default '',
  openai_model text not null default 'gpt-5.4',
  oura_client_id text not null default '',
  trt_compounds text not null default '[]',
  trt_stock_ml numeric not null default 0,
  trt_stock_vials numeric not null default 0,
  trt_refill_threshold_ml numeric not null default 2,
  trt_planner_schedules text not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.journal_entries enable row level security;
alter table public.user_settings enable row level security;

create table if not exists public.oura_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  token_type text,
  expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.oura_connections enable row level security;

create policy "entries own rows"
on public.journal_entries
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "settings own row"
on public.user_settings
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
