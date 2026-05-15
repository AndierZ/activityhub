-- Migration: 005_user_teachers.sql
-- Links users to their saved/favourite teachers.
-- Row existence = user has saved this teacher.

create table public.user_teachers (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  teacher_id  uuid not null references public.teachers(id) on delete cascade,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,

  -- A user can only save a teacher once
  unique (user_id, teacher_id)
);

create index idx_user_teachers_user_id
  on public.user_teachers(user_id);

create index idx_user_teachers_teacher_id
  on public.user_teachers(teacher_id);

-- Row Level Security
alter table public.user_teachers enable row level security;

create policy "user_teachers: read own"
  on public.user_teachers for select
  using (auth.uid() = user_id);

create policy "user_teachers: insert own"
  on public.user_teachers for insert
  with check (auth.uid() = user_id);

create policy "user_teachers: update own"
  on public.user_teachers for update
  using (auth.uid() = user_id);

create policy "user_teachers: delete own"
  on public.user_teachers for delete
  using (auth.uid() = user_id);

-- ─── Triggers to maintain teachers.favorites_count ────────────────────────────

create or replace function public.increment_teacher_favorites()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.teachers
  set favorites_count = favorites_count + 1
  where id = new.teacher_id;
  return new;
end;
$$;

create trigger on_user_teacher_created
  after insert on public.user_teachers
  for each row execute procedure public.increment_teacher_favorites();

create or replace function public.decrement_teacher_favorites()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.teachers
  set favorites_count = greatest(0, favorites_count - 1)
  where id = old.teacher_id;
  return old;
end;
$$;

create trigger on_user_teacher_deleted
  after delete on public.user_teachers
  for each row execute procedure public.decrement_teacher_favorites();
