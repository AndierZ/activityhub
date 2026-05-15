-- Migration: 004_teachers.sql
-- Shared community directory — not owned by any single user.

create table public.teachers (
  id                    uuid primary key default uuid_generate_v4(),
  name                  text not null,
  subject               text not null,
  location              text,
  email                 text,
  phone                 text,
  -- V2: teacher claims their profile when they join the platform
  claimed_by            uuid references public.users(id) on delete set null,
  verified              boolean not null default false,
  -- Who first added this teacher to the directory
  created_by            uuid not null references public.users(id) on delete restrict,
  -- Denormalized counts — maintained by triggers for fast card rendering
  favorites_count       int not null default 0,
  active_students_count int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz
);

-- Search index — full text search on name and subject
create index idx_teachers_name on public.teachers
  using gin(to_tsvector('english', name || ' ' || subject));

-- Lookup by email for the Venmo-style teacher linking
create index idx_teachers_email on public.teachers(email)
  where email is not null;

-- Row Level Security
alter table public.teachers enable row level security;

-- Everyone (authenticated) can read the community directory
create policy "teachers: read all"
  on public.teachers for select
  to authenticated
  using (true);

-- Any authenticated user can add a teacher to the directory
create policy "teachers: insert authenticated"
  on public.teachers for insert
  to authenticated
  with check (auth.uid() = created_by);

-- Only the teacher who claimed the profile (or the creator) can update
-- This will expand in V2 when teachers have their own auth
create policy "teachers: update own"
  on public.teachers for update
  using (
    auth.uid() = created_by
    or auth.uid() = claimed_by
  );
