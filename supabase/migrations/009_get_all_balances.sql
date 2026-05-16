-- Migration: 009_get_all_balances.sql
-- Single-query replacement for N parallel get_balance() calls.
-- Returns only the fields the Payments UI actually uses — 1 round trip, no over-fetching.

create or replace function public.get_all_balances(
  p_user_id uuid
)
returns table (
  child_id            uuid,
  child_name          text,
  child_display_order integer,
  teacher_id          uuid,
  teacher_name        text,
  teacher_subject     text,
  total_paid          numeric,
  balance             numeric
)
language sql
security definer
stable
as $$
  with session_totals as (
    select
      child_id,
      teacher_id,
      sum(price) as total_owed
    from public.sessions
    where user_id = p_user_id
      and status  = 'completed'
    group by child_id, teacher_id
  ),
  payment_totals as (
    select
      child_id,
      teacher_id,
      coalesce(sum(-amount) filter (where amount < 0), 0) as total_paid,
      coalesce(sum(amount), 0)                            as payment_sum
    from public.payments
    where user_id = p_user_id
    group by child_id, teacher_id
  ),
  combos as (
    select child_id, teacher_id from session_totals
    union
    select child_id, teacher_id from payment_totals
  )
  select
    ch.id,
    ch.name,
    ch.display_order,
    te.id,
    te.name,
    te.subject,
    coalesce(p.total_paid,  0)                               as total_paid,
    coalesce(s.total_owed,  0) + coalesce(p.payment_sum, 0) as balance
  from combos c
  left join session_totals s using (child_id, teacher_id)
  left join payment_totals p using (child_id, teacher_id)
  join public.children ch on ch.id = c.child_id
  join public.teachers  te on te.id = c.teacher_id;
$$;
