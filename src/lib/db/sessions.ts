import { supabase } from '../supabase'
import type {
  Session,
  RecurrenceTemplate,
  CreateSessionInput,
  CreateRecurringSessionInput,
  UpdateSessionInput,
  ConflictCheckResult,
} from '../../types'
import { addWeeks, addDays, parseISO, setHours, setMinutes } from 'date-fns'

// ─── Fetching ─────────────────────────────────────────────────────────────────

export async function getSessionsForWeek(
  userId: string,
  weekStart: Date,
  weekEnd: Date,
  childId?: string
): Promise<Session[]> {
  let q = supabase
    .from('sessions')
    .select(`
      *,
      child:children(*),
      teacher:teachers(*)
    `)
    .eq('user_id', userId)
    .gte('starts_at', weekStart.toISOString())
    .lte('starts_at', weekEnd.toISOString())
    .order('starts_at', { ascending: true })

  if (childId) {
    q = q.eq('child_id', childId)
  }

  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getSessionsByTeacher(
  userId: string,
  teacherId: string,
  childId: string
): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select(`*, child:children(*), teacher:teachers(*)`)
    .eq('user_id', userId)
    .eq('teacher_id', teacherId)
    .eq('child_id', childId)
    .order('starts_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getSessionsForDateAndTeacher(
  userId: string,
  teacherId: string,
  date: Date
): Promise<Array<{ id: string; starts_at: string; ends_at: string }>> {
  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0)
  const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('sessions')
    .select('id, starts_at, ends_at')
    .eq('user_id',    userId)
    .eq('teacher_id', teacherId)
    .gte('starts_at', dayStart.toISOString())
    .lte('starts_at', dayEnd.toISOString())

  if (error) throw error
  return data ?? []
}

export async function getLatestSessionDefaults(
  userId: string,
  childId: string,
  teacherId: string
): Promise<{ duration_minutes: number; price: number } | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select('starts_at, ends_at, price')
    .eq('user_id', userId)
    .eq('child_id', childId)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const durationMs = new Date(data.ends_at).getTime() - new Date(data.starts_at).getTime()
  return {
    duration_minutes: durationMs > 0 ? Math.round(durationMs / 60000) : 60,
    price: Number(data.price),
  }
}

// ─── Monthly budget summary ───────────────────────────────────────────────────

export interface MonthlySessionSummary {
  scheduledAmount: number
  realizedAmount:  number
  scheduledCount:  number
  realizedCount:   number
  byPair: Record<string, { scheduledAmount: number; realizedAmount: number; scheduledCount: number; realizedCount: number }>
}

export async function getMonthlySessionSummary(
  userId: string,
  monthStart: Date,
  monthEnd: Date
): Promise<MonthlySessionSummary> {
  const { data, error } = await supabase
    .from('sessions')
    .select('status, price, child_id, teacher_id')
    .eq('user_id', userId)
    .gte('starts_at', monthStart.toISOString())
    .lt('starts_at', monthEnd.toISOString())

  if (error) throw error

  let scheduledAmount = 0
  let realizedAmount  = 0
  let scheduledCount  = 0
  let realizedCount   = 0
  const byPair: MonthlySessionSummary['byPair'] = {}

  for (const s of data ?? []) {
    if (!s.teacher_id) continue  // free-form sessions have no balance
    const key = `${s.child_id}:${s.teacher_id}`
    if (!byPair[key]) byPair[key] = { scheduledAmount: 0, realizedAmount: 0, scheduledCount: 0, realizedCount: 0 }

    if (s.status === 'scheduled') {
      scheduledAmount             += Number(s.price)
      scheduledCount              += 1
      byPair[key].scheduledAmount += Number(s.price)
      byPair[key].scheduledCount  += 1
    } else if (s.status === 'completed') {
      realizedAmount             += Number(s.price)
      realizedCount              += 1
      byPair[key].realizedAmount += Number(s.price)
      byPair[key].realizedCount  += 1
    }
  }

  return { scheduledAmount, realizedAmount, scheduledCount, realizedCount, byPair }
}

// ─── Teacher confirmation ─────────────────────────────────────────────────────

export async function confirmSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_session', { p_session_id: sessionId })
  if (error) throw error
}

export async function unconfirmSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('unconfirm_session', { p_session_id: sessionId })
  if (error) throw error
}

