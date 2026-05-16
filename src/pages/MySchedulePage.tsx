import { useState, useEffect } from 'react'
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameDay, isToday, parseISO,
  addWeeks, subWeeks,
} from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { getTeacherWeekSessions, type TeacherSessionRow } from '../lib/db/teachers'
import { confirmSession, unconfirmSession } from '../lib/db/sessions'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTimeRange(startsAt: string, endsAt: string): string {
  return `${format(parseISO(startsAt), 'h:mm')}–${format(parseISO(endsAt), 'h:mm a')}`
}

function fmtPrice(price: number): string {
  return `$${price.toFixed(2).replace(/\.00$/, '')}`
}

// ─── Session card ─────────────────────────────────────────────────────────────

function SessionCard({
  session,
  onSelect,
  onConfirm,
  onUnconfirm,
}: {
  session: TeacherSessionRow
  onSelect: (s: TeacherSessionRow) => void
  onConfirm: (id: string) => void
  onUnconfirm: (id: string) => void
}) {
  const confirmed  = !!session.teacher_confirmed_at
  const completed  = session.status === 'completed'

  return (
    <div
      className="rounded-[10px] px-3 py-2.5 mb-2 flex items-center gap-2"
      style={{ background: '#EEEBfd', borderLeft: '3px solid #7C6EE6' }}
    >
      {/* Tap target for detail */}
      <button className="flex-1 text-left min-w-0" onClick={() => onSelect(session)}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-[13px]" style={{ color: '#1A1A2E' }}>
            {session.child.name}
          </span>
          {completed && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: '#C8F0E8', color: '#1A8A73' }}>
              Completed
            </span>
          )}
          {confirmed && !completed && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex items-center gap-1" style={{ background: '#E0F7F2', color: '#1A8A73' }}>
              <i className="ti ti-check" style={{ fontSize: 10 }} />
              Confirmed
            </span>
          )}
        </div>
        <div className="text-[12px] mt-0.5" style={{ color: '#555566' }}>
          {fmtTimeRange(session.starts_at, session.ends_at)}
        </div>
      </button>

      {!confirmed ? (
        <button
          onClick={(e) => { e.stopPropagation(); onConfirm(session.id) }}
          className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold"
          style={{ background: '#7C6EE6', color: '#fff' }}
        >
          <i className="ti ti-check" style={{ fontSize: 12 }} />
          Confirm
        </button>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onUnconfirm(session.id) }}
          className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold"
          style={{ background: '#fff', color: '#999AAA', border: '0.5px solid #E8E8EC' }}
        >
          <i className="ti ti-x" style={{ fontSize: 12 }} />
          Unconfirm
        </button>
      )}
    </div>
  )
}

// ─── Detail sheet ─────────────────────────────────────────────────────────────

