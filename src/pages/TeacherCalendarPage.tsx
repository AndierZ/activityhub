import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameDay, isToday, parseISO,
  addWeeks, subWeeks,
} from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import {
  getTeacherWeekSessions,
  type TeacherSessionRow,
} from '../lib/db/teachers'
import { confirmSession, unconfirmSession } from '../lib/db/sessions'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTimeRange(startsAt: string, endsAt: string): string {
  return `${format(parseISO(startsAt), 'h:mm')}–${format(parseISO(endsAt), 'h:mm a')}`
}

function fmtPrice(price: number): string {
  return `$${price.toFixed(2).replace(/\.00$/, '')}`
}

// ─── Session card ─────────────────────────────────────────────────────────────

function sessionsOverlap(a: TeacherSessionRow, b: TeacherSessionRow): boolean {
  return a.starts_at < b.ends_at && a.ends_at > b.starts_at
}

function buildConflictIds(sessions: TeacherSessionRow[]): Set<string> {
  const ids = new Set<string>()
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      if (sessionsOverlap(sessions[i], sessions[j])) {
        ids.add(sessions[i].id)
        ids.add(sessions[j].id)
      }
    }
  }
  return ids
}

function SessionCard({
  session,
  hasConflict,
  onSelect,
  onConfirm,
  onUnconfirm,
}: {
  session: TeacherSessionRow
  hasConflict: boolean
  onSelect: (s: TeacherSessionRow) => void
  onConfirm: (id: string) => void
  onUnconfirm: (id: string) => void
}) {
  const confirmed = !!session.teacher_confirmed_at
  const completed = session.status === 'completed'

  return (
    <div
      className="rounded-[10px] px-3 py-2.5 mb-2 flex items-center gap-2"
      style={hasConflict
        ? { background: '#FEF8EC', border: '1px solid #E8A838', borderLeft: '3px solid #E8A838' }
        : { background: '#EEEBfd', borderLeft: '3px solid #7C6EE6' }}
    >
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
        {hasConflict && (
          <div className="flex items-center gap-1 mt-1 text-[11px]" style={{ color: '#B87A10' }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 11 }} />
            Overlaps with another student
          </div>
        )}
      </button>

      {!confirmed ? (
        <button
          onClick={e => { e.stopPropagation(); onConfirm(session.id) }}
          className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold"
          style={{ background: '#7C6EE6', color: '#fff' }}
        >
          <i className="ti ti-check" style={{ fontSize: 12 }} />
          Confirm
        </button>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); onUnconfirm(session.id) }}
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
  hasConflict,
  onClose,
  onConfirm,
  onUnconfirm,
}: {
  session: TeacherSessionRow
  hasConflict: boolean
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
          <SheetRow icon="ti-clock"          label="Time"   value={fmtTimeRange(session.starts_at, session.ends_at)} />
          <SheetRow icon="ti-calendar"        label="Date"   value={format(parseISO(session.starts_at), 'EEEE, MMMM d, yyyy')} />
          <SheetRow icon="ti-currency-dollar" label="Rate"   value={fmtPrice(session.price)} />
          <SheetRow
            icon="ti-circle-check"
            label="Status"
            value={session.status === 'completed' ? 'Completed by family' : 'Scheduled'}
            valueColor={session.status === 'completed' ? '#26B99A' : '#555566'}
          />
          {session.notes && <SheetRow icon="ti-notes" label="Notes" value={session.notes} />}
        </div>

        {hasConflict && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] mb-4 text-[12px]" style={{ background: '#FEF8EC', border: '1px solid #E8A838', color: '#B87A10' }}>
            <i className="ti ti-alert-triangle flex-shrink-0" style={{ fontSize: 14 }} />
            This slot overlaps with another student's session.
          </div>
        )}

        {!confirmed ? (
          <button
            onClick={() => { onConfirm(session.id); onClose() }}
            className="w-full py-3 rounded-[12px] text-[14px] font-semibold flex items-center justify-center gap-2 mb-3"
            style={{ background: '#7C6EE6', color: '#fff' }}
          >
            <i className="ti ti-check" style={{ fontSize: 15 }} />
            Confirm this session
          </button>
        ) : (
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

// ─── TeacherCalendarPage ──────────────────────────────────────────────────────

export function TeacherCalendarPage() {
  const { claimedTeacher } = useAuth()

  // ── Core state ──────────────────────────────────────────────────────────────
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [sessions,  setSessions]  = useState<TeacherSessionRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState<TeacherSessionRow | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)

  // ── Display state (lags behind fetch so feed stays visible during load) ─────
  const [dispWeekStart,        setDispWeekStart]        = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [dispSessions,         setDispSessions]         = useState<TeacherSessionRow[]>([])
  const [dispNextWeekSessions, setDispNextWeekSessions] = useState<TeacherSessionRow[]>([])
  const [dispNextWeekStart,    setDispNextWeekStart]    = useState<Date | null>(null)
  const [feedKey,      setFeedKey]      = useState(0)
  const [stripHeight,  setStripHeight]  = useState<number | undefined>(undefined)

  // ── Refs ────────────────────────────────────────────────────────────────────
  const stripRef        = useRef<HTMLDivElement>(null)
  const prevPanelRef    = useRef<HTMLDivElement>(null)
  const currentPanelRef = useRef<HTMLDivElement>(null)
  const nextPanelRef    = useRef<HTMLDivElement>(null)
  const touchStartY     = useRef<number | null>(null)
  const didSwipe        = useRef(false)
  const isAnimating     = useRef(false)
  const feedWrapperRef  = useRef<HTMLDivElement>(null)
  const feedAnimDir     = useRef<'prev' | 'next' | null>(null)
  const pendingNextWeekSessions = useRef<TeacherSessionRow[]>([])
  const pendingNextWeekStart    = useRef<Date | null>(null)

  // ── Derived ─────────────────────────────────────────────────────────────────
  const weekEnd      = endOfWeek(weekStart, { weekStartsOn: 0 })
  const weekDays     = eachDayOfInterval({ start: weekStart, end: weekEnd })
  const prevWeekDays = eachDayOfInterval({ start: subWeeks(weekStart, 1), end: endOfWeek(subWeeks(weekStart, 1), { weekStartsOn: 0 }) })
  const nextWeekDays = eachDayOfInterval({ start: addWeeks(weekStart, 1), end: endOfWeek(addWeeks(weekStart, 1), { weekStartsOn: 0 }) })

  const weekLabel = (() => {
    const sm = format(weekStart, 'MMM')
    const em = format(weekEnd,   'MMM')
    return sm === em
      ? `${sm} ${format(weekStart, 'd')}–${format(weekEnd, 'd')} ${format(weekEnd, 'yyyy')}`
      : `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d yyyy')}`
  })()

  // ── Load sessions ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!claimedTeacher) return
    setLoading(true)
    const nextStart = addWeeks(weekStart, 1)
    const nextEnd   = endOfWeek(nextStart, { weekStartsOn: 0 })
    Promise.all([
      getTeacherWeekSessions(claimedTeacher.id, weekStart, weekEnd),
      getTeacherWeekSessions(claimedTeacher.id, nextStart, nextEnd),
    ])
      .then(([data, upcoming]) => {
        setSessions(data)
        pendingNextWeekStart.current    = nextStart
        pendingNextWeekSessions.current = upcoming
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimedTeacher?.id, weekStart])

  // ── Strip snap + panel opacity reset on week change ──────────────────────────
  useLayoutEffect(() => {
    const strip = stripRef.current
    if (strip) { strip.style.transition = 'none'; strip.style.transform = 'translateY(-33.333%)' }
    for (const [ref, opacity] of [
      [prevPanelRef, '0.5'],
      [currentPanelRef, '1'],
      [nextPanelRef, '0.5'],
    ] as const) {
      const el = ref.current
      if (el) { el.style.transition = 'none'; el.style.opacity = opacity }
    }
  }, [weekStart])

  // ── Measure strip panel height once on mount ──────────────────────────────────
  useLayoutEffect(() => {
    const panel = currentPanelRef.current
    if (panel) setStripHeight(panel.offsetHeight)
  }, [])

  // ── Snap feed wrapper before new display state paints ────────────────────────
  useLayoutEffect(() => {
    if (feedKey === 0) return
    const wrapper = feedWrapperRef.current
    if (!wrapper || !feedAnimDir.current) return
    const dir = feedAnimDir.current
    wrapper.style.transition = 'none'
    wrapper.style.transform  = `translateY(${dir === 'next' ? '20px' : '-20px'})`
    wrapper.style.opacity    = '0'
  }, [feedKey])

  // ── Feed enter animation when display state commits ───────────────────────────
  useEffect(() => {
    if (feedKey === 0) return
    const wrapper = feedWrapperRef.current
    if (!wrapper || !feedAnimDir.current) return
    const rAF = requestAnimationFrame(() => {
      wrapper.style.transition = 'transform 350ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 350ms ease-out'
      wrapper.style.transform  = 'translateY(0)'
      wrapper.style.opacity    = '1'
      feedAnimDir.current = null
    })
    return () => cancelAnimationFrame(rAF)
  }, [feedKey])

  // ── Commit display state when data arrives ───────────────────────────────────
  useEffect(() => {
    if (loading) return
    setDispWeekStart(weekStart)
    setDispSessions(sessions)
    setDispNextWeekSessions(pendingNextWeekSessions.current)
    setDispNextWeekStart(pendingNextWeekStart.current)
    setFeedKey(k => k + 1)
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ────────────────────────────────────────────────────────────────
  function animateFeed(dir: 'prev' | 'next') {
    feedAnimDir.current = dir
    const wrapper = feedWrapperRef.current
    if (!wrapper) return
    wrapper.style.transition = 'transform 200ms ease-in, opacity 200ms ease-in'
    wrapper.style.transform  = `translateY(${dir === 'next' ? '-20px' : '20px'})`
    wrapper.style.opacity    = '0'
  }

  function animatePanels(dir: 'prev' | 'next') {
    const easing = 'opacity 300ms ease'
    const curr = currentPanelRef.current
    const prev = prevPanelRef.current
    const next = nextPanelRef.current
    if (curr) { curr.style.transition = easing; curr.style.opacity = '0.5' }
    if (dir === 'next' && next) { next.style.transition = easing; next.style.opacity = '1' }
    if (dir === 'prev' && prev) { prev.style.transition = easing; prev.style.opacity = '1' }
  }

  function jumpToWeek(target: Date) {
    if (isAnimating.current) return
    isAnimating.current = true
    const dir: 'prev' | 'next' = target > weekStart ? 'next' : 'prev'
    animateFeed(dir)
    animatePanels(dir)
    const strip = stripRef.current
    if (strip) {
      strip.style.transition = 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      strip.style.transform  = dir === 'prev' ? 'translateY(0%)' : 'translateY(-66.666%)'
    }
    setTimeout(() => {
      isAnimating.current = false
      if (dir === 'next') setSessions(pendingNextWeekSessions.current)
      setWeekStart(target)
    }, 300)
  }

  function navigateWeek(dir: 'prev' | 'next') {
    if (isAnimating.current) return
    isAnimating.current = true
    const newStart = dir === 'prev' ? subWeeks(weekStart, 1) : addWeeks(weekStart, 1)
    animateFeed(dir)
    animatePanels(dir)
    const strip = stripRef.current
    if (strip) {
      strip.style.transition = 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      strip.style.transform  = dir === 'prev' ? 'translateY(0%)' : 'translateY(-66.666%)'
    }
    setTimeout(() => {
      isAnimating.current = false
      if (dir === 'next') setSessions(pendingNextWeekSessions.current)
      setWeekStart(newStart)
    }, 300)
  }

  // ── Touch handlers (vertical: swipe up = next, swipe down = prev) ────────────
  function onStripTouchStart(e: React.TouchEvent) {
    if (isAnimating.current) return
    touchStartY.current = e.touches[0].clientY
    didSwipe.current    = false
  }
  function onStripTouchMove(e: React.TouchEvent) {
    if (touchStartY.current === null || isAnimating.current) return
    const delta = e.touches[0].clientY - touchStartY.current
    const strip = stripRef.current
    if (!strip) return
    strip.style.transition = 'none'
    strip.style.transform  = `translateY(calc(-33.333% + ${delta}px))`
  }
  function onStripTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current === null) return
    const delta = e.changedTouches[0].clientY - touchStartY.current
    touchStartY.current = null
    if (Math.abs(delta) > 50 && !isAnimating.current) {
      didSwipe.current = true
      navigateWeek(delta > 0 ? 'prev' : 'next')
    } else {
      if (Math.abs(delta) > 10) didSwipe.current = true
      const strip = stripRef.current
      if (strip) { strip.style.transition = 'transform 180ms ease-out'; strip.style.transform = 'translateY(-33.333%)' }
    }
  }
  function onStripTouchCancel() {
    touchStartY.current = null
    const strip = stripRef.current
    if (!strip) return
    strip.style.transition = 'transform 180ms ease-out'
    strip.style.transform  = 'translateY(-33.333%)'
  }

  // ── Confirm / unconfirm (optimistic) ─────────────────────────────────────────
  async function handleConfirm(sessionId: string) {
    const now   = new Date().toISOString()
    const patch = (arr: TeacherSessionRow[]) =>
      arr.map(s => s.id === sessionId ? { ...s, teacher_confirmed_at: now } : s)
    setSessions(patch)
    setDispSessions(patch)
    if (selected?.id === sessionId) setSelected(s => s ? { ...s, teacher_confirmed_at: now } : s)
    try {
      await confirmSession(sessionId)
    } catch (err) {
      console.error('confirm_session failed:', err)
      const revert = (arr: TeacherSessionRow[]) =>
        arr.map(s => s.id === sessionId ? { ...s, teacher_confirmed_at: null } : s)
      setSessions(revert)
      setDispSessions(revert)
    }
  }

  async function handleUnconfirm(sessionId: string) {
    const patch = (arr: TeacherSessionRow[]) =>
      arr.map(s => s.id === sessionId ? { ...s, teacher_confirmed_at: null } : s)
    setSessions(patch)
    setDispSessions(patch)
    if (selected?.id === sessionId) setSelected(s => s ? { ...s, teacher_confirmed_at: null } : s)
    try {
      await unconfirmSession(sessionId)
    } catch (err) {
      console.error('unconfirm_session failed:', err)
      const now    = new Date().toISOString()
      const revert = (arr: TeacherSessionRow[]) =>
        arr.map(s => s.id === sessionId ? { ...s, teacher_confirmed_at: now } : s)
      setSessions(revert)
      setDispSessions(revert)
    }
  }

  // ── Strip helpers ────────────────────────────────────────────────────────────
  function dayHasSessions(day: Date)    { return sessions.some(s => isSameDay(parseISO(s.starts_at), day)) }
  function dayHasUnconfirmed(day: Date) { return sessions.some(s => isSameDay(parseISO(s.starts_at), day) && !s.teacher_confirmed_at) }

  // ── Feed groups ──────────────────────────────────────────────────────────────
  const studentOptions = Array.from(
    new Map(sessions.map(s => [s.child.id, s.child])).values()
  ).sort((a, b) => a.name.localeCompare(b.name))
  const displayDispSessions = selectedStudentId
    ? dispSessions.filter(s => s.child.id === selectedStudentId)
    : dispSessions

  const dispWeekGroups = eachDayOfInterval({
    start: dispWeekStart,
    end:   endOfWeek(dispWeekStart, { weekStartsOn: 0 }),
  })
    .map(day => ({
      day,
      sessions: displayDispSessions
        .filter(s => isSameDay(parseISO(s.starts_at), day))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    }))
    .filter(g => g.sessions.length > 0)

  const visibleUnconfirmedSessions = displayDispSessions.filter(s => s.status !== 'completed' && !s.teacher_confirmed_at)
  const totalUnconfirmed = visibleUnconfirmedSessions.length
  const conflictIds      = buildConflictIds([...dispSessions, ...dispNextWeekSessions])

  function jumpToFirstUnconfirmed() {
    const target = visibleUnconfirmedSessions[0]
    if (!target) return
    setSelected(target)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="font-serif text-[22px] leading-tight" style={{ color: '#1A1A2E' }}>Calendar</div>
          {totalUnconfirmed > 0 && (
            <button
              onClick={jumpToFirstUnconfirmed}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold"
              style={{ background: '#EEEBfd', color: '#7C6EE6' }}
            >
              <i className="ti ti-clock" style={{ fontSize: 13 }} />
              {totalUnconfirmed} to confirm
            </button>
          )}
        </div>
      </div>

      {/* Student filter tabs */}
      <div className="flex gap-2 px-5 pb-2 pt-1">
        <button
          onClick={() => setSelectedStudentId(null)}
          className="px-3 py-1 rounded-2xl text-xs font-medium transition-colors"
          style={{
            border:     selectedStudentId === null ? '0.5px solid #D8D8DC' : '0.5px solid #E8E8EC',
            background: selectedStudentId === null ? '#F5F5F7' : 'transparent',
            color:      selectedStudentId === null ? '#1A1A2E' : '#555566',
          }}
        >
          Everyone
        </button>
        {studentOptions.map(student => {
          const active = selectedStudentId === student.id
          return (
            <button
              key={student.id}
              onClick={() => setSelectedStudentId(student.id)}
              className="px-3 py-1 rounded-2xl text-xs font-medium transition-colors"
              style={{
                border:     `0.5px solid ${active ? '#7C6EE6' : '#E8E8EC'}`,
                background: active ? '#EEEBfd' : 'transparent',
                color:      active ? '#7C6EE6' : '#555566',
              }}
            >
              {student.name}
            </button>
          )
        })}
      </div>

      {/* Week nav */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2">
        <button
          onClick={() => navigateWeek('prev')}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: '#F5F5F7' }}
        >
          <i className="ti ti-chevron-left" style={{ fontSize: 14, color: '#555566' }} />
        </button>
        <span className="text-[12px] font-medium" style={{ color: '#555566' }}>{weekLabel}</span>
        <button
          onClick={() => navigateWeek('next')}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: '#F5F5F7' }}
        >
          <i className="ti ti-chevron-right" style={{ fontSize: 14, color: '#555566' }} />
        </button>
      </div>

      {/* Week strip — 3-panel vertical carousel */}
      <div className="flex-shrink-0 overflow-hidden" style={{ borderBottom: '0.5px solid #E8E8EC', height: stripHeight }}>
        <div
          ref={stripRef}
          className="flex flex-col"
          style={{ willChange: 'transform' }}
          onTouchStart={onStripTouchStart}
          onTouchMove={onStripTouchMove}
          onTouchEnd={onStripTouchEnd}
          onTouchCancel={onStripTouchCancel}
        >
          <div ref={prevPanelRef} className="flex flex-shrink-0 px-3.5 pt-1 pb-2 gap-0.5">
            {prevWeekDays.map(day => (
              <div
                key={day.toISOString()}
                className="flex-1 flex flex-col items-center py-1.5 rounded-xl"
                style={{ border: '0.5px solid transparent' }}
              >
                <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: '#999AAA' }}>{format(day, 'EEE')}</span>
                <span className="text-sm mt-0.5" style={{ color: '#1A1A2E', fontWeight: 600 }}>{format(day, 'd')}</span>
                <div className="h-2" />
              </div>
            ))}
          </div>
          <div ref={currentPanelRef} className="flex flex-shrink-0 px-3.5 pt-1 pb-2 gap-0.5">
            {weekDays.map(day => {
              const today     = isToday(day)
              const hasSess   = dayHasSessions(day)
              const hasUnconf = dayHasUnconfirmed(day)
              return (
                <div
                  key={day.toISOString()}
                  className="flex-1 flex flex-col items-center py-1.5 rounded-xl"
                  style={{ border: today ? '1.5px solid #7C6EE6' : '1.5px solid transparent' }}
                >
                  <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: today ? '#7C6EE6' : '#999AAA' }}>{format(day, 'EEE')}</span>
                  <span className="text-sm mt-0.5" style={{ color: today ? '#7C6EE6' : '#1A1A2E', fontWeight: today ? 700 : 600 }}>{format(day, 'd')}</span>
                  <div className="h-2 mt-0.5 flex items-center justify-center">
                    {hasSess && <div className="w-1.5 h-1.5 rounded-full" style={{ background: hasUnconf ? '#7C6EE6' : '#26B99A' }} />}
                  </div>
                </div>
              )
            })}
          </div>
          <div ref={nextPanelRef} className="flex flex-shrink-0 px-3.5 pt-1 pb-2 gap-0.5">
            {nextWeekDays.map(day => {
              const hasSess   = dispNextWeekSessions.some(s => isSameDay(parseISO(s.starts_at), day))
              const hasUnconf = dispNextWeekSessions.some(s => isSameDay(parseISO(s.starts_at), day) && !s.teacher_confirmed_at)
              return (
                <div
                  key={day.toISOString()}
                  className="flex-1 flex flex-col items-center py-1.5 rounded-xl"
                  style={{ border: '0.5px solid transparent' }}
                >
                  <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: '#999AAA' }}>{format(day, 'EEE')}</span>
                  <span className="text-sm mt-0.5" style={{ color: '#1A1A2E', fontWeight: 600 }}>{format(day, 'd')}</span>
                  <div className="h-2 mt-0.5 flex items-center justify-center">
                    {hasSess && <div className="w-1.5 h-1.5 rounded-full" style={{ background: hasUnconf ? '#7C6EE6' : '#26B99A' }} />}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto pb-4">
        {feedKey === 0 ? (
          <div className="flex justify-center pt-10">
            <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: '#EEEBfd', borderTopColor: '#7C6EE6' }} />
          </div>
        ) : (
          <div ref={feedWrapperRef}>
            {dispWeekGroups.length === 0 ? (
                <div className="flex flex-col items-center pt-12 text-center px-8">
                  <i className="ti ti-calendar-off" style={{ fontSize: 32, color: '#D8D8DC' }} />
                  <p className="text-[13px] mt-3" style={{ color: '#999AAA' }}>No sessions this week.</p>
                </div>
              ) : (
                dispWeekGroups.map(({ day, sessions: daySessions }) => (
                  <div key={day.toISOString()}>
                    <div
                      className="px-5 py-2 flex items-center gap-2"
                      style={{
                        position: 'sticky', top: 0, background: '#fff', zIndex: 1,
                        borderBottom: '0.5px solid #E8E8EC',
                        borderLeft:  isToday(day) ? '3px solid #7C6EE6' : '3px solid transparent',
                      }}
                    >
                      <span className="text-[12px] font-semibold" style={{ color: '#1A1A2E' }}>
                        {format(day, 'EEE, MMM d')}
                      </span>
                      {isToday(day) && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: '#EEEBfd', color: '#7C6EE6' }}>
                          Today
                        </span>
                      )}
                    </div>
                    <div className="px-4 py-2">
                      {daySessions.map(s => (
                        <SessionCard
                          key={s.id}
                          session={s}
                          hasConflict={conflictIds.has(s.id)}
                          onSelect={setSelected}
                          onConfirm={handleConfirm}
                          onUnconfirm={handleUnconfirm}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}

            {/* Coming up */}
            {dispNextWeekStart && (() => {
              const nwEnd = endOfWeek(dispNextWeekStart, { weekStartsOn: 0 })
              const dayGroups = eachDayOfInterval({ start: dispNextWeekStart, end: nwEnd })
                .map(day => ({
                  day,
                  sessions: dispNextWeekSessions
                    .filter(s => isSameDay(parseISO(s.starts_at), day))
                    .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
                }))
                .filter(g => g.sessions.length > 0)

              return (
                <div>
                  <div className="flex items-center gap-3 px-5 mt-4 mb-1">
                    <div className="flex-1 h-px" style={{ background: '#E8E8EC' }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#C8C8D0' }}>
                      Coming up · {format(dispNextWeekStart, 'MMM d')}–{format(nwEnd, 'd')}
                    </span>
                    <div className="flex-1 h-px" style={{ background: '#E8E8EC' }} />
                  </div>
                  {dayGroups.length === 0 ? (
                    <div className="flex flex-col items-center pt-6 pb-4 text-center px-8">
                      <i className="ti ti-calendar-off" style={{ fontSize: 32, color: '#D8D8DC' }} />
                      <p className="text-[13px] mt-3" style={{ color: '#999AAA' }}>No sessions this week.</p>
                    </div>
                  ) : (
                    dayGroups.map(({ day, sessions: daySessions }) => (
                      <div key={day.toISOString()}>
                        <div
                          className="px-5 py-2 flex items-center gap-2"
                          style={{ borderBottom: '0.5px solid #E8E8EC', borderLeft: '3px solid transparent' }}
                        >
                          <span className="text-[12px] font-semibold" style={{ color: '#999AAA' }}>
                            {format(day, 'EEE, MMM d')}
                          </span>
                        </div>
                        <div className="px-4 py-2">
                          {daySessions.map(s => (
                            <div key={s.id} style={{ opacity: 0.5 }}>
                              <SessionCard
                                session={s}
                                hasConflict={conflictIds.has(s.id)}
                                onSelect={() => jumpToWeek(dispNextWeekStart!)}
                                onConfirm={handleConfirm}
                                onUnconfirm={handleUnconfirm}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {selected && (
        <DetailSheet
          session={selected}
          hasConflict={conflictIds.has(selected.id)}
          onClose={() => setSelected(null)}
          onConfirm={handleConfirm}
          onUnconfirm={handleUnconfirm}
        />
      )}
    </div>
  )
}
