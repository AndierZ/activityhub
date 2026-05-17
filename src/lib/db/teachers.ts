import { supabase } from '../supabase'
import type { Teacher, UserTeacher } from '../../types'

// ─── Community directory ──────────────────────────────────────────────────────

export async function searchTeachers(query: string): Promise<Teacher[]> {
  let q = supabase
    .from('teachers')
    .select('*')
    .order('favorites_count', { ascending: false })
    .limit(20)

  if (query.trim()) {
    // Use ilike for simple substring search in V1
    // Can upgrade to full-text search (to_tsvector) later
    q = q.or(`name.ilike.%${query}%,subject.ilike.%${query}%`)
  }

  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getTeacherById(id: string): Promise<Teacher | null> {
  const { data, error } = await supabase
    .from('teachers')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // not found
    throw error
  }
  return data
}

export async function findTeacherByContact(
  email?: string,
  phone?: string
): Promise<{ field: 'email' | 'phone'; teacher: Teacher } | null> {
  if (email) {
    const { data } = await supabase.from('teachers').select('*').eq('email', email).maybeSingle()
    if (data) return { field: 'email', teacher: data }
  }
  if (phone) {
    const { data } = await supabase.from('teachers').select('*').eq('phone', phone).maybeSingle()
    if (data) return { field: 'phone', teacher: data }
  }
  return null
}

