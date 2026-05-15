# ActivityHub — Development Progress

## Project Overview

Family activity management PWA. Parents log their children's after-school activities (piano, swimming, etc.), track sessions, and manage payments — all in one place.

**Core insight:** Teachers don't need to be on the platform for it to be useful. Parents self-report sessions they've arranged. Crowdsourced data across parents builds a community view of each teacher's schedule (the "Waze model").

**Stack:** React + TypeScript + Vite + Tailwind CSS v3 + Supabase (Postgres + Auth + RLS) + react-router-dom + date-fns

**Platform:** PWA — mobile-first web app, installable to home screen. No App Store needed.

---

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

### What was built
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

### Key files
```
src/
  types/index.ts                    # All TypeScript types
  lib/
    supabase.ts                     # Supabase client
    db/
      children.ts                   # Children CRUD
      teachers.ts                   # Teacher search, save/unsave, crowdsourced schedule
      sessions.ts                   # Session creation (one-off + recurring), conflict check
      payments.ts                   # Balance, monthly statement, log payment
  hooks/
    useAuth.tsx                     # Auth context — Google OAuth only
  components/layout/
    AppShell.tsx                    # Bottom nav shell
  pages/
    LoginPage.tsx                   # ✅ Real login screen (built in Phase 2)
    CalendarPage.tsx                # Stub — Phase 3
    TeachersPage.tsx                # Stub — Phase 4
    LogPage.tsx                     # Stub — Phase 3
    PaymentsPage.tsx                # Stub — Phase 5
    ProfilePage.tsx                 # Stub — Phase 6
supabase/migrations/
  001_enable_extensions.sql
  002_users.sql
  003_children.sql
  004_teachers.sql
  005_user_teachers.sql
  006_recurrence_templates.sql
  007_sessions.sql
  008_payments.sql
```

---

## ✅ Phase 2 — Data Layer + Auth (Done)

### What was done
- Supabase project created and linked to GitHub repo
- All 8 migrations run successfully in Supabase SQL Editor
- `handle_new_user` trigger verified — creates a `users` row on sign up
- Google OAuth configured (Google Cloud Console + Supabase Auth providers)
- `LoginPage.tsx` built with "Continue with Google" button
- `useAuth.tsx` simplified to Google OAuth only (removed email/password)
- Login flow tested and working end to end

### Supabase config
- **Authentication → URL Configuration:**
  - Site URL: `http://localhost:5173`
  - Redirect URLs: `http://localhost:5173/**`
- **Authentication → Providers:** Google enabled, Email enabled (for dev/testing only)
- **Automatic RLS** enabled on project

### Auth flow
- `signInWithGoogle()` calls `supabase.auth.signInWithOAuth({ provider: 'google' })`
- Browser redirects to Google → user consents → redirects back to app
- `onAuthStateChange` fires, fetches user profile from `users` table
- User lands on Calendar page (protected route)

---

## Database Schema

7 tables. All private tables use Row Level Security — users can only access their own data. `teachers` is publicly readable by all authenticated users.

### Tables

#### `users`
Auto-created via trigger when a new auth user signs up.
```
id, email, full_name, avatar_url, created_at, updated_at
```

#### `children`
Private per user. Color derived from `display_order` on the frontend. Age derived from `date_of_birth`.
```
id, user_id, name, date_of_birth, avatar_url, display_order, created_at, updated_at
```

Frontend helpers (not stored):
- Color: `CHILD_COLORS[display_order % 4]` → `['purple', 'teal', 'coral', 'amber']`
- Age: `differenceInYears(today, date_of_birth)`
- Initials: `name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2)`

#### `teachers`
Shared community directory. Not owned by any user.
```
id, name, subject, location, email, phone,
claimed_by (null until V2), verified,
created_by, favorites_count, active_students_count,
created_at, updated_at
```
- `favorites_count` maintained by triggers on `user_teachers` insert/delete
- `claimed_by` used in V2 when teachers join the platform

#### `user_teachers`
Row existence = user has saved this teacher. No `favorited` column needed.
```
id, user_id, teacher_id, notes, created_at, updated_at
UNIQUE (user_id, teacher_id)
```

#### `recurrence_templates`
Defines a recurring session series. Max 180-day window — all sessions materialised upfront, no cron job needed.
```
id, user_id, child_id, teacher_id,
day_of_week (0-6), time_of_day, price,
recurrence_rule ('weekly' | 'biweekly'),
start_date, end_date (max 180 days from start),
notes, created_at, updated_at
```

#### `sessions`
Individual session instances. Linked to `recurrence_templates` if recurring.
```
id, user_id, child_id, teacher_id,
template_id (nullable),
starts_at, ends_at,
price, status ('scheduled' | 'completed'),
notes, created_at, updated_at
```

