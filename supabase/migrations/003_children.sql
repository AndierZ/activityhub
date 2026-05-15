-- Migration: 003_children.sql

create table public.children (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  name          text not null,
  date_of_birth date,
  avatar_url    text,
  display_order int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

-- Fast lookup of all children for a user (used on every screen)
create index idx_children_user_id
  on public.children(user_id, display_order);

-- Row Level Security
alter table public.children enable row level security;

create policy "children: read own"
  on public.children for select
  using (auth.uid() = user_id);

create policy "children: insert own"
  on public.children for insert
  with check (auth.uid() = user_id);

create policy "children: update own"
  on public.children for update
  using (auth.uid() = user_id);

create policy "children: delete own"
  on public.children for delete
  using (auth.uid() = user_id);
