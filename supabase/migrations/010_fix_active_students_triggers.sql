-- Migration: 010_fix_active_students_triggers.sql
--
-- Fixes two bugs in the original trigger (007_sessions.sql):
--   1. No decrement on session DELETE → count climbed during testing
--   2. No decrement when status changes scheduled → completed
--   3. Insert trigger didn't guard against inserting a completed session
--
-- Definition of "active": a user has at least one SCHEDULED session with
-- this teacher. Completed sessions don't count; deleted sessions don't count.

-- ─── Fix insert trigger ───────────────────────────────────────────────────────

create or replace function public.update_active_students_on_insert()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only scheduled sessions make a user "active"
  if new.status != 'scheduled' then
    return new;
  end if;

  -- Increment only if this is the user's first scheduled session with this teacher
  if not exists (
    select 1 from public.sessions
    where teacher_id = new.teacher_id
      and user_id    = new.user_id
      and id        != new.id
      and status     = 'scheduled'
  ) then
    update public.teachers
    set active_students_count = active_students_count + 1
    where id = new.teacher_id;
  end if;

  return new;
end;
$$;

-- ─── Add delete trigger ───────────────────────────────────────────────────────

create or replace function public.update_active_students_on_delete()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only scheduled sessions count toward active
  if old.status != 'scheduled' then
    return old;
  end if;

  -- Decrement only if this was the user's last scheduled session with this teacher
  if not exists (
    select 1 from public.sessions
    where teacher_id = old.teacher_id
      and user_id    = old.user_id
      and id        != old.id
      and status     = 'scheduled'
  ) then
    update public.teachers
    set active_students_count = greatest(0, active_students_count - 1)
    where id = old.teacher_id;
  end if;

  return old;
end;
$$;

create trigger on_session_deleted
  after delete on public.sessions
  for each row execute procedure public.update_active_students_on_delete();

-- ─── Add update trigger (scheduled → completed) ───────────────────────────────

create or replace function public.update_active_students_on_update()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only act when status changes
  if old.status = new.status then
    return new;
  end if;

  -- scheduled → completed: user may no longer be active
  if old.status = 'scheduled' and new.status = 'completed' then
    if not exists (
      select 1 from public.sessions
      where teacher_id = new.teacher_id
        and user_id    = new.user_id
        and id        != new.id
        and status     = 'scheduled'
    ) then
      update public.teachers
      set active_students_count = greatest(0, active_students_count - 1)
      where id = new.teacher_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger on_session_updated
  after update on public.sessions
  for each row execute procedure public.update_active_students_on_update();

-- ─── Recalculate stale counts ─────────────────────────────────────────────────
-- Resets every teacher's count to the true current value based on actual
-- scheduled sessions — fixes any counts that drifted during testing.

update public.teachers t
set active_students_count = (
  select count(distinct s.user_id)
  from public.sessions s
  where s.teacher_id = t.id
    and s.status     = 'scheduled'
);
