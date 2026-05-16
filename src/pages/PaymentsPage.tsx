import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, startOfMonth, addMonths } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { getAllBalances, logPayment } from '../lib/db/payments'
import { getSavedTeachers } from '../lib/db/teachers'
import { getChildren } from '../lib/db/children'
import {
  getChildColor, CHILD_COLOR_HEX, CHILD_COLOR_BG,
} from '../types'
import type { TeacherBalance, Child, UserTeacher } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function subjectIcon(subject: string): string {
  const s = subject.toLowerCase()
  if (s.includes('piano') || s.includes('music') || s.includes('guitar') || s.includes('violin') || s.includes('cello')) return 'ti-music'
  if (s.includes('swim'))                                return 'ti-swimming'
  if (s.includes('vocal') || s.includes('sing') || s.includes('voice')) return 'ti-microphone'
  if (s.includes('dance') || s.includes('ballet'))      return 'ti-shoe'
  if (s.includes('tennis'))                             return 'ti-tennis'
  if (s.includes('art') || s.includes('draw') || s.includes('paint')) return 'ti-palette'
  if (s.includes('code') || s.includes('program'))      return 'ti-code'
  return 'ti-school'
}

function fmtAmt(n: number): string {
  return `$${Math.abs(n).toFixed(2).replace(/\.00$/, '')}`
}

// ─── Log payment form ─────────────────────────────────────────────────────────

interface LogPaymentFormProps {
  children:       Child[]
  savedTeachers:  UserTeacher[]
  preChildId?:    string
  preTeacherId?:  string
  onSave:         () => void
  onCancel:       () => void
}

