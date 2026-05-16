-- Migration: 029_extend_recurrence_window.sql
-- Extend the maximum recurring session window from 180 days to 365 days (52 weeks).

alter table public.recurrence_templates
  drop constraint end_date_within_180_days,
  add constraint end_date_within_365_days
    check (end_date <= start_date + interval '365 days');
