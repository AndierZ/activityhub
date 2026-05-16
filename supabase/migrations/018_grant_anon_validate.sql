-- Ensure all three sharing RPCs exist (idempotent — safe to re-run if 014 partially applied),
-- then grant anon execute on validate_invitation so the join page works before login.

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

create or replace function get_user_data_summary(p_user_id uuid)
returns table (children_count bigint, sessions_count bigint)
language sql security definer
set search_path = public
as $$
  select
    (select count(*) from children where user_id = p_user_id),
    (select count(*) from sessions where user_id = p_user_id);
$$;

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

grant execute on function validate_invitation(uuid) to anon;
