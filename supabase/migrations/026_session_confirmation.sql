-- Migration: 026_session_confirmation.sql
-- Adds teacher_confirmed_at to sessions.
-- Teacher confirms via a SECURITY DEFINER RPC that only touches this one column,
-- preventing teachers from modifying any other session data.

alter table public.sessions
  add column teacher_confirmed_at timestamptz;

-- RPC: confirm_session
-- Idempotent — re-confirming an already-confirmed session is a no-op.
-- Authorization: only the teacher whose profile is linked to the session's teacher_id.

create or replace function confirm_session(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update sessions
  set teacher_confirmed_at = now()
  where id = p_session_id
    and teacher_id in (
      select id from teachers where claimed_by = auth.uid()
    )
    and teacher_confirmed_at is null;
  -- No exception if already confirmed or unauthorized — idempotent & no info leak.
end;
$$;
