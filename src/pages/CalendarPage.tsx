import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameDay, isToday, parseISO,
  addWeeks, subWeeks,
} from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { getChildren } from '../lib/db/children'
import {
  getSessionsForWeek,
  checkConflict,
  completeSession,
  deleteSession,
  deleteSessionsInSeriesFrom,
  updateSession,
} from '../lib/db/sessions'
import type { Child, Session } from '../types'
import { getChildColor, CHILD_COLOR_HEX, CHILD_COLOR_BG } from '../types'

// Badge: slightly darker than bg
const CHILD_COLOR_BADGE: Record<string, string> = {
  purple: '#DDD9FB',
  teal:   '#C8F0E8',
  coral:  '#FDCFC9',
  amber:  '#F5DFA0',
}

// ─── Activity dot ─────────────────────────────────────────────────────────────

function ActivityDot({ colors }: { colors: string[] }) {
  if (colors.length === 0) return <div className="w-2 h-2" />

  if (colors.length === 1) {
    return (
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors[0] }} />
    )
  }

  if (colors.length === 2) {
    return (
      <div className="w-2 h-2 rounded-full overflow-hidden relative flex-shrink-0">
        <div className="absolute left-0 top-0 w-1/2 h-full" style={{ background: colors[0] }} />
        <div className="absolute right-0 top-0 w-1/2 h-full" style={{ background: colors[1] }} />
      </div>
    )
  }

  if (colors.length <= 4) {
    const step = 360 / colors.length
    const stops = colors.map((c, i) => `${c} ${i * step}deg ${(i + 1) * step}deg`).join(', ')
    return (
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: `conic-gradient(${stops})` }}
      />
    )
  }

  // 5+ children: rainbow easter egg
  return (
    <div
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ background: 'conic-gradient(#7C6EE6, #26B99A, #E86B5F, #E8A838, #7C6EE6)' }}
    />
  )
}

// ─── Session block ────────────────────────────────────────────────────────────

function SessionBlock({
  session,
  allChildren,
  hasConflict,
  onSelect,
}: {
  session: Session
  allChildren: Child[]
  hasConflict: boolean
  onSelect: (session: Session) => void
}) {
  const child = allChildren.find(c => c.id === session.child_id)
  if (!child) return null

  const color  = getChildColor(child.display_order)
  const hex    = CHILD_COLOR_HEX[color]
  const bg     = CHILD_COLOR_BG[color]
  const badge  = CHILD_COLOR_BADGE[color]

  const startTime = parseISO(session.starts_at)
  const endTime   = parseISO(session.ends_at)
  const timeRange = `${format(startTime, 'h:mm')}-${format(endTime, 'h:mm a')}`
  const location  = session.teacher?.location ?? null
  const subtitle  = [timeRange, location].filter(Boolean).join(' · ')
  const title     = session.teacher
    ? [session.teacher.subject, session.teacher.name].filter(Boolean).join(' · ')
    : (session.title ?? 'Activity')

  const blockStyle = hasConflict
    ? {
        background:    '#FEF8EC',
        borderTop:     '1px solid #E8A838',
        borderRight:   '1px solid #E8A838',
        borderBottom:  '1px solid #E8A838',
        borderLeft:    '3px solid #E8A838',
      }
    : {
        background: bg,
        borderLeft: `3px solid ${hex}`,
      }

  return (
    <button
      onClick={() => onSelect(session)}
      className="w-full text-left rounded-[10px] px-2.5 py-2 mb-1.5 relative"
      style={blockStyle}
    >
      {/* Child badge — top right */}
      <span
        className="absolute top-1.5 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
        style={{ background: badge, color: hex }}
      >
        {child.name}
      </span>

      <div className="text-[13px] font-semibold pr-14" style={{ color: '#1A1A2E' }}>
        {title}
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: '#555566' }}>
        {subtitle}
      </div>

      {session.status === 'completed' && (
        <div className="inline-flex items-center gap-1 mt-1 text-[11px]" style={{ color: '#0F6E56' }}>
          <i className="ti ti-check" style={{ fontSize: 11 }} />
          Completed
        </div>
      )}

      {session.teacher_confirmed_at && session.status !== 'completed' && (
        <div className="inline-flex items-center gap-1 mt-1 text-[11px]" style={{ color: '#1A8A73' }}>
          <i className="ti ti-circle-check" style={{ fontSize: 11 }} />
          Teacher confirmed
        </div>
      )}

      {hasConflict && (
        <div className="flex items-center gap-1 mt-1 text-[11px]" style={{ color: '#B87A10' }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 11 }} />
          Another student also logged this time
        </div>
      )}
    </button>
  )
}

