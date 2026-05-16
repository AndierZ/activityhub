-- The delete policy for invitations was missing from migration 014.
create policy "invitations: delete own"
  on invitations for delete to authenticated
  using (auth.uid() = inviter_user_id);
