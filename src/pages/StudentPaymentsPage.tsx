import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, startOfMonth, addMonths } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { getAllBalances, logPayment, logPrepayment } from '../lib/db/payments'
import { getMonthlySessionSummary } from '../lib/db/sessions'
import { getSavedTeachers } from '../lib/db/teachers'
import { getChildren } from '../lib/db/children'
import {
  getChildColor, CHILD_COLOR_HEX, CHILD_COLOR_BG,
} from '../types'
import type { BalanceSummary, Child, UserTeacher } from '../types'

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

type PaymentMode = 'payment' | 'prepayment'

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
  const { user, effectiveUserId } = useAuth()
  const uid = effectiveUserId ?? user?.id ?? ''
  const [childId,    setChildId]    = useState(preChildId    ?? children[0]?.id    ?? '')
  const [teacherId,  setTeacherId]  = useState(preTeacherId  ?? savedTeachers[0]?.teacher_id ?? '')
  const [amount,     setAmount]     = useState('')
  const [date,       setDate]       = useState(format(new Date(), 'yyyy-MM-dd'))
  const [note,       setNote]       = useState('')
  const [mode,       setMode]       = useState<PaymentMode>('payment')
  const [saving,     setSaving]     = useState(false)

  async function handleSave() {
    if (!user || !childId || !teacherId || !amount) return
    setSaving(true)
    try {
      const payload = {
        child_id:   childId,
        teacher_id: teacherId,
        amount:     parseFloat(amount),
        date,
        note:       note.trim() || undefined,
      }
      if (mode === 'prepayment') {
        await logPrepayment(uid, payload)
      } else {
        await logPayment(uid, payload)
      }
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

      {/* Type */}
      <div className="flex gap-2 mb-2">
        {([
          ['payment', 'Payment made'],
          ['prepayment', 'Prepayment'],
        ] as const).map(([value, label]) => {
          const active = mode === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className="flex-1 py-2 rounded-[9px] text-sm font-medium"
              style={{
                background: active ? '#EEEBfd' : '#fff',
                border:     `0.5px solid ${active ? '#7C6EE6' : '#E8E8EC'}`,
                color:      active ? '#7C6EE6' : '#555566',
              }}
            >
              {label}
            </button>
          )
        })}
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
          {saving ? 'Saving…' : mode === 'prepayment' ? 'Save prepayment' : 'Save payment'}
        </button>
      </div>
    </div>
  )
}

// ─── StudentPaymentsPage ──────────────────────────────────────────────────────

