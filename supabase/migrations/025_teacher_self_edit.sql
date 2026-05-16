-- Migration: 025_teacher_self_edit.sql
-- Allows a claimed teacher to update their own profile fields via a
-- SECURITY DEFINER RPC (restricts editable columns to safe fields only —
-- claimed_by and verified remain immutable from the teacher's side).

create or replace function update_claimed_teacher_profile(
  p_name     text,
  p_subject  text,
  p_location text,
  p_email    text,
  p_phone    text
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update teachers
  set
    name       = trim(p_name),
    subject    = trim(p_subject),
    location   = nullif(trim(p_location), ''),
    email      = nullif(trim(p_email), ''),
    phone      = nullif(trim(p_phone), ''),
    updated_at = now()
  where claimed_by = auth.uid();

  if not found then
    raise exception 'No claimed teacher profile found for this user';
  end if;
end;
$$;
