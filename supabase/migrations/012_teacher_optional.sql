-- Migration: 012_teacher_optional.sql
-- Allows sessions (and recurrence templates) to be logged without a teacher,
-- enabling free-form calendar use. A new `title` column stores the activity
-- name for teacher-less sessions.

-- ─── Make teacher_id nullable ─────────────────────────────────────────────────

alter table public.sessions
  alter column teacher_id drop not null;

alter table public.recurrence_templates
  alter column teacher_id drop not null;

-- ─── Add title column to sessions ────────────────────────────────────────────
-- Used when teacher_id is null. For teacher-linked sessions the display title
-- is derived from teacher.subject on the frontend, so title stays null there.

alter table public.sessions
  add column title text;

-- ─── Null-guard the active_students triggers ──────────────────────────────────
-- Teacher-less sessions must not touch any teacher's count.

create or replace function public.update_active_students_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.teacher_id is null then return new; end if;
  if new.status != 'scheduled' then return new; end if;
  if not exists (
    select 1 from sessions
    where teacher_id = new.teacher_id and user_id = new.user_id
      and id != new.id and status = 'scheduled'
  ) then
    update teachers set active_students_count = active_students_count + 1
    where id = new.teacher_id;
  end if;
  return new;
end;
$$;

create or replace function public.update_active_students_on_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.teacher_id is null then return old; end if;
  if old.status != 'scheduled' then return old; end if;
  if not exists (
    select 1 from sessions
    where teacher_id = old.teacher_id and user_id = old.user_id
      and id != old.id and status = 'scheduled'
  ) then
    update teachers set active_students_count = greatest(0, active_students_count - 1)
    where id = old.teacher_id;
  end if;
  return old;
end;
$$;

create or replace function public.update_active_students_on_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.teacher_id is null then return new; end if;
  if old.status = new.status then return new; end if;
  if old.status = 'scheduled' and new.status = 'completed' then
    if not exists (
      select 1 from sessions
      where teacher_id = new.teacher_id and user_id = new.user_id
        and id != new.id and status = 'scheduled'
    ) then
      update teachers set active_students_count = greatest(0, active_students_count - 1)
      where id = new.teacher_id;
    end if;
  end if;
  return new;
end;
$$;
