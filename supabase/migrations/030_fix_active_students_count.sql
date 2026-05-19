-- Migration: 030_fix_active_students_count.sql
--
-- active_students_count is shown as "students", so it should count distinct
-- children with scheduled sessions for a teacher, not distinct parent accounts.
-- Recompute instead of +/- mutations so edits, status changes, and deletes
-- cannot leave the denormalized count stale.

create or replace function public.recalculate_teacher_active_students(p_teacher_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update teachers t
  set active_students_count = (
    select count(distinct s.child_id)::int
    from sessions s
    where s.teacher_id = p_teacher_id
      and s.status = 'scheduled'
  )
  where t.id = p_teacher_id;
$$;

create or replace function public.update_active_students_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.teacher_id is not null then
    perform recalculate_teacher_active_students(new.teacher_id);
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
  if old.teacher_id is not null then
    perform recalculate_teacher_active_students(old.teacher_id);
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
  if old.teacher_id is not null then
    perform recalculate_teacher_active_students(old.teacher_id);
  end if;

  if new.teacher_id is not null and new.teacher_id is distinct from old.teacher_id then
    perform recalculate_teacher_active_students(new.teacher_id);
  end if;

  return new;
end;
$$;

update public.teachers t
set active_students_count = (
  select count(distinct s.child_id)::int
  from public.sessions s
  where s.teacher_id = t.id
    and s.status = 'scheduled'
);
