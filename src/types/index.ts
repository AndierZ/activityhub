// ─── Database row types ───────────────────────────────────────────────────────
// These mirror the Supabase schema exactly. Column names match 1:1.

export interface User {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  can_manage_teachers: boolean
  created_at: string
  updated_at: string | null
}

export interface Child {
  id: string
  user_id: string
  name: string
  date_of_birth: string | null   // ISO date string: '2015-03-14'
  avatar_url: string | null
  display_order: number
  created_at: string
  updated_at: string | null
}

export interface Teacher {
  id: string
  name: string
  subject: string
  location: string | null
  email: string | null
  phone: string | null
  claimed_by: string | null      // user_id of teacher if they've joined
  verified: boolean
  created_by: string             // user_id of who added them
  favorites_count: number
  active_students_count: number
  created_at: string
  updated_at: string | null
}

export interface UserTeacher {
  id: string
  user_id: string
  teacher_id: string
  notes: string | null
  created_at: string
  updated_at: string | null
  // Joined
  teacher?: Teacher
}

export type RecurrenceRule = 'weekly' | 'biweekly'

export interface RecurrenceTemplate {
  id: string
  user_id: string
  child_id: string
  teacher_id: string | null
  day_of_week: number            // 0=Sun, 1=Mon ... 6=Sat
  time_of_day: string            // '15:00:00'
  price: number
  recurrence_rule: RecurrenceRule
  start_date: string             // ISO date string
  end_date: string               // ISO date string — max 180 days from start
  notes: string | null
  created_at: string
  updated_at: string | null
  // Joined
  child?: Child
  teacher?: Teacher
}

export type SessionStatus = 'scheduled' | 'completed'

export interface Session {
  id: string
  user_id: string
  child_id: string
  teacher_id: string | null
  template_id: string | null
  starts_at: string              // ISO datetime string
  ends_at: string                // ISO datetime string
  price: number
  status: SessionStatus
  title: string | null           // set when teacher_id is null; derived from teacher.subject otherwise
  notes: string | null
  teacher_confirmed_at: string | null  // set by teacher via confirm_session RPC
  created_at: string
  updated_at: string | null
  // Joined
  child?: Child
  teacher?: Teacher
  template?: RecurrenceTemplate
}

export interface Payment {
  id: string
  user_id: string
  child_id: string
  teacher_id: string
  amount: number                 // positive = charge (session owed)
                                 // negative = credit (payment made)
  date: string                   // ISO date string
  note: string | null
  created_at: string
  updated_at: string | null
  // Joined
  child?: Child
  teacher?: Teacher
}

// ─── UI / derived types ───────────────────────────────────────────────────────
// These are not stored — computed in the frontend from database types.

export type ChildColor = 'purple' | 'teal' | 'coral' | 'amber'

export const CHILD_COLORS: ChildColor[] = ['purple', 'teal', 'coral', 'amber']

export const CHILD_COLOR_HEX: Record<ChildColor, string> = {
  purple: '#7C6EE6',
  teal:   '#26B99A',
  coral:  '#E86B5F',
  amber:  '#E8A838',
}

export const CHILD_COLOR_BG: Record<ChildColor, string> = {
  purple: '#EEEBfd',
  teal:   '#E0F7F2',
  coral:  '#FDECEB',
  amber:  '#FEF3DC',
}

// Derive a child's color from their display_order
export function getChildColor(displayOrder: number): ChildColor {
  return CHILD_COLORS[displayOrder % CHILD_COLORS.length]
}

// Derive initials from a name
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Derive age from date_of_birth
export function getAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth)
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
  return age
}

// ─── API request/response types ───────────────────────────────────────────────

export interface CreateSessionInput {
  child_id: string
  teacher_id: string | null
  title?: string | null
  starts_at: string
  ends_at: string
  price: number
  notes?: string
}

export interface UpdateSessionInput {
  starts_at?: string
  ends_at?: string
  price?: number
  notes?: string | null
  status?: SessionStatus
}

export interface CreateRecurringSessionInput {
  child_id: string
  teacher_id: string | null
  title?: string | null
  day_of_week: number
  time_of_day: string
  duration_minutes: number
  price: number
  recurrence_rule: RecurrenceRule
  start_date: string
  end_date: string
  notes?: string
}

export interface CreatePaymentInput {
  child_id: string
  teacher_id: string
  amount: number               // positive = you paid, will be stored as negative
  date: string
  note?: string
}

export interface TeacherBalance {
  teacher: Teacher
  child: Child
  total_owed: number           // sum of completed session prices
  total_paid: number           // sum of payment amounts (as positive numbers)
  balance: number              // total_owed - total_paid (positive = you owe)
}

// Lean shape returned by get_all_balances — only the fields the Payments UI needs
export interface BalanceSummary {
  child:   { id: string; name: string; display_order: number }
  teacher: { id: string; name: string; subject: string }
  total_paid: number
  balance: number              // positive = you owe, negative = in credit
}

export interface ConflictCheckResult {
  has_conflict: boolean
  conflicting_sessions_count: number
}

// ─── Statement types ──────────────────────────────────────────────────────────

export type StatementEntryType = 'session' | 'payment'

export interface StatementEntry {
  id: string
  date: string
  type: StatementEntryType
  description: string
  note: string | null
  amount: number               // positive for session, negative for payment
  running_balance: number      // balance after this entry
}

export interface MonthlyStatement {
  teacher: Teacher
  child: Child
  month: number                // 1-12
  year: number
  opening_balance: number
  closing_balance: number
  entries: StatementEntry[]
}
