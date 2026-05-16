-- Migration: 022_rename_can_manage_teachers.sql
-- Renames is_admin → can_manage_teachers for clarity.
-- The flag controls teacher directory management, not general admin access.
-- Preserves existing values (any user already granted is_admin = true keeps access).

-- Rename the column (preserves all existing values)
alter table public.users rename column is_admin to can_manage_teachers;

-- Drop old policies (they reference the old column name)
drop policy if exists "teachers: admin insert" on public.teachers;
drop policy if exists "teachers: admin update" on public.teachers;
drop policy if exists "teachers: admin delete" on public.teachers;

-- Recreate insert and update policies with new column name
-- (delete is intentionally omitted — teachers are never deleted via the app)
create policy "teachers: trusted insert"
  on public.teachers for insert
  to authenticated
  with check (
    exists (select 1 from public.users where id = auth.uid() and can_manage_teachers = true)
  );

create policy "teachers: trusted update"
  on public.teachers for update
  to authenticated
  using (
    exists (select 1 from public.users where id = auth.uid() and can_manage_teachers = true)
  );