function DetailSheet({
  session,
  onClose,
  onConfirm,
  onUnconfirm,
}: {
  session: TeacherSessionRow
  onClose: () => void
  onConfirm: (id: string) => void
  onUnconfirm: (id: string) => void
}) {
  const confirmed = !!session.teacher_confirmed_at

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
      <div
        className="fixed bottom-0 left-1/2 z-50 w-full rounded-t-[20px] p-5"
        style={{ transform: 'translateX(-50%)', maxWidth: 430, background: '#fff', boxShadow: '0 -4px 24px rgba(0,0,0,0.12)' }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: '#E8E8EC' }} />

        <div className="flex items-center justify-between mb-4">
          <div className="text-[17px] font-bold" style={{ color: '#1A1A2E' }}>
            {session.child.name}
          </div>
          {confirmed && (
            <span className="text-[11px] font-semibold px-2 py-1 rounded-md flex items-center gap-1" style={{ background: '#E0F7F2', color: '#1A8A73' }}>
              <i className="ti ti-circle-check" style={{ fontSize: 12 }} />
              Confirmed
            </span>
          )}
        </div>

        <div className="space-y-3 mb-5">
          <SheetRow icon="ti-clock"            label="Time"   value={fmtTimeRange(session.starts_at, session.ends_at)} />
          <SheetRow icon="ti-calendar"          label="Date"   value={format(parseISO(session.starts_at), 'EEEE, MMMM d, yyyy')} />
          <SheetRow icon="ti-currency-dollar"   label="Rate"   value={fmtPrice(session.price)} />
          <SheetRow
            icon="ti-circle-check"
            label="Status"
            value={session.status === 'completed' ? 'Completed by family' : 'Scheduled'}
            valueColor={session.status === 'completed' ? '#26B99A' : '#555566'}
          />
          {session.notes && <SheetRow icon="ti-notes" label="Notes" value={session.notes} />}
        </div>

        {!confirmed && (
          <button
            onClick={() => { onConfirm(session.id); onClose() }}
            className="w-full py-3 rounded-[12px] text-[14px] font-semibold flex items-center justify-center gap-2 mb-3"
            style={{ background: '#7C6EE6', color: '#fff' }}
          >
            <i className="ti ti-check" style={{ fontSize: 15 }} />
            Confirm this session
          </button>
        )}

        {confirmed && (
          <button
            onClick={() => { onUnconfirm(session.id); onClose() }}
            className="w-full py-3 rounded-[12px] text-[14px] font-semibold flex items-center justify-center gap-2 mb-3"
            style={{ background: '#fff', color: '#999AAA', border: '0.5px solid #E8E8EC' }}
          >
            <i className="ti ti-x" style={{ fontSize: 15 }} />
            Unconfirm
          </button>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 text-[13px] rounded-[12px]"
          style={{ color: '#555566', border: '0.5px solid #E8E8EC' }}
        >
          Close
        </button>
      </div>
    </>
  )
}

function SheetRow({ icon, label, value, valueColor = '#1A1A2E' }: { icon: string; label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0" style={{ background: '#F5F5F7' }}>
        <i className={`ti ${icon}`} style={{ fontSize: 15, color: '#7C6EE6' }} />
      </div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: '#999AAA' }}>{label}</div>
        <div className="text-[14px] font-medium mt-0.5" style={{ color: valueColor }}>{value}</div>
      </div>
    </div>
  )
}

// ─── MySchedulePage ───────────────────────────────────────────────────────────

