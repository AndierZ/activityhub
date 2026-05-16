-- Store who the invite was sent to (for display only — we don't send email)
alter table invitations add column if not exists invited_email text;
