-- Migration: 002_users.sql
-- Public user profiles, extending Supabase Auth users.
-- auth.users is managed by Supabase — we extend it with a public profile.

create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

-- Index for fast lookup by email (e.g. teacher matching)
create index idx_users_email on public.users(email);

-- Row Level Security
alter table public.users enable row level security;

-- Users can only read and write their own profile
create policy "users: read own"
  on public.users for select
  using (auth.uid() = id);

create policy "users: update own"
  on public.users for update
  using (auth.uid() = id);

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
