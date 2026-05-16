-- Migration: 027_teacher_student_balances.sql
-- Per-student balance summary for a claimed teacher.
-- Same formula as get_all_balances but pivoted: filter by teacher_id, group by (user_id, child_id).
-- Authorization guard via CROSS JOIN with auth_ok CTE — returns no rows if caller didn't claim this teacher.

create or replace function public.get_teacher_student_balances(
  p_teacher_id uuid
)
returns table (
  user_id    uuid,
  child_id   uuid,
  child_name text,
  total_paid numeric,
  balance    numeric
)
language sql
security definer
stable
as $$
  with
  auth_ok as (
    select 1 from public.teachers
    where id = p_teacher_id
      and claimed_by = auth.uid()
  ),
  session_totals as (
    select s.user_id, s.child_id, sum(s.price) as total_owed
    from public.sessions s, auth_ok
    where s.teacher_id = p_teacher_id
      and s.status     = 'completed'
    group by s.user_id, s.child_id
  ),
  payment_totals as (
    select
      p.user_id,
      p.child_id,
      coalesce(sum(-p.amount) filter (where p.amount < 0), 0) as total_paid,
      coalesce(sum(p.amount), 0)                              as payment_sum
    from public.payments p, auth_ok
    where p.teacher_id = p_teacher_id
    group by p.user_id, p.child_id
  ),
  combos as (
    select user_id, child_id from session_totals
    union
    select user_id, child_id from payment_totals
  )
  select
    c.user_id,
    ch.id,
    ch.name,
    coalesce(pt.total_paid,  0)                                as total_paid,
    coalesce(st.total_owed,  0) + coalesce(pt.payment_sum, 0) as balance
  from combos c
  left join session_totals st using (user_id, child_id)
  left join payment_totals pt using (user_id, child_id)
  join public.children ch on ch.id = c.child_id
  order by ch.name;
$$;

grant execute on function public.get_teacher_student_balances(uuid) to authenticated;
