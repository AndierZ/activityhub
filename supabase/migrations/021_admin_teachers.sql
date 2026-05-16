-- Migration: 021_admin_teachers.sql
-- Admin-only teacher management (initial version).
-- Adds is_admin flag to users; locks teacher write operations to admins.
-- NOTE: superseded by 022_rename_can_manage_teachers.sql

alter table public.users add column is_admin boolean not null default false;

-- Drop old open-write policies
drop policy if exists "teachers: insert authenticated" on public.teachers;
drop policy if exists "teachers: update own" on public.teachers;

-- Admin-only write policies
create policy "teachers: admin insert"
  on public.teachers for insert
  to authenticated
  with check (
    exists (select 1 from public.users where id = auth.uid() and is_admin = true)
  );

create policy "teachers: admin update"
  on public.teachers for update
  to authenticated
  using (
    exists (select 1 from public.users where id = auth.uid() and is_admin = true)
  );

create policy "teachers: admin delete"
  on public.teachers for delete
  to authenticated
  using (
    exists (select 1 from public.users where id = auth.uid() and is_admin = true)
  );