Key design decisions:
- `ends_at` stored explicitly (not derived) — enables efficient interval overlap queries
- Status is only `scheduled` or `completed` — cancelled = delete the row
- Recurring sessions all materialised upfront (max 26 rows for weekly over 180 days)

Conflict detection index:
```sql
CREATE INDEX idx_sessions_conflict
ON sessions (teacher_id, starts_at, ends_at)
WHERE status = 'scheduled';
```

#### `payments`
Financial ledger. Positive amount = session charge (you owe). Negative amount = payment made (credit).
```
id, user_id, child_id, teacher_id,
amount, date, note,
created_at, updated_at
```

Balance formula: `SUM(completed session prices) + SUM(payment amounts)`
- Positive = you owe
- Negative = you're in credit
- Zero = settled

### Key RPCs (Postgres functions)

**`check_session_conflict(teacher_id, starts_at, ends_at, user_id)`**
Returns `{ has_conflict, conflicting_user_count }`. Used before logging a session to warn if another user has this teacher at an overlapping time. Never exposes raw user data.

**`get_balance(user_id, child_id, teacher_id)`**
Returns `{ total_owed, total_paid, balance }` for a child+teacher combination.

**`get_monthly_statement(user_id, child_id, teacher_id, year, month)`**
Returns all sessions + payments for a month, interleaved chronologically with running balance. Powers the statement drill-down view.

---

## Design System

### Child colors
Assigned deterministically from `display_order`, not stored:
```typescript
const CHILD_COLORS = ['purple', 'teal', 'coral', 'amber']
// purple = #7C6EE6, teal = #26B99A, coral = #E86B5F, amber = #E8A838
```

### Brand color
Primary purple: `#7C6EE6`

### Typography
- Sans: DM Sans (400, 500, 600)
- Serif: DM Serif Display (headings, logo)

### Navigation
5-tab bottom nav: Calendar · Teachers · Log (FAB) · Payments · Profile

---

## Phase 3 — Calendar & Sessions (Next)

### Screens to build

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

### Key implementation notes
- Conflict check: call `check_session_conflict` RPC after user selects teacher + time
- Recurring sessions: call `createRecurringSessions()` which creates template + all session rows in one transaction
- One-off sessions: call `createOneOffSession()`
- After saving: navigate to `/` and the new session should appear on the calendar

---

## Phase 4 — Teachers Directory

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

## Phase 5 — Payments & Statements

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

**Statement view (drill-down from payment row)**
- Back → Payments
- Month navigator (prev/next)
- Hero card: subject · teacher · child · month, opening + closing balance
- Interleaved ledger entries:
  - Session charge: calendar icon, description, +$amount, running balance
  - Payment made: checkmark icon, description, −$amount, running balance
- "Log a payment" button at bottom

---

## Phase 6 — Profile & Notifications

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

## Phase 7 — PWA Polish

- `manifest.json` — app name, icons, `display: standalone`, theme color
- Service worker — offline caching for app shell
- "Add to Home Screen" prompt
- App icons — 512×512 and 192×192
- Test on iOS Safari + Android Chrome

---

## Key Product Decisions (for context)

**Why no teacher onboarding in V1**
Teachers don't need to join for the app to be useful. Parents self-report their own sessions. The crowdsourced teacher schedule view is built from aggregated parent-reported data — like Waze. When enough parents use the app, teachers will *want* to join to get an authoritative view of their own schedule. That's the V2 hook.

**Why 180-day max for recurring sessions**
Avoids infinite rows in the database without needing a cron job. All session rows are created upfront in a single transaction. 180 days of weekly sessions = 26 rows — trivial. The UX moment when a series expires becomes a natural re-engagement: "Katie's piano lessons are ending soon — renew?"

**Why signed amounts in payments**
`positive = charge (you owe), negative = payment (credit)`. Balance = `SUM(all amounts)`. No type column, no matching sessions to payments, no complexity. Just arithmetic.

**Why ends_at is stored (not derived)**
Enables the conflict detection index: `(teacher_id, starts_at, ends_at) WHERE status = 'scheduled'`. If ends_at were computed, Postgres couldn't use a B-tree index on it efficiently.

**The V1 → V2 transition**
When a teacher joins and claims their profile (`claimed_by` gets set), parents automatically connect. Their crowdsourced data becomes authoritative. No migration needed — the data model was designed for this from day one (the "Venmo model").

---

## Running Locally

```bash
cd /Users/zianxu/projects/activityhub
npm install
npm run dev
# → http://localhost:5173
```

`.env.local` needs:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```