export async function createTeacher(
  userId: string,
  input: {
    name: string
    subject: string
    location?: string
    email?: string
    phone?: string
  }
): Promise<Teacher> {
  const { data, error } = await supabase
    .from('teachers')
    .insert({
      name:       input.name,
      subject:    input.subject,
      location:   input.location ?? null,
      email:      input.email ?? null,
      phone:      input.phone ?? null,
      created_by: userId,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateTeacher(
  id: string,
  input: {
    name?: string
    subject?: string
    location?: string | null
    email?: string | null
    phone?: string | null
    verified?: boolean
  }
): Promise<Teacher> {
  const { data, error } = await supabase
    .from('teachers')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteTeacher(id: string): Promise<void> {
  const { error } = await supabase
    .from('teachers')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ─── User's saved teachers ────────────────────────────────────────────────────

export async function getSavedTeachers(userId: string): Promise<UserTeacher[]> {
  const { data, error } = await supabase
    .from('user_teachers')
    .select(`
      *,
      teacher:teachers(*)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}

export async function saveTeacher(
  userId: string,
  teacherId: string
): Promise<UserTeacher> {
  const { data, error } = await supabase
    .from('user_teachers')
    .insert({ user_id: userId, teacher_id: teacherId })
    .select(`*, teacher:teachers(*)`)
    .single()

  if (error) throw error
  return data
}

export async function unsaveTeacher(
  userId: string,
  teacherId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_teachers')
    .delete()
    .eq('user_id', userId)
    .eq('teacher_id', teacherId)

  if (error) throw error
}

export async function isTeacherSaved(
  userId: string,
  teacherId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from('user_teachers')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('teacher_id', teacherId)

  if (error) throw error
  return (count ?? 0) > 0
}

// ─── Teacher claiming ─────────────────────────────────────────────────────────

export interface ClaimedTeacher {
  id: string
  name: string
  subject: string
  location: string | null
  email: string | null
  phone: string | null
}

export async function getClaimedTeacher(userId: string): Promise<ClaimedTeacher | null> {
  const { data, error } = await supabase
    .from('teachers')
    .select('id, name, subject, location, email, phone')
    .eq('claimed_by', userId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function updateClaimedTeacherProfile(fields: {
  name: string
  subject: string
  location: string
  email: string
  phone: string
}): Promise<void> {
  const { error } = await supabase.rpc('update_claimed_teacher_profile', {
    p_name:     fields.name,
    p_subject:  fields.subject,
    p_location: fields.location,
    p_email:    fields.email,
    p_phone:    fields.phone,
  })
  if (error) throw error
}

// ─── Teacher schedule queries ─────────────────────────────────────────────────

export interface TeacherSessionRow {
  id: string
  starts_at: string
  ends_at: string
  price: number
  status: string
  teacher_confirmed_at: string | null
  notes: string | null
  child: { id: string; name: string }
}

export async function getTeacherNextSessions(
  teacherId: string,
  after: Date,
  limit = 50
): Promise<TeacherSessionRow[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, starts_at, ends_at, price, status, teacher_confirmed_at, notes, child:children(id, name)')
    .eq('teacher_id', teacherId)
    .gt('starts_at', after.toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as TeacherSessionRow[]
}

export async function getTeacherWeekSessions(
  teacherId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<TeacherSessionRow[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, starts_at, ends_at, price, status, teacher_confirmed_at, notes, child:children(id, name)')
    .eq('teacher_id', teacherId)
    .gte('starts_at', weekStart.toISOString())
    .lt('starts_at', weekEnd.toISOString())
    .order('starts_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as TeacherSessionRow[]
}

export interface TeacherPaymentRow {
  id: string
  date: string
  amount: number
  note: string | null
  child: { id: string; name: string }
}

export async function getTeacherPaymentHistory(teacherId: string): Promise<TeacherPaymentRow[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, date, amount, note, child:children(id, name)')
    .eq('teacher_id', teacherId)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as TeacherPaymentRow[]
}

// ─── Teacher monthly session summary ─────────────────────────────────────────

export interface TeacherMonthlySummary {
  realizedThisMonth:  number
  scheduledThisMonth: number
  byStudent: Record<string, {  // key: `${user_id}:${child_id}`
    user_id:         string
    child_id:        string
    child_name:      string
    realizedAmount:  number
    scheduledAmount: number
  }>
}

export async function getTeacherMonthlySummary(
  teacherId: string,
  monthStart: Date,
  monthEnd:   Date
): Promise<TeacherMonthlySummary> {
  const { data, error } = await supabase
    .from('sessions')
    .select('user_id, child_id, status, price, child:children(id, name)')
    .eq('teacher_id', teacherId)
    .gte('starts_at', monthStart.toISOString())
    .lt('starts_at', monthEnd.toISOString())

  if (error) throw error

  let realizedThisMonth  = 0
  let scheduledThisMonth = 0
  const byStudent: TeacherMonthlySummary['byStudent'] = {}

  for (const s of data ?? []) {
    const key   = `${s.user_id}:${s.child_id}`
    const child = s.child as { id: string; name: string } | null
    if (!byStudent[key]) {
      byStudent[key] = {
        user_id:         s.user_id,
        child_id:        s.child_id,
        child_name:      child?.name ?? 'Unknown',
        realizedAmount:  0,
        scheduledAmount: 0,
      }
    }
    if (s.status === 'completed') {
      realizedThisMonth             += Number(s.price)
      byStudent[key].realizedAmount += Number(s.price)
    } else if (s.status === 'scheduled') {
      scheduledThisMonth              += Number(s.price)
      byStudent[key].scheduledAmount  += Number(s.price)
    }
  }

  return { realizedThisMonth, scheduledThisMonth, byStudent }
}

// ─── Crowdsourced schedule ────────────────────────────────────────────────────
// Returns aggregated slot data for a teacher — never exposes raw user data.

export interface CrowdsourcedSlot {
  day_of_week: number      // 0-6
  time_of_day: string      // 'HH:MM'
  student_count: number    // how many distinct users report this slot
  is_yours: boolean        // does the current user have this slot
}

export async function getTeacherCrowdsourcedSchedule(
  teacherId: string,
  currentUserId: string
): Promise<CrowdsourcedSlot[]> {
  // Fetch scheduled sessions for this teacher in the last 90 days + future
  const { data, error } = await supabase
    .from('sessions')
    .select('user_id, starts_at')
    .eq('teacher_id', teacherId)
    .eq('status', 'scheduled')
    .gte('starts_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())

  if (error) throw error
  if (!data || data.length === 0) return []

  // Aggregate in the application layer
  const slotMap = new Map<string, { users: Set<string>; isYours: boolean }>()

  data.forEach(session => {
    const d = new Date(session.starts_at)
    const key = `${d.getDay()}-${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`

    if (!slotMap.has(key)) {
      slotMap.set(key, { users: new Set(), isYours: false })
    }
    const slot = slotMap.get(key)!
    slot.users.add(session.user_id)
    if (session.user_id === currentUserId) slot.isYours = true
  })

  return Array.from(slotMap.entries()).map(([key, slot]) => {
    const [dayStr, timeStr] = key.split('-')
    return {
      day_of_week:   parseInt(dayStr),
      time_of_day:   timeStr,
      student_count: slot.users.size,
      is_yours:      slot.isYours,
    }
  }).sort((a, b) => a.day_of_week - b.day_of_week || a.time_of_day.localeCompare(b.time_of_day))
}
