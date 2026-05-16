-- Migration 014 only partially applied — user_links table and effective_user_id()
-- function were never created.  This migration adds the missing pieces.

-- ─── user_links ───────────────────────────────────────────────────────────────

create table if not exists user_links (
  id              uuid primary key default gen_random_uuid(),
  primary_user_id uuid not null references users(id) on delete cascade,
  linked_user_id  uuid unique not null references users(id) on delete cascade,
  created_at      timestamptz not null default now()
);

alter table user_links enable row level security;

drop policy if exists "user_links: read own"             on user_links;
drop policy if exists "user_links: insert own"           on user_links;
drop policy if exists "user_links: primary can delete"   on user_links;

create policy "user_links: read own"
  on user_links for select to authenticated
  using (auth.uid() = primary_user_id or auth.uid() = linked_user_id);

create policy "user_links: insert own"
  on user_links for insert to authenticated
  with check (auth.uid() = primary_user_id);

create policy "user_links: primary can delete"
  on user_links for delete to authenticated
  using (auth.uid() = primary_user_id);

-- ─── effective_user_id() ─────────────────────────────────────────────────────

create or replace function effective_user_id()
returns uuid
language sql security definer stable
set search_path = public
as $$
  select coalesce(
    (select primary_user_id from user_links where linked_user_id = auth.uid() limit 1),
    auth.uid()
  )
$$;

-- ─── Update RLS on data tables to honour linked users ─────────────────────────

-- children
drop policy if exists "children: read own"   on children;
drop policy if exists "children: insert own" on children;
drop policy if exists "children: update own" on children;
drop policy if exists "children: delete own" on children;

create policy "children: read own"   on children for select to authenticated using (effective_user_id() = user_id);
create policy "children: insert own" on children for insert to authenticated with check (effective_user_id() = user_id);
create policy "children: update own" on children for update to authenticated using (effective_user_id() = user_id);
create policy "children: delete own" on children for delete to authenticated using (effective_user_id() = user_id);

-- sessions
drop policy if exists "sessions: read own"   on sessions;
drop policy if exists "sessions: insert own" on sessions;
drop policy if exists "sessions: update own" on sessions;
drop policy if exists "sessions: delete own" on sessions;

create policy "sessions: read own"   on sessions for select to authenticated using (effective_user_id() = user_id);
create policy "sessions: insert own" on sessions for insert to authenticated with check (effective_user_id() = user_id);
create policy "sessions: update own" on sessions for update to authenticated using (effective_user_id() = user_id);
create policy "sessions: delete own" on sessions for delete to authenticated using (effective_user_id() = user_id);

-- recurrence_templates
drop policy if exists "recurrence_templates: read own"   on recurrence_templates;
drop policy if exists "recurrence_templates: insert own" on recurrence_templates;
drop policy if exists "recurrence_templates: update own" on recurrence_templates;
drop policy if exists "recurrence_templates: delete own" on recurrence_templates;

create policy "recurrence_templates: read own"   on recurrence_templates for select to authenticated using (effective_user_id() = user_id);
create policy "recurrence_templates: insert own" on recurrence_templates for insert to authenticated with check (effective_user_id() = user_id);
create policy "recurrence_templates: update own" on recurrence_templates for update to authenticated using (effective_user_id() = user_id);
create policy "recurrence_templates: delete own" on recurrence_templates for delete to authenticated using (effective_user_id() = user_id);

-- payments
drop policy if exists "payments: read own"   on payments;
drop policy if exists "payments: insert own" on payments;
drop policy if exists "payments: update own" on payments;
drop policy if exists "payments: delete own" on payments;

create policy "payments: read own"   on payments for select to authenticated using (effective_user_id() = user_id);
create policy "payments: insert own" on payments for insert to authenticated with check (effective_user_id() = user_id);
create policy "payments: update own" on payments for update to authenticated using (effective_user_id() = user_id);
create policy "payments: delete own" on payments for delete to authenticated using (effective_user_id() = user_id);

-- user_teachers
drop policy if exists "user_teachers: read own"   on user_teachers;
drop policy if exists "user_teachers: insert own" on user_teachers;
drop policy if exists "user_teachers: update own" on user_teachers;
drop policy if exists "user_teachers: delete own" on user_teachers;

create policy "user_teachers: read own"   on user_teachers for select to authenticated using (effective_user_id() = user_id);
create policy "user_teachers: insert own" on user_teachers for insert to authenticated with check (effective_user_id() = user_id);
create policy "user_teachers: update own" on user_teachers for update to authenticated using (effective_user_id() = user_id);
create policy "user_teachers: delete own" on user_teachers for delete to authenticated using (effective_user_id() = user_id);

-- users: allow reading profiles of linked accounts
drop policy if exists "users: read own"            on users;
drop policy if exists "users: read own or linked"  on users;

create policy "users: read own or linked"
  on users for select to authenticated
  using (
    auth.uid() = id
    or exists (
      select 1 from user_links
      where (user_links.primary_user_id = auth.uid() and user_links.linked_user_id = users.id)
         or (user_links.linked_user_id  = auth.uid() and user_links.primary_user_id = users.id)
    )
  );
