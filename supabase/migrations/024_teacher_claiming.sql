-- Migration: 024_teacher_claiming.sql
-- Enables teachers to claim their profile via an invite link.
-- Extends invitations table, adds teacher-scoped RLS, and adds two RPCs.

-- ─── 1. Extend invitations ────────────────────────────────────────────────────

alter table public.invitations
  add column invitation_type text not null default 'partner'
    check (invitation_type in ('partner', 'teacher')),
  add column teacher_id uuid references public.teachers(id) on delete cascade;

-- ─── 2. RLS: teacher read access ──────────────────────────────────────────────

-- Sessions: teacher can read all sessions logged under their profile
create policy "sessions: teacher can read"
  on public.sessions for select to authenticated
  using (
    teacher_id in (
      select id from public.teachers where claimed_by = auth.uid()
    )
  );

-- Payments: teacher can read all payments logged against their profile
create policy "payments: teacher can read"
  on public.payments for select to authenticated
  using (
    teacher_id in (
      select id from public.teachers where claimed_by = auth.uid()
    )
  );

-- Children: teacher can read names of children who have sessions with them
create policy "children: teacher can read their students"
  on public.children for select to authenticated
  using (
    id in (
      select child_id from public.sessions
      where teacher_id in (
        select id from public.teachers where claimed_by = auth.uid()
      )
    )
  );

-- ─── 3. Update validate_invitation ───────────────────────────────────────────
-- Must drop and recreate to change the return-type columns.

drop function if exists validate_invitation(uuid);

create function validate_invitation(p_token uuid)
returns table (
  valid            boolean,
  reason           text,
  inviter_name     text,
  inviter_email    text,
  invitation_type  text,
  teacher_name     text,
  teacher_subject  text
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_inv     invitations%rowtype;
  v_user    users%rowtype;
  v_teacher teachers%rowtype;
begin
  select * into v_inv from invitations where token = p_token;

  if not found then
    return query select false, 'not_found'::text, null::text, null::text, null::text, null::text, null::text; return;
  end if;
  if v_inv.expires_at < now() then
    return query select false, 'expired'::text,   null::text, null::text, null::text, null::text, null::text; return;
  end if;
  if v_inv.accepted_at is not null then
    return query select false, 'used'::text,      null::text, null::text, null::text, null::text, null::text; return;
  end if;

  select * into v_user from users where id = v_inv.inviter_user_id;

  if v_inv.invitation_type = 'teacher' and v_inv.teacher_id is not null then
    select * into v_teacher from teachers where id = v_inv.teacher_id;
    return query select
      true, 'valid'::text,
      v_user.full_name, v_user.email,
      v_inv.invitation_type,
      v_teacher.name, v_teacher.subject;
  else
    return query select
      true, 'valid'::text,
      v_user.full_name, v_user.email,
      coalesce(v_inv.invitation_type, 'partner'),
      null::text, null::text;
  end if;
end;
$$;

-- Re-grant anon execute (dropped with the function)
grant execute on function validate_invitation(uuid) to anon;

-- ─── 4. New RPC: accept_teacher_invitation ────────────────────────────────────
-- Sets teachers.claimed_by = auth.uid(); marks invite used. Atomic + race-safe.

create function accept_teacher_invitation(p_token uuid)
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
  if v_inv.invitation_type != 'teacher' then
    raise exception 'This is not a teacher invitation';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'Invitation has expired';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'Invitation has already been used';
  end if;
  if v_inv.teacher_id is null then
    raise exception 'Invalid teacher invitation — no teacher linked';
  end if;
  if exists (
    select 1 from teachers where id = v_inv.teacher_id and claimed_by is not null
  ) then
    raise exception 'This teacher profile has already been claimed by someone else';
  end if;

  update teachers
    set claimed_by = v_accepting_user_id, updated_at = now()
    where id = v_inv.teacher_id;

  update invitations
    set accepted_at = now(), accepted_by_user_id = v_accepting_user_id
    where id = v_inv.id;
end;
$$;
