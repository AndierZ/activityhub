-- Remove invited_email column — the app never sends email; users share the link manually.
alter table invitations drop column if exists invited_email;
