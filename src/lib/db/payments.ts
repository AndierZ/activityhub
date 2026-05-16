import { supabase } from '../supabase'
import type { Payment, TeacherBalance, MonthlyStatement, StatementEntry } from '../../types'

// ─── Fetching ─────────────────────────────────────────────────────────────────

export async function getPaymentsByTeacher(
  userId: string,
  teacherId: string,
  childId: string
): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select(`*, child:children(*), teacher:teachers(*)`)
    .eq('user_id', userId)
    .eq('teacher_id', teacherId)
    .eq('child_id', childId)
    .order('date', { ascending: false })

  if (error) throw error
  return data
}

// ─── Balance ──────────────────────────────────────────────────────────────────

export async function getBalance(
  userId: string,
  childId: string,
  teacherId: string
): Promise<TeacherBalance> {
  // Call the database RPC for the balance calculation
  const { data, error } = await supabase
    .rpc('get_balance', {
      p_user_id:    userId,
      p_child_id:   childId,
      p_teacher_id: teacherId,
    })

  if (error) throw error

  const result = data?.[0] ?? { total_owed: 0, total_paid: 0, balance: 0 }

  // Fetch teacher and child for the return type
  const [{ data: teacher }, { data: child }] = await Promise.all([
    supabase.from('teachers').select('*').eq('id', teacherId).single(),
    supabase.from('children').select('*').eq('id', childId).single(),
  ])

  return {
    teacher:     teacher!,
    child:       child!,
    total_owed:  Number(result.total_owed),
    total_paid:  Number(result.total_paid),
    balance:     Number(result.balance),
  }
}

export async function getAllBalances(userId: string): Promise<TeacherBalance[]> {
  // Batch 1: discover combos from sessions + payments in parallel
  const [{ data: sessions, error: sError }, { data: payments, error: pError }] =
    await Promise.all([
      supabase.from('sessions').select('child_id, teacher_id').eq('user_id', userId).eq('status', 'completed'),
      supabase.from('payments').select('child_id, teacher_id').eq('user_id', userId),
    ])

  if (sError) throw sError
  if (pError) throw pError

  const combos = new Map<string, { child_id: string; teacher_id: string }>()
  ;[...(sessions ?? []), ...(payments ?? [])].forEach(row => {
    const key = `${row.child_id}:${row.teacher_id}`
    if (!combos.has(key)) combos.set(key, row)
  })

  if (combos.size === 0) return []

  const comboList  = Array.from(combos.values())
  const childIds   = [...new Set(comboList.map(c => c.child_id))]
  const teacherIds = [...new Set(comboList.map(c => c.teacher_id))]

  // Batch 2: all balance RPCs + bulk child/teacher fetches — all in parallel
  const [rpcResults, { data: children }, { data: teachers }] = await Promise.all([
    Promise.all(
      comboList.map(({ child_id, teacher_id }) =>
        supabase.rpc('get_balance', { p_user_id: userId, p_child_id: child_id, p_teacher_id: teacher_id })
      )
    ),
    supabase.from('children').select('*').in('id', childIds),
    supabase.from('teachers').select('*').in('id', teacherIds),
  ])

  return comboList
    .map(({ child_id, teacher_id }, i) => {
      const raw     = rpcResults[i].data?.[0] ?? { total_owed: 0, total_paid: 0, balance: 0 }
      const child   = children?.find(c => c.id === child_id)
      const teacher = teachers?.find(t => t.id === teacher_id)
      if (!child || !teacher) return null
      return {
        child,
        teacher,
        total_owed: Number(raw.total_owed),
        total_paid: Number(raw.total_paid),
        balance:    Number(raw.balance),
      }
    })
    .filter((b): b is TeacherBalance => b !== null)
}

// ─── Monthly statement ────────────────────────────────────────────────────────

export async function getMonthlyStatement(
  userId: string,
  childId: string,
  teacherId: string,
  year: number,
  month: number
): Promise<MonthlyStatement> {
  const { data, error } = await supabase
    .rpc('get_monthly_statement', {
      p_user_id:    userId,
      p_child_id:   childId,
      p_teacher_id: teacherId,
      p_year:       year,
      p_month:      month,
    })

  if (error) throw error

  const entries: StatementEntry[] = (data ?? []).map((row: any) => ({
    id:              row.id,
    date:            row.entry_date,
    type:            row.entry_type,
    description:     row.description,
    note:            row.note,
    amount:          Number(row.amount),
    running_balance: Number(row.running_balance),
  }))

  const openingBalance = entries.length > 0
    ? entries[0].running_balance - entries[0].amount
    : 0
  const closingBalance = entries.length > 0
    ? entries[entries.length - 1].running_balance
    : 0

  const [{ data: teacher }, { data: child }] = await Promise.all([
    supabase.from('teachers').select('*').eq('id', teacherId).single(),
    supabase.from('children').select('*').eq('id', childId).single(),
  ])

  return {
    teacher:         teacher!,
    child:           child!,
    month,
    year,
    opening_balance: openingBalance,
    closing_balance: closingBalance,
    entries,
  }
}

// ─── Creating payments ────────────────────────────────────────────────────────

export async function logPayment(
  userId: string,
  input: {
    child_id:   string
    teacher_id: string
    amount:     number   // positive = what you paid (stored as negative)
    date:       string
    note?:      string
  }
): Promise<Payment> {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      user_id:    userId,
      child_id:   input.child_id,
      teacher_id: input.teacher_id,
      amount:     -Math.abs(input.amount),  // always stored as negative (credit)
      date:       input.date,
      note:       input.note ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function logPrepayment(
  userId: string,
  input: {
    child_id:   string
    teacher_id: string
    amount:     number
    date:       string
    note?:      string
  }
): Promise<Payment> {
  // Prepayment is the same as a payment — stored as negative amount
  return logPayment(userId, { ...input, note: input.note ?? 'Prepayment' })
}
