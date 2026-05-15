-- Migration: 007_sessions.sql

create table public.sessions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  child_id    uuid not null references public.children(id) on delete cascade,
  teacher_id  uuid not null references public.teachers(id) on delete restrict,
  template_id uuid references public.recurrence_templates(id) on delete set null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  price       numeric(8,2) not null check (price >= 0),
  status      text not null default 'scheduled'
              check (status in ('scheduled', 'completed')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,

  -- ends_at must be after starts_at
  constraint ends_after_starts
    check (ends_at > starts_at)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Calendar view: fetch all sessions for a user in a date range
create index idx_sessions_user_date
  on public.sessions(user_id, starts_at);

-- Filter by child
create index idx_sessions_child_date
  on public.sessions(child_id, starts_at);

-- Recurring series: fetch all sessions for a template
create index idx_sessions_template
  on public.sessions(template_id)
  where template_id is not null;

-- ─── Conflict detection index ────────────────────────────────────────────────
-- The key index for crowdsourced conflict detection.
-- Partial index on 'scheduled' only — completed sessions can't conflict.
-- Covers the exact query:
--   WHERE teacher_id = ? AND status = 'scheduled'
--   AND starts_at < $ends_at AND ends_at > $starts_at
create index idx_sessions_conflict
  on public.sessions(teacher_id, starts_at, ends_at)
  where status = 'scheduled';

-- ─── Active students trigger ─────────────────────────────────────────────────
-- Maintains teachers.active_students_count.
-- A teacher's active student count = distinct users with scheduled sessions
-- in the last 90 days. We approximate with +/- on insert/delete for V1.

create or replace function public.update_active_students_on_insert()
returns trigger
language plpgsql
security definer
as $$
declare
  existing_count int;
begin
  -- Only count if this user doesn't already have a session with this teacher
  select count(*) into existing_count
  from public.sessions
  where teacher_id = new.teacher_id
    and user_id = new.user_id
    and id != new.id
    and status = 'scheduled';

  if existing_count = 0 then
    update public.teachers
    set active_students_count = active_students_count + 1
    where id = new.teacher_id;
  end if;

  return new;
end;
$$;

create trigger on_session_created
  after insert on public.sessions
  for each row execute procedure public.update_active_students_on_insert();

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table public.sessions enable row level security;

-- Users can only read their own sessions
create policy "sessions: read own"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "sessions: insert own"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "sessions: update own"
  on public.sessions for update
  using (auth.uid() = user_id);

create policy "sessions: delete own"
  on public.sessions for delete
  using (auth.uid() = user_id);

-- ─── Conflict check RPC ───────────────────────────────────────────────────────
-- Called before logging a session to check if another user has already
-- logged a session with this teacher at an overlapping time.
-- Returns count of conflicting sessions from OTHER users only.
-- Never exposes private session data — just the count.

create or replace function public.check_session_conflict(
  p_teacher_id  uuid,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_user_id     uuid
)
returns table (
  has_conflict              boolean,
  conflicting_user_count    int
)
language sql
security definer
stable
as $$
  select
    count(*) > 0 as has_conflict,
    count(distinct user_id)::int as conflicting_user_count
  from public.sessions
  where teacher_id = p_teacher_id
    and user_id != p_user_id
    and status = 'scheduled'
    and starts_at < p_ends_at
    and ends_at   > p_starts_at;
$$;
