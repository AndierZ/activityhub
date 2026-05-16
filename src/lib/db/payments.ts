import { supabase } from '../supabase'
import type { Payment, TeacherBalance, BalanceSummary, MonthlyStatement, StatementEntry } from '../../types'

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

export async function getAllBalances(userId: string): Promise<BalanceSummary[]> {
  const { data, error } = await supabase.rpc('get_all_balances', { p_user_id: userId })
  if (error) throw error
  if (!data || data.length === 0) return []

  return (data as Array<{
    child_id: string; child_name: string; child_display_order: number
    teacher_id: string; teacher_name: string; teacher_subject: string
    total_paid: number; balance: number
  }>).map(row => ({
    child:   { id: row.child_id,   name: row.child_name,   display_order: row.child_display_order },
    teacher: { id: row.teacher_id, name: row.teacher_name, subject: row.teacher_subject },
    total_paid: Number(row.total_paid),
    balance:    Number(row.balance),
  }))
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

  type MonthlyStatementRow = {
    id: string
    entry_date: string
    entry_type: StatementEntry['type']
    description: string
    note: string | null
    amount: number | string
    running_balance: number | string
  }

  const entries: StatementEntry[] = ((data ?? []) as MonthlyStatementRow[]).map(row => ({
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

export async function updatePayment(
  paymentId: string,
  input: { amount?: number; date?: string; note?: string | null }
): Promise<Payment> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.amount !== undefined) patch.amount = -Math.abs(input.amount)
  if (input.date  !== undefined)  patch.date   = input.date
  if ('note' in input)            patch.note   = input.note ?? null

  const { data, error } = await supabase
    .from('payments')
    .update(patch)
    .eq('id', paymentId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deletePayment(paymentId: string): Promise<void> {
  const { error } = await supabase.from('payments').delete().eq('id', paymentId)
  if (error) throw error
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
