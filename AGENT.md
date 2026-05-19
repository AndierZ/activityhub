# ActivityHub Agent Notes

This repo is a React/Vite/Supabase app. The app has two parallel user modes:
student/family views and claimed-teacher views. Many screens intentionally look
similar, but they are separate implementations. When changing UI or behavior in
one side, check whether the matching side needs the same treatment.

## Paired Student And Teacher Screens

Calendar:

- Student calendar: `src/pages/StudentCalendarPage.tsx`
- Teacher calendar: `src/pages/TeacherCalendarPage.tsx`
- Both should keep the same overall calendar shell: header title `Calendar`,
  week nav, horizontal week-strip swipe, current-week feed, `Coming up` section,
  empty state text/icon, loading spinner, and session detail bottom sheet.
- Student-specific behavior:
  - Child filter tabs.
  - `N to complete` reminder counts all past incomplete sessions, filtered by
    selected child when a child is selected.
  - Complete actions mark sessions completed for payment calculations.
  - Cards show teacher/subject and child badge.
- Teacher-specific behavior:
  - Student filter tabs.
  - `N to confirm` reminder is scoped to the current viewed week and selected
    student filter, and intentionally excludes completed sessions.
  - Confirm/unconfirm actions manage `teacher_confirmed_at`.
  - Cards show child name, with completed and confirmed status icons.
- Shared status icon pattern:
  - Student completed: `ti-circle-check`, green active color `#26B99A`.
  - Teacher confirmed: `ti-user-check`, purple active color `#7C6EE6`.
  - Detail sheets should use the same icons/colors as the shortcut icons on
    cards.
- Session ordering should stay deterministic, especially for overlaps:
  - Student side: start time, child name, teacher name/title, session id.
  - Teacher side: start time, child name, session id.

Payments:

- Student payments: `src/pages/StudentPaymentsPage.tsx`
- Teacher payments: `src/pages/TeacherPaymentsPage.tsx`
- Both are separate implementations, but card layout, balance section placement,
  empty states, and typography should stay aligned.
- Student side labels balances as `you owe` / `in credit`.
- Teacher side labels balances as `owes you` / `in credit`.
- Student payments has an `N to pay` / `All settled` header reminder based on
  positive balances by teacher.
- Student statement route uses `/payments/:childId/:teacherId`; teacher
  statement route uses `/payments/:userId/:childId`.

Profile:

- Profile has both family account concerns and claimed-teacher profile concerns
  in `src/pages/ProfilePage.tsx`.
- Claimed teachers can edit teacher profile fields there. Be careful not to
  confuse the app user's account email/name with a teacher directory profile's
  email/name.

Teachers:

- Teacher directory/list: `src/pages/TeachersPage.tsx`
- Teacher detail: `src/pages/TeacherDetailPage.tsx`
- New-teacher support prompt belongs on the teachers page, below `Find a new
  teacher` and `Add new teacher`, not in the session logging flow.
- Support mailto target is `support@edgewaterland.com` with subject
  `ActivityHub - New Teacher Request`.
- `active_students_count` is denormalized in the database. It should represent
  distinct children with scheduled sessions for a teacher. See migration
  `supabase/migrations/030_fix_active_students_count.sql`.

## Navigation Conventions

- Student and teacher calendar paths should use `/calendar`.
- Root `/` should redirect to `/calendar` for both students and teachers.
- Avoid reintroducing teacher-only `/my-schedule` behavior unless explicitly
  requested.

## Data And Supabase Notes

- Session completion status is `sessions.status = 'completed'`.
- Teacher confirmation is `sessions.teacher_confirmed_at`.
- Student completion affects payment calculations; teacher confirmation is more
  of a teacher-side workflow/status signal.
- Database behavior changes usually belong in ordered files under
  `supabase/migrations/`.
- Prefer recalculating denormalized counts in migrations/triggers when drift is
  possible, rather than relying on fragile incremental updates.

## UI Style Notes

- This app uses compact mobile-first utility UI, Tabler icons (`ti ti-*`), and
  mostly inline style color tokens already present in the surrounding file.
- Preserve the quiet app-like style. Avoid landing-page patterns, oversized
  cards, or explanatory text unless the existing screen already uses it.
- When making paired changes, match:
  - Empty state wording/layout.
  - Loading spinners.
  - Header actions/reminder pills.
  - Week strip dot sizes and swipe behavior.
  - Detail sheet structure and status rows.

## Verification

- Run `npm run build` after TypeScript/React changes.
- For DB-only migration changes, inspect SQL carefully; run local Supabase
  tooling if available and needed.
- Check `git status --short` before committing so unrelated user changes are not
  accidentally staged.
