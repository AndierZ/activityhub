# ActivityHub — Progress

## Phase Status

| Phase | Name | Status |
|-------|------|--------|
| Phase 1 | Foundation | ✅ Done |
| Phase 2 | Data Layer + Auth | ✅ Done |
| Phase 3 | Calendar & Sessions | ⬜ Not started |
| Phase 4 | Teachers Directory | ⬜ Not started |
| Phase 5 | Payments & Statements | ⬜ Not started |
| Phase 6 | Profile & Notifications | ⬜ Not started |
| Phase 7 | PWA Polish | ⬜ Not started |

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

## ⬜ Phase 3 — Calendar & Sessions (Next)

**CalendarPage (`/`)**
- Status bar + week title header
- Child filter tabs (Everyone / Katie / Jonny)
- Week strip — 7 day pills with segmented activity dots
  - Single child = solid dot in child color
  - Two children = half/half split dot
  - 3-4 children = segmented pie dot
  - 5+ = rainbow (easter egg)
- Day tapping updates the timeline below
- Timeline — time-grouped activity blocks
  - Katie = purple left border + purple bg
  - Jonny = teal left border + teal bg
  - Conflict = amber border + amber bg + "Another student also logged this time" warning (tappable → teacher detail)
- Empty slot at bottom → "Log an activity"

**LogPage (`/log`) — 3-step flow**

Step 1: Child + Teacher
- Self-report banner ("This is your personal record...")
- Child selector (Katie / Jonny)
- Teacher picker (saved teachers list)
- "Add new teacher" inline form (name, subject, location, email/phone)

Step 2: Date + Time
- Mini calendar (month view, date selection)
- Time slot buttons
- Conflict warning if another student logged this time with selected teacher
- Recurring toggle (weekly / biweekly)
- Price per session (editable)
- End date picker for recurring (max 180 days)

Step 3: Confirm
- Summary card
- "Logged by you" tag
- "Save to my calendar" button

Implementation notes:
- Conflict check: call `check_session_conflict` RPC after user selects teacher + time
- Recurring: call `createRecurringSessions()` — creates template + all session rows in one transaction
- One-off: call `createOneOffSession()`
- After saving: navigate to `/` and the new session should appear on the calendar

---

## ⬜ Phase 4 — Teachers Directory

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

## ⬜ Phase 5 — Payments & Statements

**PaymentsPage (`/payments`)**
- Balance hero card:
  - Left: "Balance" — large number, colour-coded (amber = owe, green = credit, grey = settled)
  - Right: "Paid this month" — muted reference number
  - Progress bar showing paid vs outstanding
- "Log a payment" button → inline form
  - Payment made vs Prepayment toggle
  - Teacher selector
  - Amount + note
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

## ⬜ Phase 6 — Profile & Notifications

**ProfilePage (`/profile`)**
- User hero (avatar, name, email, edit button)
- My children section — add/edit/remove, name + DOB + avatar
- Account section — name, email (editable)
- Notifications section — toggles for:
  - Session reminders (1 hour before)
  - Payment reminders (when overdue)
  - Conflict alerts (crowdsourced warnings)
- Sign out button

---

## ⬜ Phase 7 — PWA Polish

- `manifest.json` — app name, icons, `display: standalone`, theme color
- Service worker — offline caching for app shell
- "Add to Home Screen" prompt
- App icons — 512×512 and 192×192
- Test on iOS Safari + Android Chrome
