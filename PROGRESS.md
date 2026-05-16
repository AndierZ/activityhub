# ActivityHub — Progress

## Phase Status

| Phase | Name | Status |
|-------|------|--------|
| Phase 1 | Foundation | ✅ Done |
| Phase 2 | Data Layer + Auth | ✅ Done |
| Phase 3 | Calendar & Sessions | ✅ Done |
| Phase 4 | Teachers Directory | ✅ Done |
| Phase 5 | Payments & Statements | ✅ Done |
| Phase 6 | Profile & Notifications | ✅ Done |
| Phase 7 | PWA Polish | ✅ Done |
| Phase 8 | V2 Teacher Features | ✅ Done |

---

## ✅ Phase 1 — Foundation (Done)

- Vite + React + TypeScript scaffold, builds cleanly
- Tailwind CSS v3 with custom theme (brand colors, child colors, typography)
- Dependencies: `@supabase/supabase-js`, `react-router-dom`, `date-fns`, `rrule`
- Full TypeScript types in `src/types/index.ts` mirroring the DB schema
- Supabase client singleton in `src/lib/supabase.ts`
- Data access layer in `src/lib/db/` (children, teachers, sessions, payments)
- Auth context in `src/hooks/useAuth.tsx`
- App shell with bottom navigation in `src/components/layout/AppShell.tsx`
- Protected routes in `src/App.tsx`
- Stub pages for all 5 routes

Key files:
```
src/
  types/index.ts
  lib/
    supabase.ts
    db/
      children.ts
      teachers.ts
      sessions.ts
      payments.ts
  hooks/useAuth.tsx
  components/layout/AppShell.tsx
  pages/
    LoginPage.tsx, CalendarPage.tsx, TeachersPage.tsx,
    LogPage.tsx, PaymentsPage.tsx, ProfilePage.tsx
supabase/migrations/
  001_enable_extensions.sql  002_users.sql  003_children.sql
  004_teachers.sql  005_user_teachers.sql  006_recurrence_templates.sql
  007_sessions.sql  008_payments.sql
```

---

## ✅ Phase 2 — Data Layer + Auth (Done)

- Supabase project created and linked to GitHub repo
- All 8 migrations run successfully in Supabase SQL Editor
- `handle_new_user` trigger verified — creates a `users` row on sign up
- Google OAuth configured (Google Cloud Console + Supabase Auth providers)
- `LoginPage.tsx` built with "Continue with Google" button
- `useAuth.tsx` simplified to Google OAuth only (removed email/password)
- Login flow tested and working end to end

Supabase config:
- Site URL: `http://localhost:5173` / Redirect URLs: `http://localhost:5173/**`
- Google OAuth enabled; Email enabled for dev/testing only
- Automatic RLS enabled on project

Auth flow: `signInWithGoogle()` → Google consent → redirect back → `onAuthStateChange` fires → user lands on Calendar page.

---

## ✅ Phase 3 — Calendar & Sessions (Done)

**CalendarPage (`/`)** ✅ Built
- Week title header with prev/next week navigation
- Child filter tabs (Everyone + one per child, dynamic from DB)
- Week strip — 7 day pills with segmented activity dots
  - Single child = solid dot in child color
  - Two children = half/half split dot
  - 3-4 children = segmented pie (conic-gradient)
  - 5+ = rainbow easter egg
- Day tapping updates the timeline below
- Timeline — time-grouped activity blocks per selected day
  - Child color left border + bg; child badge top-right
  - Conflict = amber border + amber bg + "Another student also logged this time"
  - Conflict check runs in parallel for all sessions in the week
- Empty slot at bottom → "Log an activity" → navigates to /log
- Session cards are tappable → open event detail sheet
- Event detail sheet supports:
  - Mark session complete → updates `sessions.status = 'completed'`
  - Edit date/time, price, and notes
  - Delete one-off session
  - For recurring sessions: delete selected session only, or selected session plus all following sessions in the series
- Completed sessions show "Completed" state and are included in payment calculations
- "Teacher confirmed" teal badge shown when `teacher_confirmed_at` is set

**LogPage (`/log`) ✅ Built** — 3-step flow

Step 1: Child + Teacher
- Self-report banner ("You are logging a session you have arranged...")
- Child selector with avatar initials + active color state
- Saved teacher list — each a card row with initials avatar + subject + student count
- Defaults to the first child and first saved teacher when available
- "Add new teacher" dashed row → inline form (name, subject, location) → creates teacher in community directory + saves to user_teachers

Step 2: Date + Time
- Mini calendar — month view with prev/next, today circle, selected outlined purple
- Manual Start and End time inputs with 15-minute step
- Quick start-time chips for common after-school times
- Last session defaults:
  - Fetches most recent session for selected child+teacher once
  - Prefills duration/end time from that session
  - Prefills price from that session (resets to empty when teacher changes)
  - Does not re-query when changing quick-pick times
