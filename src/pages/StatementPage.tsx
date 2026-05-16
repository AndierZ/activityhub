import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, addMonths, subMonths, parseISO } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { getMonthlyStatement } from '../lib/db/payments'
import { getSavedTeachers } from '../lib/db/teachers'
import { getChildren } from '../lib/db/children'
import { LogPaymentForm } from './PaymentsPage'
import {
  getChildColor, CHILD_COLOR_HEX, CHILD_COLOR_BG, getInitials,
} from '../types'
import type { MonthlyStatement, Child, UserTeacher } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAmt(n: number): string {
  return `$${Math.abs(n).toFixed(2)}`
}

function balanceLabel(n: number): { text: string; color: string } {
  if (Math.abs(n) < 0.01) return { text: 'Settled',   color: '#26B99A' }
  if (n > 0)              return { text: 'You owe',   color: '#C0830A' }
  return                         { text: 'In credit', color: '#26B99A' }
}

// ─── StatementPage ────────────────────────────────────────────────────────────

export function StatementPage() {
  const { childId, teacherId } = useParams<{ childId: string; teacherId: string }>()
  const { user }   = useAuth()
  const navigate   = useNavigate()

  const [statement,     setStatement]     = useState<MonthlyStatement | null>(null)
  const [statMonth,     setStatMonth]     = useState(new Date())
  const [children,      setChildren]      = useState<Child[]>([])
  const [savedTeachers, setSavedTeachers] = useState<UserTeacher[]>([])
  const [loading,       setLoading]       = useState(true)
  const [showLogForm,   setShowLogForm]   = useState(false)

  useEffect(() => {
    if (!user || !childId || !teacherId) return
    Promise.all([
      getChildren(user.id).then(setChildren),
      getSavedTeachers(user.id).then(setSavedTeachers),
    ]).catch(console.error)
  }, [user, childId, teacherId])

  useEffect(() => {
    if (!user || !childId || !teacherId) return
    loadStatement()
  }, [user, childId, teacherId, statMonth])

  async function loadStatement() {
    if (!user || !childId || !teacherId) return
    setLoading(true)
    try {
      const data = await getMonthlyStatement(
        user.id, childId, teacherId,
        statMonth.getFullYear(),
        statMonth.getMonth() + 1,
      )
      setStatement(data)
    } catch (err) {
      console.error(err)
      setStatement(null)
    } finally {
      setLoading(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const teacher = statement?.teacher
  const child   = statement?.child

  const childColor = child ? getChildColor(child.display_order) : 'purple'
  const hex        = CHILD_COLOR_HEX[childColor]
  const bg         = CHILD_COLOR_BG[childColor]

  const closing     = statement?.closing_balance  ?? 0
  const opening     = statement?.opening_balance  ?? 0
  const closingInfo = balanceLabel(closing)
  const openingInfo = balanceLabel(opening)

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 pt-3 pb-2.5 flex-shrink-0"
        style={{ borderBottom: '0.5px solid #E8E8EC' }}
      >
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center">
          <i className="ti ti-arrow-left" style={{ fontSize: 18, color: '#555566' }} />
        </button>
        <div className="flex-1 text-sm font-semibold truncate" style={{ color: '#1A1A2E' }}>
          {teacher?.name ?? '…'}
        </div>
      </div>

      {/* Month navigator */}
      <div
        className="flex items-center justify-between px-5 py-2.5 flex-shrink-0"
        style={{ borderBottom: '0.5px solid #E8E8EC' }}
      >
        <button onClick={() => setStatMonth(m => subMonths(m, 1))} className="p-1.5" style={{ color: '#999AAA' }}>
          <i className="ti ti-chevron-left text-xs" />
        </button>
        <span className="text-sm font-semibold" style={{ color: '#1A1A2E' }}>
          {format(statMonth, 'MMMM yyyy')}
        </span>
        <button onClick={() => setStatMonth(m => addMonths(m, 1))} className="p-1.5" style={{ color: '#999AAA' }}>
          <i className="ti ti-chevron-right text-xs" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pb-24">

        {loading ? (
          <div className="flex items-center justify-center pt-16">
            <span className="text-[13px]" style={{ color: '#999AAA' }}>Loading…</span>
          </div>
        ) : !statement || statement.entries.length === 0 ? (
          <>
            {/* Still show hero if we have teacher/child data */}
            {teacher && child && (
              <div className="mx-5 mt-4 rounded-[14px] overflow-hidden" style={{ background: bg, border: `0.5px solid ${hex}22` }}>
                <div className="px-4 pt-4 pb-3 flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-[9px] flex items-center justify-center text-xs font-bold"
                    style={{ background: '#fff', color: hex }}
                  >
                    {getInitials(teacher.name)}
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold" style={{ color: hex }}>
                      {teacher.subject} · {teacher.name}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: hex, opacity: 0.7 }}>
                      {child.name} · {format(statMonth, 'MMM yyyy')}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-col items-center justify-center pt-10 text-center px-8">
              <i className="ti ti-calendar-off" style={{ fontSize: 32, color: '#D8D8DC' }} />
              <p className="text-sm mt-3" style={{ color: '#999AAA' }}>
                No sessions or payments in {format(statMonth, 'MMMM yyyy')}
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Statement hero */}
            <div
              className="mx-5 mt-4 rounded-[14px] overflow-hidden"
              style={{ background: bg, border: `0.5px solid ${hex}22` }}
            >
              {/* Title row */}
              <div className="px-4 pt-4 pb-3 flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-[9px] flex items-center justify-center text-xs font-bold"
                  style={{ background: '#fff', color: hex }}
                >
                  {getInitials(teacher!.name)}
                </div>
                <div>
                  <div className="text-[14px] font-semibold" style={{ color: hex }}>
                    {teacher!.subject} · {teacher!.name}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: hex, opacity: 0.7 }}>
                    {child!.name} · {format(statMonth, 'MMM yyyy')}
                  </div>
                </div>
              </div>

              {/* Opening / closing */}
              <div className="px-4 pb-4 flex gap-2.5">
                <div
                  className="flex-1 p-2.5 rounded-[9px]"
                  style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.06)' }}
                >
                  <div
                    className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                    style={{ color: hex, opacity: 0.7 }}
                  >
                    Opening
                  </div>
                  <div className="text-[18px] font-semibold" style={{ color: hex, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtAmt(opening)}
                  </div>
                  {Math.abs(opening) > 0.01 && (
                    <div className="text-[10px] mt-0.5" style={{ color: openingInfo.color }}>
                      {openingInfo.text}
                    </div>
                  )}
                </div>
                <div
                  className="flex-1 p-2.5 rounded-[9px]"
                  style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.06)' }}
                >
                  <div
                    className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                    style={{ color: hex, opacity: 0.7 }}
                  >
                    Closing
                  </div>
                  <div
                    className="text-[18px] font-semibold"
                    style={{ color: closingInfo.color, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {fmtAmt(closing)}
                  </div>
                  {Math.abs(closing) > 0.01 && (
                    <div className="text-[10px] mt-0.5" style={{ color: closingInfo.color }}>
                      {closingInfo.text}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Ledger entries */}
            <div className="px-5 mt-4">
              {statement.entries.map((entry, i) => {
                const isSession  = entry.type === 'session'
                const isPayment  = entry.type === 'payment'
                const entryDate  = parseISO(entry.date)
                const runBalance = balanceLabel(entry.running_balance)

                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 py-3"
                    style={{ borderTop: i > 0 ? '0.5px solid #E8E8EC' : 'none' }}
                  >
                    {/* Date */}
                    <div
                      className="text-[11px] font-medium w-10 flex-shrink-0 pt-0.5"
                      style={{ color: '#999AAA' }}
                    >
                      {format(entryDate, 'MMM d')}
                    </div>

                    {/* Icon */}
                    <div
                      className="w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: isPayment ? '#EEEBfd' : '#F5F5F7' }}
                    >
                      <i
                        className={`ti ${isSession ? 'ti-calendar-event' : 'ti-check'}`}
                        style={{ fontSize: 13, color: isPayment ? '#7C6EE6' : '#555566' }}
                      />
                    </div>

                    {/* Description */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium" style={{ color: '#1A1A2E' }}>
                        {entry.description}
                      </div>
                      {entry.note && (
                        <div className="text-[11px] mt-0.5" style={{ color: '#999AAA' }}>
                          {entry.note}
                        </div>
                      )}
                    </div>

                    {/* Amount + running balance */}
                    <div className="text-right flex-shrink-0">
                      <div
                        className="text-[13px] font-semibold"
                        style={{
                          color: isPayment ? '#26B99A' : '#1A1A2E',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {isPayment ? '−' : '+'}{fmtAmt(entry.amount)}
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: runBalance.color }}>
                        {fmtAmt(entry.running_balance)} {entry.running_balance !== 0 ? (entry.running_balance > 0 ? 'owed' : 'credit') : 'settled'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Log payment sticky footer */}
      <div
        className="flex-shrink-0"
        style={{ borderTop: '0.5px solid #E8E8EC', background: '#fff' }}
      >
        {showLogForm ? (
          <LogPaymentForm
            children={children}
            savedTeachers={savedTeachers}
            preChildId={childId}
            preTeacherId={teacherId}
            onSave={() => { setShowLogForm(false); loadStatement() }}
            onCancel={() => setShowLogForm(false)}
          />
        ) : (
          <button
            onClick={() => setShowLogForm(true)}
            className="w-full flex items-center justify-center gap-2 py-4"
            style={{ color: '#7C6EE6' }}
          >
            <i className="ti ti-plus" style={{ fontSize: 15 }} />
            <span className="text-[13px] font-medium">Log a payment</span>
          </button>
        )}
      </div>

    </div>
  )
}
