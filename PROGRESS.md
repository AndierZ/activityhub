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
| Phase 7 | PWA Polish | ⬜ Not started |
| Polish | User Journey Polish | 🔄 In progress |

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
  - Prefills price from that session
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
  - Community vs Verified badge
- Tabler icon font loaded in `index.html`, fixing missing heart and back-arrow icons

**Discover overlay**
- Search all teachers in community directory
- Same card layout
- "Can't find them? Add a new teacher" at bottom

**Teacher detail**
- Back → Teachers (or Discover)
- Heart button (save/unsave) — updates `user_teachers`
- Crowdsourced schedule — amber banner explaining it's self-reported
- Weekly schedule grid — your slots (purple), other students (grey), no reports (dashed)

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

## 🔄 User Journey Polish (In progress)

Completed so far:
- Loaded Tabler Icons stylesheet in `index.html`, restoring missing heart/back/nav icons
- Fixed log mini-calendar selected-date styling to match the design reference
- Added event detail sheet from Calendar session cards
- Added session completion flow using the word "Complete" instead of "Confirm"
- Separated event details, edit details, completion, and delete actions
- Added recurring-session delete options:
  - Delete this activity only
  - Delete this and following activities
- Improved log time entry:
  - Removed dense time-slot rail
  - Added manual Start and End time inputs
  - Kept quick start-time chips as shortcuts only
  - Uses explicit `ends_at` for conflict checks and saved sessions
- Added child/teacher defaults on Log step 1
- Added last-session defaults for duration/end time and price
- Added visible save errors for log flow
- Fixed project lint config to ignore `.claude/**` worktrees and set stable `tsconfigRootDir`

Current verification status:
- `npm run build` passes
- `npm run lint` passes with 4 existing hook dependency warnings:
  - `PaymentsPage.tsx`
  - `StatementPage.tsx`
  - `TeacherDetailPage.tsx`
  - `TeachersPage.tsx`

---

## ✅ Phase 6 — Profile & Notifications (Done)

**ProfilePage (`/profile`)** ✅ Built
- User hero — avatar (with camera overlay upload), name (inline edit), email
- My children — list with color avatars, age, tap to expand inline edit/delete form; camera overlay on each child avatar for photo upload; "Add a child" row
- Shared access section:
  - Primary user: see linked partners, revoke access, generate invite link (one active at a time)
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
- Migrations: 013 (storage), 014 (sharing tables + RPCs), 015 (invited_email — later dropped), 016 (fix missing delete policy), 017 (drop invited_email), 018 (grant anon execute on validate_invitation + recreate RPCs), 019 (fix missing user_links table + effective_user_id), 020 (fix ambiguous column in users RLS policy)

---

## ⬜ Phase 7 — PWA Polish

- `manifest.json` — app name, icons, `display: standalone`, theme color
- Service worker — offline caching for app shell
- "Add to Home Screen" prompt
- App icons — 512×512 and 192×192
- Test on iOS Safari + Android Chrome
