# ActivityHub

Family activity management PWA. Parents log their children's after-school activities (piano, swimming, etc.), track sessions, and manage payments — all in one place. Teachers can claim their profile to get a read-only view of their schedule and confirm sessions.

**Core insight:** Teachers don't need to be on the platform for it to be useful. Parents self-report sessions they've arranged. Crowdsourced data across parents builds a community view of each teacher's schedule (the "Waze model"). When enough parents use the app, teachers *want* to join to get an authoritative view of their own schedule — that's the V2 hook.

**Platform:** PWA — mobile-first web app, installable to home screen. No App Store needed.

---

## Stack

React + TypeScript + Vite + Tailwind CSS v3 + Supabase (Postgres + Auth + RLS + Storage) + react-router-dom + date-fns + vite-plugin-pwa

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

### Regenerating PWA icons

```bash
node scripts/generate-icons.mjs
```

Requires the source `public/favicon.svg` to exist. Outputs `pwa-192x192.png`, `pwa-512x512.png`, and `apple-touch-icon.png` into `public/`.

---

## User Roles

### Parent
Default role. Logs sessions, manages payments, invites a partner (shared household access).

### Teacher
A user who has claimed a teacher profile via an invite link. Sees a different app experience:
- **Schedule** (`/calendar`): weekly view of all sessions logged under their profile by parents; can confirm/unconfirm sessions
- **Payments** (`/payments`): per-student balance summary and monthly statement drill-down (read-only)
- **Profile** (`/profile`): edit their own teacher profile (name, subject, location, email, phone)

### Trusted admin (`can_manage_teachers = true`)
A parent account with elevated permissions to add/edit teachers and send teacher invite links.

---

## Database Schema

Tables + 1 storage bucket. All private tables use Row Level Security. `teachers` is publicly readable by all authenticated users.

### `users`
Auto-created via trigger when a new auth user signs up.
```
id, email, full_name, avatar_url,
can_manage_teachers (boolean, default false),
created_at, updated_at
```

### `children`
Private per user. Color derived from `display_order` on the frontend.
```
id, user_id, name, date_of_birth, avatar_url, display_order, created_at, updated_at
```

### `teachers`
Shared community directory.
```
id, name, subject, location, email, phone,
claimed_by (uuid → auth user who claimed this profile, nullable),
verified (reserved for V3),
created_by, favorites_count, active_students_count,
created_at, updated_at
```
- `claimed_by` set when a teacher accepts a teacher invitation; unlocks teacher app experience
- Partial unique indexes on `email` and `phone` (where not null) prevent duplicate teacher records
- `favorites_count` maintained by triggers on `user_teachers` insert/delete

### `user_teachers`
Row existence = user has saved this teacher.
```
id, user_id, teacher_id, notes, created_at, updated_at
UNIQUE (user_id, teacher_id)
```

### `recurrence_templates`
Defines a recurring session series. Max 180-day window — all sessions materialised upfront.
```
id, user_id, child_id, teacher_id,
day_of_week (0-6), time_of_day, price,
recurrence_rule ('weekly' | 'biweekly'),
start_date, end_date,
notes, created_at, updated_at
```

### `sessions`
Individual session instances.
```
id, user_id, child_id, teacher_id,
template_id (nullable),
starts_at, ends_at,
price, status ('scheduled' | 'completed'),
teacher_confirmed_at (timestamptz, nullable),
notes, created_at, updated_at
```

- `teacher_confirmed_at`: set by the teacher via `confirm_session` RPC; cleared by `unconfirm_session`
- Status is only `scheduled` or `completed` — cancelled = delete the row

### `payments`
Financial ledger. Positive = session charge (you owe). Negative = payment made (credit).
```
id, user_id, child_id, teacher_id,
amount, date, note,
created_at, updated_at
```

Balance formula: `SUM(completed session prices) + SUM(payment amounts)`

### `invitations`
One-time tokens for both partner sharing and teacher claiming.
```
id, token (uuid — the public bearer secret),
inviter_user_id,
invitation_type ('partner' | 'teacher', default 'partner'),
teacher_id (uuid → teachers, nullable — set for teacher invitations),
expires_at (7 days), accepted_at, accepted_by_user_id,
created_at
```
- `token` is separate from `id`: `id` is the internal key, `token` is in the URL
- `JoinPage` branches on `invitation_type` to show the correct claim flow

### `user_links`
Records a linked partner relationship. UNIQUE on `linked_user_id`.
```
id, primary_user_id, linked_user_id, created_at
```

### Storage bucket: `avatars`
Public read, authenticated write restricted to `{uid}/` folder.
```
{uid}/user.{ext}         — user profile photo
{uid}/child-{id}.{ext}   — child photo
```

---

## Key RPCs (Postgres functions)

**`effective_user_id()`** `SECURITY DEFINER STABLE`
Returns the primary user's ID if the caller is a linked user, otherwise `auth.uid()`. Used in all data-table RLS policies for transparent partner access.