export function LogPaymentForm({
  children, savedTeachers, preChildId, preTeacherId, onSave, onCancel,
}: LogPaymentFormProps) {
  const { user } = useAuth()
  const [childId,    setChildId]    = useState(preChildId    ?? children[0]?.id    ?? '')
  const [teacherId,  setTeacherId]  = useState(preTeacherId  ?? savedTeachers[0]?.teacher_id ?? '')
  const [amount,     setAmount]     = useState('')
  const [date,       setDate]       = useState(format(new Date(), 'yyyy-MM-dd'))
  const [note,       setNote]       = useState('')
  const [saving,     setSaving]     = useState(false)

  async function handleSave() {
    if (!user || !childId || !teacherId || !amount) return
    setSaving(true)
    try {
      await logPayment(user.id, {
        child_id:   childId,
        teacher_id: teacherId,
        amount:     parseFloat(amount),
        date,
        note:       note.trim() || undefined,
      })
      onSave()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const canSave = !!childId && !!teacherId && !!amount && parseFloat(amount) > 0

  return (
    <div className="px-5 pb-5 pt-3" style={{ borderBottom: '0.5px solid #E8E8EC', background: '#F5F5F7' }}>
      <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#999AAA' }}>
        Log a payment
      </div>

      {/* Child + Teacher */}
      <div className="flex gap-2 mb-2">
        <select
          className="flex-1 text-sm rounded-[9px] px-3 py-2 outline-none"
          style={{ background: '#fff', border: '0.5px solid #E8E8EC', color: '#1A1A2E' }}
          value={childId}
          onChange={e => setChildId(e.target.value)}
        >
          {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          className="flex-1 text-sm rounded-[9px] px-3 py-2 outline-none"
          style={{ background: '#fff', border: '0.5px solid #E8E8EC', color: '#1A1A2E' }}
          value={teacherId}
          onChange={e => setTeacherId(e.target.value)}
        >
          {savedTeachers.map(ut => (
            <option key={ut.teacher_id} value={ut.teacher_id}>{ut.teacher?.name}</option>
          ))}
        </select>
      </div>

      {/* Amount + Date */}
      <div className="flex gap-2 mb-2">
        <div
          className="flex items-center flex-1 rounded-[9px]"
          style={{ background: '#fff', border: '0.5px solid #E8E8EC' }}
        >
          <span className="pl-3 text-sm" style={{ color: '#999AAA' }}>$</span>
          <input
            type="number"
            className="flex-1 text-sm px-2 py-2 outline-none bg-transparent"
            style={{ color: '#1A1A2E' }}
            placeholder="Amount"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            min="0"
            step="0.01"
          />
        </div>
        <input
          type="date"
          className="flex-1 text-sm rounded-[9px] px-3 py-2 outline-none"
          style={{ background: '#fff', border: '0.5px solid #E8E8EC', color: '#1A1A2E' }}
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </div>

      {/* Note */}
      <input
        className="w-full text-sm rounded-[9px] px-3 py-2 mb-3 outline-none"
        style={{ background: '#fff', border: '0.5px solid #E8E8EC', color: '#1A1A2E' }}
        placeholder="Note (optional)"
        value={note}
        onChange={e => setNote(e.target.value)}
      />

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="py-2 px-4 rounded-[9px] text-sm"
          style={{ background: '#fff', border: '0.5px solid #E8E8EC', color: '#555566' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="flex-1 py-2 rounded-[9px] text-sm font-semibold"
          style={{
            background: canSave ? '#7C6EE6' : '#E8E8EC',
            color:      canSave ? '#fff' : '#999AAA',
          }}
        >
          {saving ? 'Saving…' : 'Save payment'}
        </button>
      </div>
    </div>
  )
}

// ─── PaymentsPage ─────────────────────────────────────────────────────────────

export function PaymentsPage() {
  const { user }  = useAuth()
  const navigate  = useNavigate()

  const [balances,       setBalances]       = useState<TeacherBalance[]>([])
  const [children,       setChildren]       = useState<Child[]>([])
  const [savedTeachers,  setSavedTeachers]  = useState<UserTeacher[]>([])
  const [paidThisMonth,  setPaidThisMonth]  = useState(0)
  const [loading,        setLoading]        = useState(true)
  const [showLogForm,    setShowLogForm]    = useState(false)

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  async function loadData() {
    if (!user) return
    setLoading(true)
    try {
      const monthStart = startOfMonth(new Date())
      const monthEnd   = addMonths(monthStart, 1)

      const [balancesData, childrenData, teachersData, { data: monthPmts }] = await Promise.all([
        getAllBalances(user.id),
        getChildren(user.id),
        getSavedTeachers(user.id),
        supabase
          .from('payments')
          .select('amount')
          .eq('user_id', user.id)
          .gte('date', format(monthStart, 'yyyy-MM-dd'))
          .lt('date',  format(monthEnd,   'yyyy-MM-dd')),
      ])

      setBalances(balancesData)
      setChildren(childrenData)
      setSavedTeachers(teachersData)
      setPaidThisMonth(
        (monthPmts ?? []).reduce((sum, p) => sum + Math.abs(p.amount), 0)
      )
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const overallBalance = balances.reduce((s, b) => s + b.balance, 0)
  const totalPaid      = balances.reduce((s, b) => s + b.total_paid, 0)
  const totalOwed      = balances.reduce((s, b) => s + Math.max(b.balance, 0), 0)
  const teachersOwed   = balances.filter(b => b.balance > 0).length
  const progressPct    = totalPaid + totalOwed > 0
    ? Math.round((totalPaid / (totalPaid + totalOwed)) * 100)
    : 100

  const balanceColor =
    overallBalance > 0  ? '#E8A838' :
    overallBalance < 0  ? '#26B99A' :
    '#999AAA'

  const balanceLabel =
    overallBalance > 0  ? `you owe · ${teachersOwed} teacher${teachersOwed !== 1 ? 's' : ''}` :
    overallBalance < 0  ? 'in credit' :
    'all settled'

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex-shrink-0" style={{ borderBottom: '0.5px solid #E8E8EC' }}>
        <div className="font-serif text-[22px] leading-tight" style={{ color: '#1A1A2E' }}>
          Payments
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

        <>
          {/* Balance hero — always visible; numbers hidden while loading */}
          <div className="mx-5 mt-4 p-4 rounded-[14px]" style={{ border: '0.5px solid #E8E8EC' }}>
            <div className="flex items-start justify-between mb-3">
              {/* Left: balance */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#999AAA' }}>
                  Balance
                </div>
                {loading ? (
                  <div className="h-8 w-20 rounded-lg mt-0.5" style={{ background: '#F5F5F7' }} />
                ) : (
                  <div className="text-[28px] font-bold leading-none" style={{ color: balanceColor, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtAmt(overallBalance)}
                  </div>
                )}
                <div className="text-[11px] mt-1" style={{ color: '#999AAA' }}>
                  {loading ? '—' : balanceLabel}
                </div>
              </div>
              {/* Right: paid this month */}
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#999AAA' }}>
                  Paid this month
                </div>
                {loading ? (
                  <div className="h-5 w-14 rounded-lg mt-1 ml-auto" style={{ background: '#F5F5F7' }} />
                ) : (
                  <div className="text-[17px] font-medium" style={{ color: '#555566', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtAmt(paidThisMonth)}
                  </div>
                )}
                <div className="text-[11px] mt-1" style={{ color: '#999AAA' }}>
                  {format(new Date(), 'MMM yyyy')}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-[3px] rounded-full overflow-hidden" style={{ background: '#E8E8EC' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: loading ? '0%' : `${progressPct}%`, background: '#26B99A' }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[11px]" style={{ color: '#999AAA' }}>
                {loading ? '—' : `${fmtAmt(totalPaid)} paid`}
              </span>
              {!loading && totalOwed > 0 && (
                <span className="text-[11px]" style={{ color: '#C0830A' }}>{fmtAmt(totalOwed)} outstanding</span>
              )}
            </div>
          </div>

          {/* Log payment button or form */}
          {showLogForm ? (
            <div className="mt-3">
              <LogPaymentForm
                children={children}
                savedTeachers={savedTeachers}
                onSave={() => { setShowLogForm(false); loadData() }}
                onCancel={() => setShowLogForm(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowLogForm(true)}
              className="w-full flex items-center justify-center gap-2 py-3 mt-3"
              style={{ borderTop: '0.5px solid #E8E8EC', borderBottom: '0.5px solid #E8E8EC', color: '#7C6EE6' }}
            >
              <i className="ti ti-plus" style={{ fontSize: 15 }} />
              <span className="text-[13px] font-medium">Log a payment</span>
            </button>
          )}

          {/* Balance rows */}
          {!loading && balances.length > 0 && (
            <div className="px-5 mt-4 pb-6">
              <div
                className="text-[11px] font-semibold uppercase tracking-wide mb-2"
                style={{ color: '#999AAA' }}
              >
                {format(new Date(), 'MMM yyyy')}
              </div>

                <div className="rounded-[14px] overflow-hidden" style={{ border: '0.5px solid #E8E8EC' }}>
                  {balances.map((b, i) => {
                    const color   = getChildColor(b.child.display_order)
                    const hex     = CHILD_COLOR_HEX[color]
                    const bg      = CHILD_COLOR_BG[color]
                    const settled = Math.abs(b.balance) < 0.01
                    const owed    = b.balance > 0

                    const amtLabel  = settled ? fmtAmt(0) : owed ? fmtAmt(b.balance) : `${fmtAmt(b.balance)} credit`
                    const amtColor  = settled ? '#999AAA' : owed ? '#E8A838' : '#26B99A'
                    const statusLbl = settled ? 'Settled' : owed ? 'You owe' : 'In credit'
                    const statusClr = settled ? '#999AAA' : owed ? '#C0830A' : '#26B99A'
                    const dotColor  = settled ? '#26B99A' : owed ? '#E8A838' : '#26B99A'

                    return (
                      <button
                        key={`${b.child.id}:${b.teacher.id}`}
                        onClick={() => navigate(`/payments/${b.child.id}/${b.teacher.id}`)}
                        className="w-full flex items-center gap-3 px-3.5 py-3"
                        style={{ borderTop: i > 0 ? '0.5px solid #E8E8EC' : 'none', background: '#fff' }}
                      >
                        {/* Subject icon */}
                        <div
                          className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                          style={{ background: bg }}
                        >
                          <i className={`ti ${subjectIcon(b.teacher.subject)}`} style={{ fontSize: 16, color: hex }} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0 text-left">
                          <div className="text-[13px] font-medium truncate" style={{ color: '#1A1A2E' }}>
                            {b.teacher.subject} · {b.teacher.name}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: '#999AAA' }}>
                            {b.child.name}
                          </div>
                        </div>

                        {/* Amount + status */}
                        <div className="text-right flex-shrink-0">
                          <div className="text-[13px] font-semibold" style={{ color: amtColor, fontVariantNumeric: 'tabular-nums' }}>
                            {amtLabel}
                          </div>
                          <div className="text-[10px] mt-0.5" style={{ color: statusClr }}>{statusLbl}</div>
                        </div>

                        {/* Status dot */}
                        <div className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ background: dotColor }} />

                        <i className="ti ti-chevron-right flex-shrink-0" style={{ fontSize: 14, color: '#999AAA' }} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

          {!loading && balances.length === 0 && (
            <div className="flex flex-col items-center justify-center pt-12 text-center px-8">
              <i className="ti ti-credit-card" style={{ fontSize: 36, color: '#D8D8DC' }} />
              <p className="text-sm mt-3" style={{ color: '#999AAA' }}>
                No payment history yet. Log a session first to track what you owe.
              </p>
            </div>
          )}
        </>
      </div>
    </div>
  )
}