export function MySchedulePage() {
  const { claimedTeacher } = useAuth()

  const [weekBase, setWeekBase]       = useState(new Date())
  const [sessions, setSessions]       = useState<TeacherSessionRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [selected, setSelected]       = useState<TeacherSessionRow | null>(null)

  const weekStart = startOfWeek(weekBase, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(weekBase,   { weekStartsOn: 1 })
  const days      = eachDayOfInterval({ start: weekStart, end: weekEnd })

  useEffect(() => {
    if (!claimedTeacher) return
    setLoading(true)
    getTeacherWeekSessions(claimedTeacher.id, weekStart, weekEnd)
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimedTeacher?.id, weekBase])

  async function handleConfirm(sessionId: string) {
    const now = new Date().toISOString()
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, teacher_confirmed_at: now } : s))
    if (selected?.id === sessionId) setSelected(s => s ? { ...s, teacher_confirmed_at: now } : s)
    try {
      await confirmSession(sessionId)
    } catch (err) {
      console.error('confirm_session failed:', err)
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, teacher_confirmed_at: null } : s))
    }
  }

  async function handleUnconfirm(sessionId: string) {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, teacher_confirmed_at: null } : s))
    if (selected?.id === sessionId) setSelected(s => s ? { ...s, teacher_confirmed_at: null } : s)
    try {
      await unconfirmSession(sessionId)
    } catch (err) {
      console.error('unconfirm_session failed:', err)
      const now = new Date().toISOString()
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, teacher_confirmed_at: now } : s))
    }
  }

  const dayHasSessions = (day: Date) => sessions.some(s => isSameDay(parseISO(s.starts_at), day))
  const dayUnconfirmedCount = (day: Date) => sessions.filter(s => isSameDay(parseISO(s.starts_at), day) && !s.teacher_confirmed_at).length

  const dayLabel = isToday(selectedDay)
    ? `Today, ${format(selectedDay, 'MMMM d')}`
    : format(selectedDay, 'EEEE, MMMM d')

  const daySessions = sessions
    .filter(s => isSameDay(parseISO(s.starts_at), selectedDay))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  const weekTitle = `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`

  const totalUnconfirmed = sessions.filter(s => !s.teacher_confirmed_at).length

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#F5F5F7' }}>

      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3" style={{ background: '#fff', borderBottom: '0.5px solid #E8E8EC' }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-serif text-[22px] leading-tight" style={{ color: '#1A1A2E' }}>My Schedule</div>
            {claimedTeacher && (
              <div className="text-[12px]" style={{ color: '#999AAA' }}>
                {claimedTeacher.name} · {claimedTeacher.subject}
              </div>
            )}
          </div>
          {/* Pending confirmations badge */}
          {!loading && totalUnconfirmed > 0 && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold"
              style={{ background: '#EEEBfd', color: '#7C6EE6' }}
            >
              <i className="ti ti-clock" style={{ fontSize: 13 }} />
              {totalUnconfirmed} to confirm
            </div>
          )}
        </div>
      </div>

      {/* Week strip */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2" style={{ background: '#fff', borderBottom: '0.5px solid #E8E8EC' }}>
        <div className="flex items-center justify-between mb-2.5">
          <button
            onClick={() => { setWeekBase(w => subWeeks(w, 1)); setSelectedDay(d => subWeeks(d, 1)) }}
            className="w-7 h-7 flex items-center justify-center rounded-full"
            style={{ background: '#F5F5F7' }}
          >
            <i className="ti ti-chevron-left" style={{ fontSize: 14, color: '#555566' }} />
          </button>
          <span className="text-[12px] font-medium" style={{ color: '#555566' }}>{weekTitle}</span>
          <button
            onClick={() => { setWeekBase(w => addWeeks(w, 1)); setSelectedDay(d => addWeeks(d, 1)) }}
            className="w-7 h-7 flex items-center justify-center rounded-full"
            style={{ background: '#F5F5F7' }}
          >
            <i className="ti ti-chevron-right" style={{ fontSize: 14, color: '#555566' }} />
          </button>
        </div>

        <div className="flex gap-1">
          {days.map(day => {
            const isSelected  = isSameDay(day, selectedDay)
            const today       = isToday(day)
            const hasSess     = dayHasSessions(day)
            const unconfirmed = dayUnconfirmedCount(day)

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDay(day)}
                className="flex-1 flex flex-col items-center py-1.5 rounded-[10px]"
                style={{
                  background: isSelected ? '#fff' : 'transparent',
                  border: isSelected ? '1.5px solid #7C6EE6' : '1.5px solid transparent',
                }}
              >
                <span className="text-[10px] font-medium" style={{ color: isSelected ? '#7C6EE6' : '#999AAA' }}>
                  {format(day, 'EEE')[0]}
                </span>
                <span
                  className="text-[13px] font-semibold mt-0.5"
                  style={{ color: isSelected ? '#7C6EE6' : today ? '#1A1A2E' : '#555566' }}
                >
                  {format(day, 'd')}
                </span>
                <div className="h-2 mt-0.5 flex items-center justify-center">
                  {hasSess && (
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: unconfirmed > 0 ? '#7C6EE6' : '#26B99A' }}
                    />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Day content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
        <div className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: '#999AAA' }}>
          {dayLabel}
        </div>

        {loading ? (
          <div className="flex justify-center pt-8">
            <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: '#EEEBfd', borderTopColor: '#7C6EE6' }} />
          </div>
        ) : daySessions.length === 0 ? (
          <div className="flex flex-col items-center pt-10 text-center px-6">
            <i className="ti ti-calendar-off" style={{ fontSize: 32, color: '#D8D8DC' }} />
            <p className="text-[13px] mt-3" style={{ color: '#999AAA' }}>
              No sessions logged for this day.
              <br />Your students' families report sessions as they happen.
            </p>
          </div>
        ) : (
          daySessions.map(s => (
            <SessionCard
              key={s.id}
              session={s}
              onSelect={setSelected}
              onConfirm={handleConfirm}
              onUnconfirm={handleUnconfirm}
            />
          ))
        )}
      </div>

      {selected && (
        <DetailSheet
          session={selected}
          onClose={() => setSelected(null)}
          onConfirm={handleConfirm}
          onUnconfirm={handleUnconfirm}
        />
      )}
    </div>
  )
}
