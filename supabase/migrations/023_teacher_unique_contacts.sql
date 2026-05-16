-- Migration: 023_teacher_unique_contacts.sql
-- Enforce uniqueness on teacher contact fields used for deduplication and V2 claiming.
-- Partial unique indexes allow multiple NULLs (teachers without email/phone are unaffected).

create unique index idx_teachers_email_unique
  on public.teachers(email)
  where email is not null;

create unique index idx_teachers_phone_unique
  on public.teachers(phone)
  where phone is not null;