- Conflict warning: amber note if another student has teacher at this time
- Recurring toggle with weekly/biweekly selector
- End date picker when recurring (min next day, max 180 days)
- Price per session input

Step 3: Confirm
- Summary card with child color header, subject + teacher + child label
- Detail rows: date & time, recurring, location, duration, price
- "Logged by you" tag
- "Save to my calendar" → `createOneOffSession` or `createRecurringSessions` → navigate to `/`
- Save errors are shown inline instead of silently staying on the screen

---

## ✅ Phase 4 — Teachers Directory

**TeachersPage (`/teachers`)**
- Search bar ("Search my teachers…") — filters saved teachers only
- "Find a new teacher" button → Discover overlay
- My teachers list — teacher cards with:
  - Avatar initials + subject + location
  - Child chips (e.g. "Katie · Mon & Thu")
  - Payment status chip
  - Heart button (save/unsave)
  - "⚠ Another student also logged this time →" conflict chip (tappable)
  - Crowd stats: "12 saved · 3 active"
  - Community vs Claimed badge
- Discover overlay uses `position: absolute` (contained within phone shell)

**Discover overlay**
- Search all teachers in community directory
- Same card layout
- "Can't find them? Add a new teacher" at bottom

**Teacher detail**
- Back → Teachers (or Discover)
- Heart button (save/unsave) — updates `user_teachers`
- Crowdsourced schedule — amber banner explaining it's self-reported
- Weekly schedule grid — your slots (purple), other students (grey), no reports (dashed)
- Trusted users (`can_manage_teachers`): inline edit form, add/delete teacher
- Teacher invite card (unclaimed teachers with email only): generate/copy/refresh/cancel invite link

---

## ✅ Phase 5 — Payments & Statements

**PaymentsPage (`/payments`)**
- Balance hero card:
  - Left: "Balance" — large number, colour-coded (amber = owe, green = credit, grey = settled)
  - Right: "Paid this month" — muted reference number
  - Progress bar showing paid vs outstanding
- "Log a payment" button → inline form
  - Payment made vs Prepayment toggle
  - Teacher selector
  - Amount + note
- Payment and prepayment both store as negative ledger credits
- Payment form is shared by Payments and Statement views
- Per-teacher rows (tappable → statement)
  - Icon + name + child + session count
  - Amount + status (Settled / You owe / In credit)
  - Chevron →

**Statement view (drill-down)**
- Back → Payments
- Month navigator (prev/next)
- Hero card: subject · teacher · child · month, opening + closing balance
- Interleaved ledger entries:
  - Session charge: calendar icon, description, +$amount, running balance
  - Payment made: checkmark icon, description, −$amount, running balance
- "Log a payment" button at bottom

---

## ✅ Phase 6 — Profile & Notifications (Done)

**ProfilePage (`/profile`)** ✅ Built
- User hero — avatar (with camera overlay upload), name (inline edit), email
- My children — list with color avatars, age, tap to expand inline edit/delete form; camera overlay on each child avatar for photo upload; "Add a child" row
- Shared access section (parent accounts only):
  - Primary user: see linked partners, revoke access, generate invite link (one active at a time, partner invitations only)
  - Linked user: see who they're connected to, disconnect
- Account section — Name (tappable, editable), Email (read-only, Google auth)
- Notifications — 3 toggles persisted to localStorage (session reminders, payment reminders, conflict alerts)
- Sign out button

**Avatar uploads** ✅
- Supabase Storage bucket `avatars` — public read, write-gated to `{uid}/` folder per user
- User profile photo and per-child photos stored at `{uid}/user.{ext}` and `{uid}/child-{id}.{ext}`
- Camera overlay button on all avatars; photo shown instead of initials when set

**Shared access / Partner invite** ✅
- Invite flow: primary user generates a share link → manually sends it → partner opens `/join/:token`
- `JoinPage` works pre-login: validates token via SECURITY DEFINER RPC, shows inviter name, prompts Google sign-in with redirect back to the join URL
- Pre-acceptance checks: blocks if already linked; warns if the joining user has existing data (hidden while connected, restored on disconnect)
- On acceptance: `user_links` row created; all data queries resolve to primary user via `effective_user_id()` SECURITY DEFINER function
- One active invitation enforced: generating a new link cancels any existing pending one
- Invite button hidden once a partner is linked (one linked user per household)
- Revoke (primary) and disconnect (linked) both remove the `user_links` row

---

## ✅ Phase 7 — PWA Polish (Done)