export function StudentPaymentsPage() {
  const { user, effectiveUserId } = useAuth()
  const uid = effectiveUserId ?? user?.id ?? ''
  const navigate  = useNavigate()

  const [balances,       setBalances]       = useState<BalanceSummary[]>([])
  const [children,       setChildren]       = useState<Child[]>([])
  const [savedTeachers,  setSavedTeachers]  = useState<UserTeacher[]>([])
  const [scheduledThisMonth, setScheduledThisMonth] = useState(0)
  const [realizedThisMonth,  setRealizedThisMonth]  = useState(0)
  const [scheduledCount,     setScheduledCount]     = useState(0)
  const [realizedCount,      setRealizedCount]      = useState(0)
  const [monthByPair,        setMonthByPair]        = useState<Record<string, { scheduledAmount: number; realizedAmount: number; scheduledCount: number; realizedCount: number }>>({})

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

      const [balancesData, childrenData, teachersData, sessionSummary] = await Promise.all([
        getAllBalances(uid),
        getChildren(uid),
        getSavedTeachers(uid),
        getMonthlySessionSummary(uid, monthStart, monthEnd),
      ])

      setBalances(balancesData)
      setChildren(childrenData)
      setSavedTeachers(teachersData)
      setScheduledThisMonth(sessionSummary.scheduledAmount)
      setRealizedThisMonth(sessionSummary.realizedAmount)
      setScheduledCount(sessionSummary.scheduledCount)
      setRealizedCount(sessionSummary.realizedCount)
      setMonthByPair(sessionSummary.byPair)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const monthTotal = realizedThisMonth + scheduledThisMonth
  const monthPct   = monthTotal > 0 ? (realizedThisMonth / monthTotal) * 100 : 0

  const balancePairKeys = new Set(balances.map(b => `${b.child.id}:${b.teacher.id}`))
  const upcomingOnlyRows = Object.entries(monthByPair)
    .filter(([key, data]) => !balancePairKeys.has(key) && data.scheduledAmount > 0)
    .flatMap(([key, data]) => {
      const [childId, teacherId] = key.split(':')
      const child = children.find(c => c.id === childId)
      const ut    = savedTeachers.find(ut => ut.teacher_id === teacherId)
      if (!child || !ut?.teacher) return []
      return [{ child, teacher: ut.teacher, scheduledAmount: data.scheduledAmount, realizedAmount: data.realizedAmount, scheduledCount: data.scheduledCount, realizedCount: data.realizedCount }]
    })

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
          {/* Monthly summary */}
          <div className="mx-5 mt-4 p-4 rounded-[14px]" style={{ border: '0.5px solid #E8E8EC' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#999AAA' }}>
                {format(new Date(), 'MMM yyyy')}
              </div>
            </div>

            {loading ? (
              <div className="h-8 w-32 rounded-lg" style={{ background: '#F5F5F7' }} />
            ) : monthTotal > 0 ? (
              <>
                <div className="flex justify-between mb-2">
                  <div>
                    <div className="text-[22px] font-bold leading-none" style={{ color: '#26B99A', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtAmt(realizedThisMonth)}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: '#26B99A' }}>{realizedCount} completed</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[22px] font-bold leading-none" style={{ color: '#999AAA', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtAmt(scheduledThisMonth)}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: '#999AAA' }}>{scheduledCount} upcoming</div>
                  </div>
                </div>
                <div className="h-[5px] rounded-full overflow-hidden" style={{ background: '#E8E8EC' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${monthPct}%`, background: '#26B99A' }}
                  />
                </div>
              </>
            ) : (
              <div className="text-[13px]" style={{ color: '#999AAA' }}>No sessions logged this month.</div>
            )}
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

                    const amtColor  = owed ? '#E8A838' : '#26B99A'
                    const statusLbl = owed ? 'you owe' : 'in credit'
                    const statusClr = owed ? '#C0830A' : '#26B99A'

                    const pairKey  = `${b.child.id}:${b.teacher.id}`
                    const pairData = monthByPair[pairKey]
                    const pairTotal = pairData ? pairData.realizedAmount + pairData.scheduledAmount : 0
                    const pairPct   = pairTotal > 0 ? (pairData!.realizedAmount / pairTotal) * 100 : 0

                    return (
                      <button
                        key={pairKey}
                        onClick={() => navigate(`/payments/${b.child.id}/${b.teacher.id}`)}
                        className="w-full flex flex-col px-3.5 py-3 text-left"
                        style={{ borderTop: i > 0 ? '0.5px solid #E8E8EC' : 'none', background: '#fff' }}
                      >
                        {/* Top row: icon + info + chevron */}
                        <div className="flex items-center gap-3 w-full">
                          <div
                            className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                            style={{ background: bg }}
                          >
                            <i className={`ti ${subjectIcon(b.teacher.subject)}`} style={{ fontSize: 16, color: hex }} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium truncate" style={{ color: '#1A1A2E' }}>
                              {b.teacher.subject} · {b.teacher.name}
                            </div>
                            <div className="text-[11px] mt-0.5" style={{ color: '#999AAA' }}>
                              {b.child.name}
                            </div>
                            {pairTotal > 0 && (
                              <>
                                <div className="flex justify-between mt-1.5">
                                  <div className="flex flex-col">
                                    <span className="text-[11px] font-semibold" style={{ color: '#26B99A', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(pairData!.realizedAmount)}</span>
                                    <span className="text-[10px]" style={{ color: '#26B99A' }}>{pairData!.realizedCount} completed</span>
                                  </div>
                                  <div className="flex flex-col items-end">
                                    <span className="text-[11px] font-semibold" style={{ color: '#999AAA', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(pairData!.scheduledAmount)}</span>
                                    <span className="text-[10px]" style={{ color: '#999AAA' }}>{pairData!.scheduledCount} upcoming</span>
                                  </div>
                                </div>
                                <div className="mt-1.5 h-[3px] rounded-full overflow-hidden" style={{ background: '#E8E8EC' }}>
                                  <div className="h-full rounded-full" style={{ width: `${pairPct}%`, background: '#26B99A' }} />
                                </div>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <i className="ti ti-chevron-right" style={{ fontSize: 14, color: '#999AAA' }} />
                          </div>
                        </div>

                        {/* Balance row */}
                        <div
                          className="flex items-center justify-between w-full mt-2.5 pt-2"
                          style={{ borderTop: '0.5px solid #F0F0F4' }}
                        >
                          <span className="text-[11px]" style={{ color: '#C8C8D0' }}>
                            Balance · completed sessions
                          </span>
                          {settled ? (
                            <span className="text-[11px] font-medium" style={{ color: '#999AAA' }}>Settled</span>
                          ) : (
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-[13px] font-semibold" style={{ color: amtColor, fontVariantNumeric: 'tabular-nums' }}>
                                {fmtAmt(b.balance)}
                              </span>
                              <span className="text-[10px]" style={{ color: statusClr }}>{statusLbl}</span>
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

          {/* Upcoming-only rows — teachers with only scheduled sessions this month */}
          {!loading && upcomingOnlyRows.length > 0 && (
            <div className="px-5 mt-4 pb-2">
              {!balances.length && (
                <div
                  className="text-[11px] font-semibold uppercase tracking-wide mb-2"
                  style={{ color: '#999AAA' }}
                >
                  {format(new Date(), 'MMM yyyy')}
                </div>
              )}
              <div className="rounded-[14px] overflow-hidden" style={{ border: '0.5px solid #E8E8EC' }}>
                {upcomingOnlyRows.map((row, i) => {
                  const color     = getChildColor(row.child.display_order)
                  const hex       = CHILD_COLOR_HEX[color]
                  const bg        = CHILD_COLOR_BG[color]
                  const pairTotal = row.realizedAmount + row.scheduledAmount
                  const pairPct   = pairTotal > 0 ? (row.realizedAmount / pairTotal) * 100 : 0
                  return (
                    <button
                      key={`${row.child.id}:${row.teacher.id}`}
                      onClick={() => navigate(`/payments/${row.child.id}/${row.teacher.id}`)}
                      className="w-full flex flex-col px-3.5 py-3 text-left"
                      style={{ borderTop: i > 0 ? '0.5px solid #E8E8EC' : 'none', background: '#fff' }}
                    >
                      {/* Top row */}
                      <div className="flex items-center gap-3 w-full">
                        <div
                          className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                          style={{ background: bg }}
                        >
                          <i className={`ti ${subjectIcon(row.teacher.subject)}`} style={{ fontSize: 16, color: hex }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium truncate" style={{ color: '#1A1A2E' }}>
                            {row.teacher.subject} · {row.teacher.name}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: '#999AAA' }}>{row.child.name}</div>
                          <div className="flex justify-between mt-1.5">
                            <div className="flex flex-col">
                              <span className="text-[11px] font-semibold" style={{ color: '#26B99A', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(row.realizedAmount)}</span>
                              <span className="text-[10px]" style={{ color: '#26B99A' }}>{row.realizedCount} completed</span>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="text-[11px] font-semibold" style={{ color: '#999AAA', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(row.scheduledAmount)}</span>
                              <span className="text-[10px]" style={{ color: '#999AAA' }}>{row.scheduledCount} upcoming</span>
                            </div>
                          </div>
                          <div className="mt-1.5 h-[3px] rounded-full overflow-hidden" style={{ background: '#E8E8EC' }}>
                            <div className="h-full rounded-full" style={{ width: `${pairPct}%`, background: '#26B99A' }} />
                          </div>
                        </div>
                        <i className="ti ti-chevron-right flex-shrink-0" style={{ fontSize: 14, color: '#999AAA' }} />
                      </div>
                      {/* Balance row */}
                      <div
                        className="flex items-center justify-between w-full mt-2.5 pt-2"
                        style={{ borderTop: '0.5px solid #F0F0F4' }}
                      >
                        <span className="text-[11px]" style={{ color: '#C8C8D0' }}>Balance · completed sessions</span>
                        <span className="text-[11px] font-medium" style={{ color: '#999AAA' }}>Settled</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {!loading && balances.length === 0 && upcomingOnlyRows.length === 0 && (
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
