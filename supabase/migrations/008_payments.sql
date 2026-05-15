-- Migration: 008_payments.sql

create table public.payments (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  child_id    uuid not null references public.children(id) on delete cascade,
  teacher_id  uuid not null references public.teachers(id) on delete restrict,
  -- Positive = session charge (you owe this)
  -- Negative = payment made (you paid this)
  amount      numeric(8,2) not null,
  date        date not null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- Fast lookup for statement view and balance calculation
create index idx_payments_user_teacher_child
  on public.payments(user_id, teacher_id, child_id, date);

-- Row Level Security
alter table public.payments enable row level security;

create policy "payments: read own"
  on public.payments for select
  using (auth.uid() = user_id);

create policy "payments: insert own"
  on public.payments for insert
  with check (auth.uid() = user_id);

create policy "payments: update own"
  on public.payments for update
  using (auth.uid() = user_id);

create policy "payments: delete own"
  on public.payments for delete
  using (auth.uid() = user_id);

-- ─── Balance RPC ──────────────────────────────────────────────────────────────
-- Computes the net balance for a child + teacher combination.
-- balance > 0 = parent owes money
-- balance < 0 = parent has credit
-- balance = 0 = settled

create or replace function public.get_balance(
  p_user_id    uuid,
  p_child_id   uuid,
  p_teacher_id uuid
)
returns table (
  total_owed  numeric,   -- sum of completed session prices
  total_paid  numeric,   -- sum of payments (as positive)
  balance     numeric    -- total_owed - total_paid
)
language sql
security definer
stable
as $$
  select
    coalesce(
      (select sum(s.price)
       from public.sessions s
       where s.user_id    = p_user_id
         and s.child_id   = p_child_id
         and s.teacher_id = p_teacher_id
         and s.status     = 'completed'),
      0
    ) as total_owed,

    coalesce(
      (select sum(-p.amount)
       from public.payments p
       where p.user_id    = p_user_id
         and p.child_id   = p_child_id
         and p.teacher_id = p_teacher_id
         and p.amount     < 0),
      0
    ) as total_paid,

    coalesce(
      (select sum(s.price)
       from public.sessions s
       where s.user_id    = p_user_id
         and s.child_id   = p_child_id
         and s.teacher_id = p_teacher_id
         and s.status     = 'completed'),
      0
    )
    +
    coalesce(
      (select sum(p.amount)
       from public.payments p
       where p.user_id    = p_user_id
         and p.child_id   = p_child_id
         and p.teacher_id = p_teacher_id),
      0
    ) as balance;
$$;

-- ─── Monthly Statement RPC ────────────────────────────────────────────────────
-- Returns all entries (sessions + payments) for a given month,
-- interleaved chronologically, with running balance.

create or replace function public.get_monthly_statement(
  p_user_id    uuid,
  p_child_id   uuid,
  p_teacher_id uuid,
  p_year       int,
  p_month      int
)
returns table (
  id              uuid,
  entry_date      date,
  entry_type      text,    -- 'session' | 'payment'
  description     text,
  note            text,
  amount          numeric,
  running_balance numeric
)
language sql
security definer
stable
as $$
  with entries as (
    -- Completed sessions in this month (positive amounts = charges)
    select
      s.id,
      s.starts_at::date      as entry_date,
      'session'              as entry_type,
      'Session · ' || t.name as description,
      s.notes                as note,
      s.price                as amount
    from public.sessions s
    join public.teachers t on t.id = s.teacher_id
    where s.user_id    = p_user_id
      and s.child_id   = p_child_id
      and s.teacher_id = p_teacher_id
      and s.status     = 'completed'
      and extract(year  from s.starts_at) = p_year
      and extract(month from s.starts_at) = p_month

    union all

    -- Payments in this month (negative amounts = credits)
    select
      p.id,
      p.date                 as entry_date,
      'payment'              as entry_type,
      case
        when p.amount < 0 then 'Payment made'
        else 'Session charge'
      end                    as description,
      p.note                 as note,
      p.amount               as amount
    from public.payments p
    where p.user_id    = p_user_id
      and p.child_id   = p_child_id
      and p.teacher_id = p_teacher_id
      and extract(year  from p.date) = p_year
      and extract(month from p.date) = p_month
  ),
  -- Calculate opening balance (everything before this month)
  opening as (
    select
      coalesce(sum(s.price), 0) +
      coalesce(
        (select sum(p2.amount)
         from public.payments p2
         where p2.user_id    = p_user_id
           and p2.child_id   = p_child_id
           and p2.teacher_id = p_teacher_id
           and p2.date < make_date(p_year, p_month, 1)),
        0
      ) as opening_balance
    from public.sessions s
    where s.user_id    = p_user_id
      and s.child_id   = p_child_id
      and s.teacher_id = p_teacher_id
      and s.status     = 'completed'
      and s.starts_at < make_date(p_year, p_month, 1)::timestamptz
  )
  select
    e.id,
    e.entry_date,
    e.entry_type,
    e.description,
    e.note,
    e.amount,
    -- Running balance: opening balance + cumulative sum of entries to this point
    (select opening_balance from opening) +
    sum(e.amount) over (
      order by e.entry_date, e.entry_type desc  -- sessions before payments on same day
      rows between unbounded preceding and current row
    ) as running_balance
  from entries e
  order by e.entry_date, e.entry_type desc;
$$;