**`check_session_conflict(teacher_id, starts_at, ends_at, user_id)`**
Returns `{ has_conflict, conflicting_user_count }`. Never exposes raw user data.

**`get_balance(user_id, child_id, teacher_id)`**
Returns `{ total_owed, total_paid, balance }`.

**`get_all_balances(user_id)`**
Returns all child+teacher balance rows for a user in one query.

**`get_monthly_statement(user_id, child_id, teacher_id, year, month)`**
Returns interleaved sessions + payments for a month with running balance. Used by both student `StudentStatementPage` and teacher `TeacherStatementPage`.

**`get_teacher_student_balances(teacher_id)`** `SECURITY DEFINER`
Returns per-student balance rows for a claimed teacher. Same formula as `get_all_balances` but pivoted by `teacher_id`. Authorization guard: caller must have claimed this teacher profile.

**`validate_invitation(token)`** `SECURITY DEFINER` — callable by `anon`
Returns `{ valid, reason, inviter_name, inviter_email, invitation_type, teacher_name, teacher_subject }`. Callable without auth so the join page can show context before login.

**`accept_invitation(token)`** `SECURITY DEFINER`
Validates token, creates `user_links` row, marks invitation used.

**`accept_teacher_invitation(token)`** `SECURITY DEFINER`
Validates token, checks `claimed_by IS NULL`, sets `teachers.claimed_by = auth.uid()`, marks invitation used. Atomic.

**`update_claimed_teacher_profile(...)`** `SECURITY DEFINER`
Updates name/subject/location/email/phone for the teacher claimed by the calling user. `claimed_by` and `verified` are immutable from teacher side.

**`confirm_session(session_id)`** `SECURITY DEFINER`
Sets `teacher_confirmed_at = now()`. Idempotent. Only works for sessions under the calling user's claimed teacher profile.

**`unconfirm_session(session_id)`** `SECURITY DEFINER`
Clears `teacher_confirmed_at`. Only works for sessions under the calling user's claimed teacher profile.

**`get_user_data_summary(user_id)`** `SECURITY DEFINER`
Returns `{ children_count, sessions_count }` for the join page warning.

---

## Design System

> **Canonical UI reference:** `mockup-v1.html` — open in browser. Use it as the source of truth for all React components.

### Color tokens

| Token | Hex | Usage |
|-------|-----|-------|
| Primary / Katie | `#7C6EE6` | Brand, Katie, selected state |
| Katie bg | `#EEEBfd` | Activity blocks, badges |
| Katie badge | `#DDD9FB` | Child chip background |
| Jonny / teal | `#26B99A` | Jonny, confirmed/settled states |
| Jonny bg | `#E0F7F2` | Activity blocks, badges |
| Jonny badge | `#C8F0E8` | Child chip background |
| Coral | `#E86B5F` | 3rd child |
| Coral bg | `#FDECEB` | |
| Amber | `#E8A838` | 4th child, conflict border |
| Amber bg | `#FEF3DC` | |
| Danger | `#E24B4A` | Destructive actions |
| Surface | `#ffffff` | Cards, inputs |
| Surface2 | `#F5F5F7` | Page background |
| Border | `#E8E8EC` | Default borders |
| Text1 | `#1A1A2E` | Primary text |
| Text2 | `#555566` | Secondary text |
| Text3 | `#999AAA` | Muted / placeholder |

### Typography
- Sans: DM Sans (400, 500, 600)
- Serif: DM Serif Display (headings, logo)

### Icons
Tabler Icons — `@tabler/icons-webfont` (loaded from CDN, cached by service worker)

### Navigation

**Parent nav:** Calendar · Teachers · Log (FAB) · Payments · Profile

**Teacher nav:** Schedule · Payments · Profile

---

## Key Product Decisions

**Why no teacher onboarding in V1**
Teachers don't need to join for the app to be useful. Parents self-report their own sessions. The crowdsourced teacher schedule view is built from aggregated parent data. When enough parents use the app, teachers *want* to join — that's the V2 hook.

**Teacher confirmation is additive, not a gate**
`teacher_confirmed_at` is a timestamp alongside the existing status field, not a new status in a state machine. Parents remain the source of truth for session logging and completion. A teacher never confirming doesn't break anything for parents — it just means the confirmation badge never appears. This avoids a dependency that would block parents if a teacher is unresponsive.

**Why 180-day max for recurring sessions**
Avoids infinite rows without a cron job. 180 days of weekly sessions = 26 rows. The series expiration becomes a natural re-engagement moment.

**Why signed amounts in payments**
`positive = charge, negative = payment`. Balance = `SUM(all amounts)`. No type column, no matching logic — just arithmetic.

**Why ends_at is stored (not derived)**
Enables the conflict detection index: `(teacher_id, starts_at, ends_at) WHERE status = 'scheduled'`. Computed columns can't be indexed efficiently.

**Badge model: Community → Claimed → Verified**
- Community: teacher added by a trusted user, not yet claimed
- Claimed: teacher has accepted an invite and linked their account (`claimed_by IS NOT NULL`)
- Verified: reserved for V3 when a formal verification mechanism is introduced
