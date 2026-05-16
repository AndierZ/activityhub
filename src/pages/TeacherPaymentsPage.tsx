import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getTeacherStudentBalances, type TeacherStudentBalance } from '../lib/db/payments'

function fmtAmt(n: number): string {
  return `$${Math.abs(n).toFixed(2).replace(/\.00$/, '')}`
}

export function TeacherPaymentsPage() {
  const { claimedTeacher } = useAuth()
  const navigate = useNavigate()

  const [rows,    setRows]    = useState<TeacherStudentBalance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!claimedTeacher) return
    getTeacherStudentBalances(claimedTeacher.id)
      .then(setRows)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [claimedTeacher?.id])

  const totalOutstanding = rows.reduce((s, r) => s + Math.max(r.balance, 0), 0)
  const totalPaid        = rows.reduce((s, r) => s + r.total_paid, 0)

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

        {/* Summary hero */}
        {!loading && rows.length > 0 && (
          <div className="mx-5 mt-4 p-4 rounded-[14px]" style={{ border: '0.5px solid #E8E8EC', background: '#fff' }}>
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#999AAA' }}>
                  Outstanding
                </div>
                <div className="text-[24px] font-bold leading-none" style={{ color: totalOutstanding > 0 ? '#E8A838' : '#26B99A', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtAmt(totalOutstanding)}
                </div>
                <div className="text-[11px] mt-1" style={{ color: '#999AAA' }}>
                  {rows.filter(r => r.balance > 0.01).length} student{rows.filter(r => r.balance > 0.01).length !== 1 ? 's' : ''} owe
                </div>
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#999AAA' }}>
                  Total received
                </div>
                <div className="text-[24px] font-bold leading-none" style={{ color: '#26B99A', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtAmt(totalPaid)}
                </div>
                <div className="text-[11px] mt-1" style={{ color: '#999AAA' }}>all time</div>
              </div>
            </div>
          </div>
        )}

        {/* Student list */}
        {loading ? (
          <div className="flex justify-center pt-12">
            <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: '#EEEBfd', borderTopColor: '#7C6EE6' }} />
          </div>
        ) : rows.length === 0 ? (
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
              {rows.map((row, i) => {
                const settled  = Math.abs(row.balance) < 0.01
                const owed     = row.balance > 0
                const amtLabel = settled ? 'Settled' : owed ? fmtAmt(row.balance) : `${fmtAmt(row.balance)} credit`
                const amtColor = settled ? '#999AAA' : owed ? '#E8A838' : '#26B99A'
                const dotColor = settled ? '#26B99A' : owed ? '#E8A838' : '#26B99A'

                return (
                  <button
                    key={`${row.user_id}:${row.child_id}`}
                    onClick={() => navigate(`/payments/${row.user_id}/${row.child_id}`)}
                    className="w-full flex items-center gap-3 px-3.5 py-3"
                    style={{ borderTop: i > 0 ? '0.5px solid #E8E8EC' : 'none', background: '#fff' }}
                  >
                    {/* Avatar */}
                    <div
                      className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
                      style={{ background: '#EEEBfd' }}
                    >
                      <i className="ti ti-user" style={{ fontSize: 16, color: '#7C6EE6' }} />
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-[13px] font-medium truncate" style={{ color: '#1A1A2E' }}>
                        {row.child_name}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: '#999AAA' }}>
                        {fmtAmt(row.total_paid)} received total
                      </div>
                    </div>

                    {/* Balance */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-[13px] font-semibold" style={{ color: amtColor, fontVariantNumeric: 'tabular-nums' }}>
                        {amtLabel}
                      </div>
                    </div>

                    <div className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                    <i className="ti ti-chevron-right flex-shrink-0" style={{ fontSize: 14, color: '#999AAA' }} />
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