- `vite-plugin-pwa` installed and configured
- Web app manifest auto-injected: name, short_name, `display: standalone`, `theme_color: #7C6EE6`, portrait orientation
- Service worker (Workbox) pre-caches all app assets; `autoUpdate` on deploy
- Tabler CDN font cached via `CacheFirst` runtime strategy (30-day TTL)
- PNG icons generated from `favicon.svg` via `scripts/generate-icons.mjs` (sharp):
  - `public/pwa-192x192.png` — Android/Chrome manifest icon
  - `public/pwa-512x512.png` — Android/Chrome manifest icon + maskable
  - `public/apple-touch-icon.png` (180×180) — iOS home screen icon
- iOS meta tags in `index.html`: `apple-mobile-web-app-capable`, status-bar-style, title, apple-touch-icon link
- `IOSInstallBanner` component in `AppShell`: dismissible, appears above nav bar, only on iOS Safari when not already installed, persists dismissal to localStorage

---

## ✅ Phase 8 — V2 Teacher Features (Done)

### Teacher claiming

Teachers can claim their profile and get a read-only view of their own schedule.

**Invite flow (trusted users)**
- `can_manage_teachers` boolean on `users` table gates teacher management and inviting
- Invite card on `TeacherDetailPage`: only shown for unclaimed teachers with an email set
- Generates a teacher-type invitation (`invitation_type = 'teacher'`, `teacher_id` FK)
- On page open, existing pending invite is loaded from DB (survives navigation)
- Copy / Refresh (invalidates old, creates new) / Cancel buttons
- Invite expires after 7 days (same as partner invites)

**Join flow (teacher)**
- `JoinPage` branches on `invitation_type`:
  - `'teacher'`: shows teacher claim screen ("Claim your schedule"), calls `accept_teacher_invitation` RPC
  - `'partner'`: unchanged partner flow
- `accept_teacher_invitation` RPC: validates token, checks `claimed_by IS NULL`, sets `teachers.claimed_by = auth.uid()`, marks invite used — atomic

**Teacher app experience**
- `useAuth` resolves `claimedTeacher` (null if not a teacher account)
- `App.tsx` renders teacher route set when `claimedTeacher` is set (separate from parent routes)
- `AppShell` shows teacher nav: Schedule / Payments / Profile
- Parent-only sections (My children, Shared access) hidden from teacher Profile

### Teacher schedule (`/my-schedule`)

- Weekly calendar strip: Mon–Sun pills, week navigation, today highlight
- Dot indicators: purple = unconfirmed sessions, teal = all confirmed
- "N to confirm" badge in header
- Session cards: child name, time, Confirm button (unconfirmed) or Confirmed badge + Unconfirm button (confirmed)
- Detail sheet: full session info, Confirm / Unconfirm button
- Optimistic UI for both confirm and unconfirm with rollback on error

**Session confirmation model**
- `teacher_confirmed_at` timestamptz added to `sessions`
- `confirm_session(p_session_id)` SECURITY DEFINER RPC — idempotent, only writes `teacher_confirmed_at`
- `unconfirm_session(p_session_id)` SECURITY DEFINER RPC — sets back to null
- Parents remain source of truth for session logging and completion; teacher confirmation is additive only
- CalendarPage shows "Teacher confirmed" teal badge when `teacher_confirmed_at` is set

### Teacher payments (`/payments` for teacher accounts)

- `TeacherPaymentsPage`: per-student balance list, summary hero (total outstanding + total received)
- `TeacherStatementPage`: read-only monthly ledger per student, reuses existing `get_monthly_statement` RPC
- `get_teacher_student_balances(p_teacher_id)` SECURITY DEFINER RPC: same balance formula as `get_all_balances` but pivoted by teacher, returns `(user_id, child_id, child_name, total_paid, balance)` — authorization guard via CROSS JOIN with auth_ok CTE

### Teacher self-edit profile

- Teacher profile section in `ProfilePage` (teacher accounts only)
- Inline read/edit form: name, subject, location, email, phone
- `update_claimed_teacher_profile` SECURITY DEFINER RPC: only updates safe fields, `claimed_by` and `verified` immutable from teacher side

### Badge model

- Community: unclaimed teacher (purple badge)
- Claimed: teacher has joined and claimed their profile (green badge, `claimed_by IS NOT NULL`)
- Verified: reserved for V3 (DB column kept, UI removed)

### Migrations

| File | Description |
|------|-------------|
| `021_admin_teachers.sql` | `can_manage_teachers` flag on users |
| `022_rename_can_manage_teachers.sql` | Rename column |
| `023_teacher_unique_contacts.sql` | Partial unique indexes on email/phone |
| `024_teacher_claiming.sql` | invitation_type + teacher_id on invitations; teacher RLS policies; updated `validate_invitation` RPC; `accept_teacher_invitation` RPC |
| `025_teacher_self_edit.sql` | `update_claimed_teacher_profile` RPC |
| `026_session_confirmation.sql` | `teacher_confirmed_at` column; `confirm_session` RPC |
| `027_teacher_student_balances.sql` | `get_teacher_student_balances` RPC |
| `028_unconfirm_session.sql` | `unconfirm_session` RPC |
