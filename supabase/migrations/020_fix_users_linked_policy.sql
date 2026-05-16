-- The exists() subquery in "users: read own or linked" resolved the unqualified
-- "id" column to user_links.id instead of users.id (both tables have an id column).
-- Fix by qualifying with the table name.

drop policy if exists "users: read own or linked" on users;

create policy "users: read own or linked"
  on users for select to authenticated
  using (
    auth.uid() = id
    or exists (
      select 1 from user_links
      where (user_links.primary_user_id = auth.uid() and user_links.linked_user_id = users.id)
         or (user_links.linked_user_id  = auth.uid() and user_links.primary_user_id = users.id)
    )
  );