export async function getNextSessions(
  userId: string,
  after: Date,
  limit = 50
): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select(`*, child:children(*), teacher:teachers(*)`)
    .eq('user_id', userId)
    .gt('starts_at', after.toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function getIncompleteSessions(
  userId: string
): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select(`*, child:children(*), teacher:teachers(*)`)
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .lte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

// ─── Conflict detection ───────────────────────────────────────────────────────

export async function checkConflict(
  teacherId: string,
  startsAt: string,
  endsAt: string,
  userId: string
): Promise<ConflictCheckResult> {
  const { data, error } = await supabase
    .rpc('check_session_conflict', {
      p_teacher_id: teacherId,
      p_starts_at:  startsAt,
      p_ends_at:    endsAt,
      p_user_id:    userId,
    })

  if (error) throw error

  const result = data?.[0]
  return {
    has_conflict:             result?.has_conflict ?? false,
    conflicting_sessions_count: result?.conflicting_user_count ?? 0,
  }
}

// ─── Creating sessions ────────────────────────────────────────────────────────

export async function createOneOffSession(
  userId: string,
  input: CreateSessionInput
): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id:    userId,
      child_id:   input.child_id,
      teacher_id: input.teacher_id ?? null,
      title:      input.title ?? null,
      starts_at:  input.starts_at,
      ends_at:    input.ends_at,
      price:      input.price,
      notes:      input.notes ?? null,
      status:     'scheduled',
    })
    .select(`*, child:children(*), teacher:teachers(*)`)
    .single()

  if (error) throw error
  return data
}

export async function createRecurringSessions(
  userId: string,
  input: CreateRecurringSessionInput
): Promise<{ template: RecurrenceTemplate; sessions: Session[] }> {
  // 1. Create the template
  const { data: template, error: templateError } = await supabase
    .from('recurrence_templates')
    .insert({
      user_id:         userId,
      child_id:        input.child_id,
      teacher_id:      input.teacher_id ?? null,
      day_of_week:     input.day_of_week,
      time_of_day:     input.time_of_day,
      price:           input.price,
      recurrence_rule: input.recurrence_rule,
      start_date:      input.start_date,
      end_date:        input.end_date,
      notes:           input.notes ?? null,
    })
    .select()
    .single()

  if (templateError) throw templateError

  // 2. Generate all session dates upfront
  const sessionDates = generateSessionDates(
    input.start_date,
    input.end_date,
    input.day_of_week,
    input.time_of_day,
    input.duration_minutes,
    input.recurrence_rule
  )

  // 3. Build session rows
  const sessionRows = sessionDates.map(({ startsAt, endsAt }) => ({
    user_id:     userId,
    child_id:    input.child_id,
    teacher_id:  input.teacher_id ?? null,
    title:       input.title ?? null,
    template_id: template.id,
    starts_at:   startsAt,
    ends_at:     endsAt,
    price:       input.price,
    status:      'scheduled' as const,
    notes:       input.notes ?? null,
  }))

  // 4. Insert all sessions in one batch
  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .insert(sessionRows)
    .select(`*, child:children(*), teacher:teachers(*)`)

  if (sessionsError) throw sessionsError

  return { template, sessions }
}

// ─── Updating sessions ────────────────────────────────────────────────────────

export async function completeSession(sessionId: string): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select(`*, child:children(*), teacher:teachers(*)`)
    .single()

  if (error) throw error
  return data
}

export async function uncompleteSession(sessionId: string): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .update({ status: 'scheduled', updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select(`*, child:children(*), teacher:teachers(*)`)
    .single()

  if (error) throw error
  return data
}

export async function updateSessionPrice(
  sessionId: string,
  price: number
): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .update({ price, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateSession(
  sessionId: string,
  input: UpdateSessionInput
): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select(`*, child:children(*), teacher:teachers(*)`)
    .single()

  if (error) throw error
  return data
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', sessionId)

  if (error) throw error
}

export async function deleteAllFutureSessionsInSeries(
  templateId: string
): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('template_id', templateId)
    .eq('status', 'scheduled')
    .gte('starts_at', new Date().toISOString())

  if (error) throw error
}

export async function deleteSessionsInSeriesFrom(
  templateId: string,
  startsAt: string
): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('template_id', templateId)
    .gte('starts_at', startsAt)

  if (error) throw error
}

// ─── Helper: generate session dates ──────────────────────────────────────────

function generateSessionDates(
  startDate: string,
  endDate: string,
  dayOfWeek: number,
  timeOfDay: string,    // 'HH:MM:SS'
  durationMinutes: number,
  rule: 'weekly' | 'biweekly'
): Array<{ startsAt: string; endsAt: string }> {
  const [hours, minutes] = timeOfDay.split(':').map(Number)
  const end = parseISO(endDate)
  const intervalWeeks = rule === 'weekly' ? 1 : 2

  // Find the first occurrence on or after start_date that matches day_of_week
  let current = parseISO(startDate)
  while (current.getDay() !== dayOfWeek) {
    current = addDays(current, 1)
  }

  const dates: Array<{ startsAt: string; endsAt: string }> = []

  while (current <= end) {
    const sessionStart = setMinutes(setHours(current, hours), minutes)
    const sessionEnd = new Date(sessionStart.getTime() + durationMinutes * 60 * 1000)

    dates.push({
      startsAt: sessionStart.toISOString(),
      endsAt:   sessionEnd.toISOString(),
    })

    current = addWeeks(current, intervalWeeks)
  }

  return dates
}
