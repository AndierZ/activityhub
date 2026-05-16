-- Migration: 028_unconfirm_session.sql
-- Allows a teacher to retract their confirmation (sets teacher_confirmed_at back to null).

create or replace function unconfirm_session(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update sessions
  set teacher_confirmed_at = null
  where id = p_session_id
    and teacher_id in (
      select id from teachers where claimed_by = auth.uid()
    );
end;
$$;
