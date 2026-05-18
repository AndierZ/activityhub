import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, startOfMonth, addMonths } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { getTeacherStudentBalances, type TeacherStudentBalance } from '../lib/db/payments'
import { getTeacherMonthlySummary, type TeacherMonthlySummary } from '../lib/db/teachers'

function fmtAmt(n: number): string {
  return `$${Math.abs(n).toFixed(2).replace(/\.00$/, '')}`
}

export function TeacherPaymentsPage() {
  const { claimedTeacher } = useAuth()
  const navigate = useNavigate()

  const [rows,    setRows]    = useState<TeacherStudentBalance[]>([])
  const [monthly, setMonthly] = useState<TeacherMonthlySummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!claimedTeacher) return
    const monthStart = startOfMonth(new Date())
    const monthEnd   = addMonths(monthStart, 1)
    Promise.all([
      getTeacherStudentBalances(claimedTeacher.id),
      getTeacherMonthlySummary(claimedTeacher.id, monthStart, monthEnd),
    ])
      .then(([balances, summary]) => {
        setRows(balances)
        setMonthly(summary)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [claimedTeacher?.id])

  // ── Derived ─────────────────────────────────────────────────────────────────

  const realized  = monthly?.realizedThisMonth  ?? 0
  const scheduled = monthly?.scheduledThisMonth ?? 0
  const monthTotal = realized + scheduled
  const monthPct   = monthTotal > 0 ? (realized / monthTotal) * 100 : 0

  // Students who have scheduled sessions this month but no balance history
  const balanceKeys  = new Set(rows.map(r => `${r.user_id}:${r.child_id}`))
  const upcomingOnly = Object.values(monthly?.byStudent ?? {}).filter(
    s => s.scheduledAmount > 0 && !balanceKeys.has(`${s.user_id}:${s.child_id}`)
  )

  const hasAnyRows = rows.length > 0 || upcomingOnly.length > 0

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#F5F5F7' }}>

      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3" style={{ background: '#fff', borderBottom: '0.5px solid #E8E8EC' }}>
        <div className="font-serif text-[22px] leading-tight" style={{ color: '#1A1A2E' }}>Payments</div>
        {claimedTeacher && (
          <div className="text-[12px] mt-0.5" style={{ color: '#999AAA' }}>
            Logged by your students' families
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* Monthly summary hero */}
        <div className="mx-5 mt-4 p-4 rounded-[14px]" style={{ border: '0.5px solid #E8E8EC', background: '#fff' }}>
          <div className="text-[10px] font-semibold uppercase tracking-wide mb-3" style={{ color: '#999AAA' }}>
            {format(new Date(), 'MMM yyyy')}
          </div>
          {loading ? (
            <div className="h-8 w-32 rounded-lg" style={{ background: '#F5F5F7' }} />
          ) : monthTotal > 0 ? (
            <>
              <div className="flex justify-between mb-2">
                <div>
                  <div className="text-[22px] font-bold leading-none" style={{ color: '#26B99A', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtAmt(realized)}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#26B99A' }}>{monthly?.realizedCount ?? 0} completed</div>
                </div>
                <div className="text-right">
                  <div className="text-[22px] font-bold leading-none" style={{ color: '#999AAA', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtAmt(scheduled)}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#999AAA' }}>{monthly?.scheduledCount ?? 0} upcoming</div>
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

        {/* Student list */}
        {loading ? (
          <div className="flex justify-center pt-12">
            <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: '#EEEBfd', borderTopColor: '#7C6EE6' }} />
          </div>
        ) : !hasAnyRows ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center px-8">
            <i className="ti ti-credit-card" style={{ fontSize: 36, color: '#D8D8DC' }} />
            <p className="text-[13px] mt-3" style={{ color: '#999AAA' }}>
              No payment history yet.
              <br />Balances appear once families log sessions.
            </p>
          </div>
        ) : (
          <div className="px-5 mt-4 pb-6">
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#999AAA' }}>
              Students
            </div>
            <div className="rounded-[14px] overflow-hidden" style={{ border: '0.5px solid #E8E8EC' }}>

              {/* Balance rows */}
              {rows.map((row, i) => {
                const settled   = Math.abs(row.balance) < 0.01
                const owed      = row.balance > 0
                const amtColor  = owed ? '#E8A838' : '#26B99A'
                const statusLbl = owed ? 'owes you' : 'in credit'
                const statusClr = owed ? '#C0830A' : '#26B99A'

                const studentKey  = `${row.user_id}:${row.child_id}`
                const studentData = monthly?.byStudent[studentKey]
                const studentTotal = studentData ? studentData.realizedAmount + studentData.scheduledAmount : 0
                const studentPct   = studentTotal > 0 ? (studentData!.realizedAmount / studentTotal) * 100 : 0

                return (
                  <button
                    key={studentKey}
                    onClick={() => navigate(`/payments/${row.user_id}/${row.child_id}`)}
                    className="w-full flex flex-col px-3.5 py-3 text-left"
                    style={{ borderTop: i > 0 ? '0.5px solid #E8E8EC' : 'none', background: '#fff' }}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div
                        className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                        style={{ background: '#EEEBfd' }}
                      >
                        <i className="ti ti-user" style={{ fontSize: 16, color: '#7C6EE6' }} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate" style={{ color: '#1A1A2E' }}>
                          {row.child_name}
                        </div>
                        {studentTotal > 0 && (
                          <>
                            <div className="flex justify-between mt-1.5">
                              <div className="flex flex-col">
                                <span className="text-[11px] font-semibold" style={{ color: '#26B99A', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(studentData!.realizedAmount)}</span>
                                <span className="text-[10px]" style={{ color: '#26B99A' }}>{studentData!.realizedCount} completed</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[11px] font-semibold" style={{ color: '#999AAA', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(studentData!.scheduledAmount)}</span>
                                <span className="text-[10px]" style={{ color: '#999AAA' }}>{studentData!.scheduledCount} upcoming</span>
                              </div>
                            </div>
                            <div className="mt-1.5 h-[3px] rounded-full overflow-hidden" style={{ background: '#E8E8EC' }}>
                              <div className="h-full rounded-full" style={{ width: `${studentPct}%`, background: '#26B99A' }} />
                            </div>
                          </>
                        )}
                      </div>

                      <i className="ti ti-chevron-right flex-shrink-0" style={{ fontSize: 14, color: '#999AAA' }} />
                    </div>

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
                            {fmtAmt(row.balance)}
                          </span>
                          <span className="text-[10px]" style={{ color: statusClr }}>{statusLbl}</span>
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}

              {/* Upcoming-only rows */}
              {upcomingOnly.map((student, i) => {
                const borderTop   = (rows.length > 0 || i > 0) ? '0.5px solid #E8E8EC' : 'none'
                const studentTotal = student.realizedAmount + student.scheduledAmount
                const studentPct   = studentTotal > 0 ? (student.realizedAmount / studentTotal) * 100 : 0
                return (
                  <button
                    key={`${student.user_id}:${student.child_id}`}
                    onClick={() => navigate(`/payments/${student.user_id}/${student.child_id}`)}
                    className="w-full flex flex-col px-3.5 py-3 text-left"
                    style={{ borderTop, background: '#fff' }}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <div
                        className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                        style={{ background: '#EEEBfd' }}
                      >
                        <i className="ti ti-user" style={{ fontSize: 16, color: '#7C6EE6' }} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate" style={{ color: '#1A1A2E' }}>
                          {student.child_name}
                        </div>
                        <div className="flex justify-between mt-1.5">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-semibold" style={{ color: '#26B99A', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(student.realizedAmount)}</span>
                            <span className="text-[10px]" style={{ color: '#26B99A' }}>{student.realizedCount} completed</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[11px] font-semibold" style={{ color: '#999AAA', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(student.scheduledAmount)}</span>
                            <span className="text-[10px]" style={{ color: '#999AAA' }}>{student.scheduledCount} upcoming</span>
                          </div>
                        </div>
                        <div className="mt-1.5 h-[3px] rounded-full overflow-hidden" style={{ background: '#E8E8EC' }}>
                          <div className="h-full rounded-full" style={{ width: `${studentPct}%`, background: '#26B99A' }} />
                        </div>
                      </div>

                      <i className="ti ti-chevron-right flex-shrink-0" style={{ fontSize: 14, color: '#999AAA' }} />
                    </div>

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
      </div>
    </div>
  )
}
