-- ─── invitations ─────────────────────────────────────────────────────────────

create table invitations (
  id                  uuid primary key default gen_random_uuid(),
  token               uuid unique not null default gen_random_uuid(),
  inviter_user_id     uuid not null references users(id) on delete cascade,
  expires_at          timestamptz not null default now() + interval '7 days',
  accepted_at         timestamptz,
  accepted_by_user_id uuid references users(id) on delete set null,
  created_at          timestamptz not null default now()
);

alter table invitations enable row level security;

-- Inviter manages their own pending invitations
create policy "invitations: read own"
  on invitations for select to authenticated
  using (auth.uid() = inviter_user_id);

create policy "invitations: insert own"
  on invitations for insert to authenticated
  with check (auth.uid() = inviter_user_id);

create policy "invitations: delete own"
  on invitations for delete to authenticated
  using (auth.uid() = inviter_user_id);

-- ─── user_links ───────────────────────────────────────────────────────────────

create table user_links (
  id              uuid primary key default gen_random_uuid(),
  primary_user_id uuid not null references users(id) on delete cascade,
  linked_user_id  uuid unique not null references users(id) on delete cascade,
  created_at      timestamptz not null default now()
);

alter table user_links enable row level security;

-- Both sides can see the connection; only the primary can delete it
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
-- Returns the primary user's id if this session belongs to a linked user,
-- otherwise returns auth.uid() as-is.  Used in all data-table RLS policies.

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
drop policy "children: read own"   on children;
drop policy "children: insert own" on children;
drop policy "children: update own" on children;
drop policy "children: delete own" on children;

create policy "children: read own"   on children for select to authenticated using (effective_user_id() = user_id);
create policy "children: insert own" on children for insert to authenticated with check (effective_user_id() = user_id);
create policy "children: update own" on children for update to authenticated using (effective_user_id() = user_id);
create policy "children: delete own" on children for delete to authenticated using (effective_user_id() = user_id);

-- sessions
drop policy "sessions: read own"   on sessions;
drop policy "sessions: insert own" on sessions;
drop policy "sessions: update own" on sessions;
drop policy "sessions: delete own" on sessions;

create policy "sessions: read own"   on sessions for select to authenticated using (effective_user_id() = user_id);
create policy "sessions: insert own" on sessions for insert to authenticated with check (effective_user_id() = user_id);
create policy "sessions: update own" on sessions for update to authenticated using (effective_user_id() = user_id);
create policy "sessions: delete own" on sessions for delete to authenticated using (effective_user_id() = user_id);

-- recurrence_templates
drop policy "recurrence_templates: read own"   on recurrence_templates;
drop policy "recurrence_templates: insert own" on recurrence_templates;
drop policy "recurrence_templates: update own" on recurrence_templates;
drop policy "recurrence_templates: delete own" on recurrence_templates;

create policy "recurrence_templates: read own"   on recurrence_templates for select to authenticated using (effective_user_id() = user_id);
create policy "recurrence_templates: insert own" on recurrence_templates for insert to authenticated with check (effective_user_id() = user_id);
create policy "recurrence_templates: update own" on recurrence_templates for update to authenticated using (effective_user_id() = user_id);
create policy "recurrence_templates: delete own" on recurrence_templates for delete to authenticated using (effective_user_id() = user_id);

-- payments
drop policy "payments: read own"   on payments;
drop policy "payments: insert own" on payments;
drop policy "payments: update own" on payments;
drop policy "payments: delete own" on payments;

create policy "payments: read own"   on payments for select to authenticated using (effective_user_id() = user_id);
create policy "payments: insert own" on payments for insert to authenticated with check (effective_user_id() = user_id);
create policy "payments: update own" on payments for update to authenticated using (effective_user_id() = user_id);
create policy "payments: delete own" on payments for delete to authenticated using (effective_user_id() = user_id);

-- user_teachers
drop policy "user_teachers: read own"   on user_teachers;
drop policy "user_teachers: insert own" on user_teachers;
drop policy "user_teachers: update own" on user_teachers;
drop policy "user_teachers: delete own" on user_teachers;

create policy "user_teachers: read own"   on user_teachers for select to authenticated using (effective_user_id() = user_id);
create policy "user_teachers: insert own" on user_teachers for insert to authenticated with check (effective_user_id() = user_id);
create policy "user_teachers: update own" on user_teachers for update to authenticated using (effective_user_id() = user_id);
create policy "user_teachers: delete own" on user_teachers for delete to authenticated using (effective_user_id() = user_id);

-- users: allow reading profiles of people you are linked with
drop policy "users: read own" on users;

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

-- ─── RPC: validate_invitation ─────────────────────────────────────────────────
-- Callable without auth — returns inviter details if the token is valid.

create or replace function validate_invitation(p_token uuid)
returns table (valid boolean, reason text, inviter_name text, inviter_email text)
language plpgsql security definer
set search_path = public
as $$
declare
  v_inv  invitations%rowtype;
  v_user users%rowtype;
begin
  select * into v_inv from invitations where token = p_token;

  if not found then
    return query select false, 'not_found'::text, null::text, null::text; return;
  end if;
  if v_inv.expires_at < now() then
    return query select false, 'expired'::text,   null::text, null::text; return;
  end if;
  if v_inv.accepted_at is not null then
    return query select false, 'used'::text,      null::text, null::text; return;
  end if;

  select * into v_user from users where id = v_inv.inviter_user_id;
  return query select true, 'valid'::text, v_user.full_name, v_user.email;
end;
$$;

-- ─── RPC: get_user_data_summary ───────────────────────────────────────────────
-- Returns count of children + sessions owned by a user (to warn before linking).

create or replace function get_user_data_summary(p_user_id uuid)
returns table (children_count bigint, sessions_count bigint)
language sql security definer
set search_path = public
as $$
  select
    (select count(*) from children where user_id = p_user_id),
    (select count(*) from sessions where user_id = p_user_id);
$$;

-- ─── RPC: accept_invitation ───────────────────────────────────────────────────
-- Must be called by an authenticated user.  Validates the token, enforces
-- "one primary per linked user", creates the user_link, marks the invite used.

create or replace function accept_invitation(p_token uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_inv               invitations%rowtype;
  v_accepting_user_id uuid := auth.uid();
begin
  select * into v_inv from invitations where token = p_token for update;

  if not found then
    raise exception 'Invitation not found';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'Invitation has expired';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'Invitation has already been used';
  end if;
  if v_inv.inviter_user_id = v_accepting_user_id then
    raise exception 'Cannot accept your own invitation';
  end if;
  if exists (select 1 from user_links where linked_user_id = v_accepting_user_id) then
    raise exception 'Already linked to another account';
  end if;

  insert into user_links (primary_user_id, linked_user_id)
  values (v_inv.inviter_user_id, v_accepting_user_id);

  update invitations
  set accepted_at = now(), accepted_by_user_id = v_accepting_user_id
  where id = v_inv.id;
end;
$$;
