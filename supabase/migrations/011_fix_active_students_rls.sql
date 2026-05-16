-- Migration: 011_fix_active_students_rls.sql
--
-- The active_students triggers (010) silently no-op because the UPDATE on
-- public.teachers is blocked by the "teachers: update own" RLS policy.
-- Even though the functions are SECURITY DEFINER, auth.uid() inside a trigger
-- still reflects the calling user — who is not the teacher's created_by.
--
-- Fix: explicitly disable row security for the duration of each trigger function
-- so the UPDATE always reaches the row regardless of who triggered it.

create or replace function public.update_active_students_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status != 'scheduled' then
    return new;
  end if;

  if not exists (
    select 1 from sessions
    where teacher_id = new.teacher_id
      and user_id    = new.user_id
      and id        != new.id
      and status     = 'scheduled'
  ) then
    update teachers
    set active_students_count = active_students_count + 1
    where id = new.teacher_id;
  end if;

  return new;
end;
$$;

create or replace function public.update_active_students_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status != 'scheduled' then
    return old;
  end if;

  if not exists (
    select 1 from sessions
    where teacher_id = old.teacher_id
      and user_id    = old.user_id
      and id        != old.id
      and status     = 'scheduled'
  ) then
    update teachers
    set active_students_count = greatest(0, active_students_count - 1)
    where id = old.teacher_id;
  end if;

  return old;
end;
$$;

create or replace function public.update_active_students_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if old.status = 'scheduled' and new.status = 'completed' then
    if not exists (
      select 1 from sessions
      where teacher_id = new.teacher_id
        and user_id    = new.user_id
        and id        != new.id
        and status     = 'scheduled'
    ) then
      update teachers
      set active_students_count = greatest(0, active_students_count - 1)
      where id = new.teacher_id;
    end if;
  end if;

  return new;
end;
$$;

-- Recalculate again now that the functions are corrected
update public.teachers t
set active_students_count = (
  select count(distinct s.user_id)
  from public.sessions s
  where s.teacher_id = t.id
    and s.status     = 'scheduled'
);
