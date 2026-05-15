-- Migration: 006_recurrence_templates.sql
-- Defines a recurring session series.
-- Sessions are materialized upfront (up to 180 days) and linked back here.

create table public.recurrence_templates (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  child_id        uuid not null references public.children(id) on delete cascade,
  teacher_id      uuid not null references public.teachers(id) on delete restrict,
  day_of_week     int not null check (day_of_week between 0 and 6),  -- 0=Sun...6=Sat
  time_of_day     time not null,                                       -- e.g. '15:00:00'
  price           numeric(8,2) not null check (price >= 0),
  recurrence_rule text not null check (recurrence_rule in ('weekly', 'biweekly')),
  start_date      date not null,
  end_date        date not null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,

  -- Enforce 180-day maximum window
  constraint end_date_within_180_days
    check (end_date <= start_date + interval '180 days'),

  -- End must be after start
  constraint end_after_start
    check (end_date > start_date)
);

create index idx_recurrence_templates_user_id
  on public.recurrence_templates(user_id);

create index idx_recurrence_templates_child_teacher
  on public.recurrence_templates(child_id, teacher_id);

-- Row Level Security
alter table public.recurrence_templates enable row level security;

create policy "recurrence_templates: read own"
  on public.recurrence_templates for select
  using (auth.uid() = user_id);

create policy "recurrence_templates: insert own"
  on public.recurrence_templates for insert
  with check (auth.uid() = user_id);

create policy "recurrence_templates: update own"
  on public.recurrence_templates for update
  using (auth.uid() = user_id);

create policy "recurrence_templates: delete own"
  on public.recurrence_templates for delete
  using (auth.uid() = user_id);
