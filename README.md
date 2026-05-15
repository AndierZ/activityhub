# ActivityHub

Family activity management PWA. Parents log their children's after-school activities (piano, swimming, etc.), track sessions, and manage payments — all in one place.

**Core insight:** Teachers don't need to be on the platform for it to be useful. Parents self-report sessions they've arranged. Crowdsourced data across parents builds a community view of each teacher's schedule (the "Waze model").

**Platform:** PWA — mobile-first web app, installable to home screen. No App Store needed.

---

## Stack

React + TypeScript + Vite + Tailwind CSS v3 + Supabase (Postgres + Auth + RLS) + react-router-dom + date-fns

---

## Running Locally

```bash
npm install
npm run dev
# → http://localhost:5173
```

`.env.local` needs:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## Database Schema

7 tables. All private tables use Row Level Security — users can only access their own data. `teachers` is publicly readable by all authenticated users.

### `users`
Auto-created via trigger when a new auth user signs up.
```
id, email, full_name, avatar_url, created_at, updated_at
```

### `children`
Private per user. Color derived from `display_order` on the frontend. Age derived from `date_of_birth`.
```
id, user_id, name, date_of_birth, avatar_url, display_order, created_at, updated_at
```

Frontend helpers (not stored):
- Color: `CHILD_COLORS[display_order % 4]` → `['purple', 'teal', 'coral', 'amber']`
- Age: `differenceInYears(today, date_of_birth)`
- Initials: `name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2)`

### `teachers`
Shared community directory. Not owned by any user.
```
id, name, subject, location, email, phone,
claimed_by (null until V2), verified,
created_by, favorites_count, active_students_count,
created_at, updated_at
```
- `favorites_count` maintained by triggers on `user_teachers` insert/delete
- `claimed_by` used in V2 when teachers join the platform

### `user_teachers`
Row existence = user has saved this teacher. No `favorited` column needed.
```
id, user_id, teacher_id, notes, created_at, updated_at
UNIQUE (user_id, teacher_id)
```

### `recurrence_templates`
Defines a recurring session series. Max 180-day window — all sessions materialised upfront, no cron job needed.
```
id, user_id, child_id, teacher_id,
day_of_week (0-6), time_of_day, price,
recurrence_rule ('weekly' | 'biweekly'),
start_date, end_date (max 180 days from start),
notes, created_at, updated_at
```

### `sessions`
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

### `payments`
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

## Key Product Decisions

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