function toDateTimeLocalValue(value: string): string {
  return format(parseISO(value), "yyyy-MM-dd'T'HH:mm")
}

function parseDateTimeLocal(value: string): Date {
  return new Date(value)
}

function SessionActionSheet({
  session,
  allChildren,
  onClose,
  onSaved,
}: {
  session: Session
  allChildren: Child[]
  onClose: () => void
  onSaved: () => void
}) {
  const child = allChildren.find(c => c.id === session.child_id)
  const [mode, setMode] = useState<'details' | 'edit' | 'delete'>('details')
  const [startsAt, setStartsAt] = useState(() => toDateTimeLocalValue(session.starts_at))
  const [price, setPrice] = useState(() => String(session.price ?? 0))
  const [notes, setNotes] = useState(session.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const start = parseISO(session.starts_at)
  const end = parseISO(session.ends_at)
  const durationMs = end.getTime() - start.getTime()
  const canSave = startsAt && Number(price) >= 0

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const nextStart = parseDateTimeLocal(startsAt)
      const nextEnd = new Date(nextStart.getTime() + durationMs)
      await updateSession(session.id, {
        starts_at: nextStart.toISOString(),
        ends_at: nextEnd.toISOString(),
        price: Number(price) || 0,
        notes: notes.trim() || null,
      })
      onSaved()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleComplete() {
    if (saving || session.status === 'completed') return
    setSaving(true)
    try {
      await completeSession(session.id)
      onSaved()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteOne() {
    if (deleting) return
    setDeleting(true)
    try {
      await deleteSession(session.id)
      onSaved()
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  async function handleDeleteSeriesFromHere() {
    if (deleting || !session.template_id) return
    setDeleting(true)
    try {
      await deleteSessionsInSeriesFrom(session.template_id, session.starts_at)
      onSaved()
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end" style={{ background: 'rgba(26,26,46,0.18)' }}>
      <button className="flex-1" onClick={onClose} aria-label="Close session editor" />
      <div className="bg-white rounded-t-[18px] px-5 pt-4 pb-5 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold truncate" style={{ color: '#1A1A2E' }}>
              {session.teacher?.subject} · {session.teacher?.name}
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: '#555566' }}>
              {child?.name ?? 'Child'} · {session.status === 'completed' ? 'Completed' : 'Scheduled'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-[9px] flex items-center justify-center"
            style={{ background: '#F5F5F7', color: '#555566' }}
            aria-label="Close"
          >
            <i className="ti ti-x" />
          </button>
        </div>

        {mode === 'delete' ? (
          <>
            <div
              className="rounded-[12px] p-3 mb-3 text-xs leading-relaxed"
              style={{ background: '#FEF8EC', border: '0.5px solid #E8A838', color: '#7A5510' }}
            >
              This activity is part of a recurring series. Choose how much of the series to delete.
            </div>

            <button
              onClick={handleDeleteOne}
              disabled={deleting}
              className="w-full py-3 rounded-[12px] text-[13px] font-semibold mb-2"
              style={{ border: '0.5px solid #F09595', color: '#A32D2D' }}
            >
              {deleting ? 'Deleting...' : 'Delete this activity only'}
            </button>

            <button
              onClick={handleDeleteSeriesFromHere}
              disabled={deleting}
              className="w-full py-3 rounded-[12px] text-[13px] font-semibold mb-2"
              style={{ background: '#E24B4A', color: '#fff' }}
            >
              {deleting ? 'Deleting...' : 'Delete this and following activities'}
            </button>

            <button
              onClick={() => setMode('details')}
              disabled={deleting}
              className="w-full py-3 rounded-[12px] text-[13px] font-medium"
              style={{ color: '#555566' }}
            >
              Cancel
            </button>
          </>
        ) : mode === 'details' ? (
          <>
            <div className="rounded-[12px] overflow-hidden mb-3" style={{ border: '0.5px solid #E8E8EC' }}>
              {[
                ['Date and time', `${format(start, 'EEE, MMM d')} · ${format(start, 'h:mm')}-${format(end, 'h:mm a')}`],
                ['Price', `$${Number(session.price).toFixed(2).replace(/\.00$/, '')}`],
                ['Status', session.status === 'completed' ? 'Completed · included in payments' : 'Scheduled · not included in payments yet'],
              ].map(([label, value], i) => (
                <div
                  key={label}
                  className="flex items-center gap-3 px-3.5 py-3"
                  style={{ borderTop: i > 0 ? '0.5px solid #E8E8EC' : 'none' }}
                >
                  <div className="text-[12px] flex-1" style={{ color: '#999AAA' }}>{label}</div>
                  <div className="text-[12px] font-medium text-right" style={{ color: '#1A1A2E' }}>{value}</div>
                </div>
              ))}
              {session.notes && (
                <div className="px-3.5 py-3" style={{ borderTop: '0.5px solid #E8E8EC' }}>
                  <div className="text-[12px] mb-1" style={{ color: '#999AAA' }}>Notes</div>
                  <div className="text-[12px] leading-relaxed" style={{ color: '#555566' }}>{session.notes}</div>
                </div>
              )}
            </div>

            {session.status !== 'completed' && (
              <button
                onClick={handleComplete}
                disabled={saving}
                className="w-full py-3 rounded-[12px] text-[13px] font-semibold mb-2"
                style={{ background: '#26B99A', color: '#fff' }}
              >
                {saving ? 'Saving...' : 'Mark session complete'}
              </button>
            )}

            <button
              onClick={() => setMode('edit')}
              className="w-full py-3 rounded-[12px] text-[13px] font-semibold mb-2"
              style={{ border: '0.5px solid #7C6EE6', color: '#7C6EE6' }}
            >
              Edit details
            </button>

            <button
              onClick={() => {
                if (session.template_id) {
                  setMode('delete')
                } else {
                  void handleDeleteOne()
                }
              }}
              disabled={deleting}
              className="w-full py-3 rounded-[12px] text-[13px] font-medium"
              style={{ border: '0.5px solid #F09595', color: '#A32D2D' }}
            >
              {deleting ? 'Deleting...' : 'Delete activity'}
            </button>
          </>
        ) : (
          <>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: '#999AAA' }}>
              Date and time
            </label>
            <input
              type="datetime-local"
              className="w-full text-sm rounded-[10px] px-3 py-2.5 outline-none mb-3"
              style={{ background: '#F5F5F7', border: '0.5px solid #E8E8EC', color: '#1A1A2E' }}
              value={startsAt}
              onChange={e => setStartsAt(e.target.value)}
            />

            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: '#999AAA' }}>
                  Price
                </label>
                <div
                  className="flex items-center rounded-[10px]"
                  style={{ background: '#F5F5F7', border: '0.5px solid #E8E8EC' }}
                >
                  <span className="pl-3 text-sm" style={{ color: '#999AAA' }}>$</span>
                  <input
                    type="number"
                    className="flex-1 text-sm px-2 py-2.5 outline-none bg-transparent"
                    style={{ color: '#1A1A2E' }}
                    value={price}
                    min="0"
                    step="0.01"
                    onChange={e => setPrice(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: '#999AAA' }}>
                  Duration
                </label>
                <div
                  className="text-sm rounded-[10px] px-3 py-2.5"
                  style={{ background: '#F5F5F7', border: '0.5px solid #E8E8EC', color: '#555566' }}
                >
                  {Math.round(durationMs / 60000)} min
                </div>
              </div>
            </div>

            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: '#999AAA' }}>
              Notes
            </label>
            <textarea
              className="w-full text-sm rounded-[10px] px-3 py-2.5 outline-none mb-4 resize-none"
              style={{ background: '#F5F5F7', border: '0.5px solid #E8E8EC', color: '#1A1A2E' }}
              rows={2}
              placeholder="Optional"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />

            <div className="flex gap-2">
              <button
                onClick={() => setMode('details')}
                className="py-3 px-5 rounded-[12px] text-[13px] font-medium"
                style={{ border: '0.5px solid #E8E8EC', color: '#555566' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                className="flex-1 py-3 rounded-[12px] text-[13px] font-semibold"
                style={{
                  background: canSave ? '#7C6EE6' : '#E8E8EC',
                  color: canSave ? '#fff' : '#999AAA',
                }}
              >
                {saving ? 'Saving...' : 'Save details'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── CalendarPage ─────────────────────────────────────────────────────────────

export function CalendarPage() {
  const { user, effectiveUserId } = useAuth()
  const uid = effectiveUserId ?? user?.id ?? ''
  const navigate   = useNavigate()

  const [weekStart, setWeekStart]             = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [selectedDate, setSelectedDate]       = useState(new Date())
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [children, setChildren]               = useState<Child[]>([])
  const [sessions, setSessions]               = useState<Session[]>([])
  const [conflictMap, setConflictMap]         = useState<Map<string, boolean>>(new Map())
  const [loading, setLoading]                 = useState(true)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)

  const weekDays = eachDayOfInterval({
    start: weekStart,
    end:   endOfWeek(weekStart, { weekStartsOn: 0 }),
  })

  // "May 10-16 2026" or "May 30 – Jun 5 2026"
  const weekEnd   = endOfWeek(weekStart, { weekStartsOn: 0 })
  const weekLabel = (() => {
    const sm = format(weekStart, 'MMM')
    const em = format(weekEnd,   'MMM')
    return sm === em
      ? `${sm} ${format(weekStart, 'd')}-${format(weekEnd, 'd')} ${format(weekEnd, 'yyyy')}`
      : `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d yyyy')}`
  })()

  // ── Load children once ────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    getChildren(uid).then(setChildren).catch(console.error)
  }, [user])

  // ── Load sessions when week or child filter changes ───────────────────────

  const loadSessions = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    const end = endOfWeek(weekStart, { weekStartsOn: 0 })
    setLoading(true)
    try {
      const data = await getSessionsForWeek(
        uid,
        weekStart,
        end,
        selectedChildId ?? undefined,
      )
      setSessions(data)

      // Parallel conflict checks
      const results = await Promise.all(
        data.map(s => (
          s.status === 'scheduled' && s.teacher_id
            ? checkConflict(s.teacher_id, s.starts_at, s.ends_at, uid)
            : Promise.resolve({ has_conflict: false, conflicting_sessions_count: 0 })
        ))
      )
      const map = new Map<string, boolean>()
      data.forEach((s, i) => map.set(s.id, results[i].has_conflict))
      setConflictMap(map)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [user, weekStart, selectedChildId])

  useEffect(() => { loadSessions() }, [loadSessions])

  // ── Derived ───────────────────────────────────────────────────────────────

  // Activity dot colors for a given day
  function dotColorsForDay(day: Date): string[] {
    const daySessions = sessions.filter(s => isSameDay(parseISO(s.starts_at), day))
    const uniqueChildIds = [...new Set(daySessions.map(s => s.child_id))]
    return uniqueChildIds.map(id => {
      const child = children.find(c => c.id === id)
      return child ? CHILD_COLOR_HEX[getChildColor(child.display_order)] : '#999AAA'
    })
  }

  // Sessions for the selected day, grouped by start hour
  const daySessions = sessions.filter(s => isSameDay(parseISO(s.starts_at), selectedDate))

  const timelineGroups = (() => {
    const hourMap = new Map<number, Session[]>()
    for (const s of daySessions) {
      const h = parseISO(s.starts_at).getHours()
      if (!hourMap.has(h)) hourMap.set(h, [])
      hourMap.get(h)!.push(s)
    }
    return Array.from(hourMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, hourSessions]) => {
        const d = new Date(); d.setHours(hour, 0, 0, 0)
        return { hourLabel: format(d, 'h a'), hourSessions }
      })
  })()

  // ── Week navigation ───────────────────────────────────────────────────────

  function prevWeek() {
    setWeekStart(w => subWeeks(w, 1))
    setSelectedDate(d => subWeeks(d, 1))
  }
  function nextWeek() {
    setWeekStart(w => addWeeks(w, 1))
    setSelectedDate(d => addWeeks(d, 1))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="px-5 pt-3 pb-1 flex items-start gap-2.5">
        <div className="flex-1">
          <div className="font-serif text-[22px] leading-tight" style={{ color: '#1A1A2E' }}>
            This week
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <button onClick={prevWeek} className="p-0.5" style={{ color: '#999AAA' }}>
              <i className="ti ti-chevron-left text-xs" />
            </button>
            <span className="text-[11px]" style={{ color: '#999AAA' }}>{weekLabel}</span>
            <button onClick={nextWeek} className="p-0.5" style={{ color: '#999AAA' }}>
              <i className="ti ti-chevron-right text-xs" />
            </button>
          </div>
        </div>
        <button
          onClick={() => navigate('/profile')}
          className="w-8 h-8 rounded-[10px] flex items-center justify-center mt-0.5"
          style={{ border: '0.5px solid #E8E8EC' }}
        >
          <i className="ti ti-user text-[15px]" style={{ color: '#555566' }} />
        </button>
      </div>

      {/* Child filter tabs */}
      <div className="flex gap-2 px-5 pb-2 pt-1">
        <button
          onClick={() => setSelectedChildId(null)}
          className="px-3 py-1 rounded-2xl text-xs font-medium transition-colors"
          style={{
            border:      selectedChildId === null ? '0.5px solid #D8D8DC' : '0.5px solid #E8E8EC',
            background:  selectedChildId === null ? '#F5F5F7' : 'transparent',
            color:       selectedChildId === null ? '#1A1A2E' : '#555566',
          }}
        >
          Everyone
        </button>
        {children.map(child => {
          const color  = getChildColor(child.display_order)
          const hex    = CHILD_COLOR_HEX[color]
          const bg     = CHILD_COLOR_BG[color]
          const active = selectedChildId === child.id
          return (
            <button
              key={child.id}
              onClick={() => setSelectedChildId(child.id)}
              className="px-3 py-1 rounded-2xl text-xs font-medium transition-colors"
              style={{
                border:     `0.5px solid ${active ? hex : '#E8E8EC'}`,
                background: active ? bg : 'transparent',
                color:      active ? hex : '#555566',
              }}
            >
              {child.name}
            </button>
          )
        })}
      </div>

      {/* Week strip */}
      <div className="flex px-3.5 pb-2 gap-0.5">
        {weekDays.map(day => {
          const selected   = isSameDay(day, selectedDate)
          const today      = isToday(day)
          const dotColors  = dotColorsForDay(day)

          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDate(day)}
              className="flex-1 flex flex-col items-center py-1.5 rounded-xl"
              style={{
                border:     selected ? '1.5px solid #7C6EE6' : today ? '0.5px solid #E8E8EC' : '0.5px solid transparent',
                background: today && !selected ? '#F5F5F7' : 'transparent',
              }}
            >
              <span
                className="text-[9px] font-semibold uppercase tracking-wide"
                style={{ color: selected ? '#7C6EE6' : '#999AAA' }}
              >
                {format(day, 'EEE')}
              </span>
              <span
                className="text-sm mt-0.5"
                style={{
                  color:      selected ? '#7C6EE6' : '#1A1A2E',
                  fontWeight: selected ? 700 : 600,
                }}
              >
                {format(day, 'd')}
              </span>
              <div className="flex justify-center mt-0.5 h-2 items-center">
                <ActivityDot colors={dotColors} />
              </div>
            </button>
          )
        })}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {loading ? (
          <div className="flex items-center justify-center pt-10">
            <span className="text-[13px]" style={{ color: '#999AAA' }}>Loading…</span>
          </div>
        ) : (
          <>
            {timelineGroups.map(({ hourLabel, hourSessions }) => (
              <div key={hourLabel} className="flex gap-2.5 mb-0.5">
                <div
                  className="text-[10px] font-medium w-8 flex-shrink-0 pt-2.5"
                  style={{ color: '#999AAA' }}
                >
                  {hourLabel}
                </div>
                <div
                  className="flex-1 pt-2 pb-2.5"
                  style={{ borderTop: '0.5px solid #E8E8EC' }}
                >
                  {hourSessions.map(s => (
                    <SessionBlock
                      key={s.id}
                      session={s}
                      allChildren={children}
                      hasConflict={conflictMap.get(s.id) ?? false}
                      onSelect={setSelectedSession}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Log prompt */}
            <div className="flex gap-2.5">
              <div className="w-8 flex-shrink-0" />
              <div
                className="flex-1 pt-2 pb-2.5"
                style={{ borderTop: timelineGroups.length > 0 ? '0.5px solid #E8E8EC' : 'none' }}
              >
                <button
                  onClick={() => navigate('/log')}
                  className="w-full rounded-[10px] px-2.5 py-2.5 text-xs flex items-center justify-center gap-1"
                  style={{ border: '0.5px dashed #E8E8EC', color: '#999AAA' }}
                >
                  <i className="ti ti-plus text-[13px]" />
                  Log an activity
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {selectedSession && (
        <SessionActionSheet
          session={selectedSession}
          allChildren={children}
          onClose={() => setSelectedSession(null)}
          onSaved={() => {
            setSelectedSession(null)
            loadSessions()
          }}
        />
      )}

    </div>
  )
}
