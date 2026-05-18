import { useState, useEffect, useLayoutEffect, useRef } from 'react'
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
  uncompleteSession,
  deleteSession,
  deleteSessionsInSeriesFrom,
  updateSession,
} from '../lib/db/sessions'
import * as sessionCache from '../lib/sessionCache'
import type { WeekCacheEntry } from '../lib/sessionCache'
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

  async function handleUncomplete() {
    if (saving || session.status !== 'completed') return
    setSaving(true)
    try {
      await uncompleteSession(session.id)
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

            {session.status !== 'completed' ? (
              <button
                onClick={handleComplete}
                disabled={saving}
                className="w-full py-3 rounded-[12px] text-[13px] font-semibold mb-2"
                style={{ background: '#26B99A', color: '#fff' }}
              >
                {saving ? 'Saving...' : 'Mark session complete'}
              </button>
            ) : (
              <button
                onClick={handleUncomplete}
                disabled={saving}
                className="w-full py-3 rounded-[12px] text-[13px] font-semibold mb-2"
                style={{ border: '0.5px solid #26B99A', color: '#26B99A' }}
              >
                {saving ? 'Saving...' : 'Undo completion'}
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

// ─── Cache fetch ──────────────────────────────────────────────────────────────

async function fetchAndCache(weekStart: Date, uid: string): Promise<WeekCacheEntry> {
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 })
  const data    = await getSessionsForWeek(uid, weekStart, weekEnd)

  const results = await Promise.all(
    data.map(s =>
      s.status === 'scheduled' && s.teacher_id
        ? checkConflict(s.teacher_id, s.starts_at, s.ends_at, uid)
        : Promise.resolve({ has_conflict: false, conflicting_sessions_count: 0 })
    )
  )
  const conflictMap = new Map<string, boolean>()
  data.forEach((s, i) => conflictMap.set(s.id, results[i].has_conflict))

  const entry: WeekCacheEntry = { sessions: data, conflictMap, fetchedAt: new Date() }
  sessionCache.set(weekStart, entry)
  return entry
}

// ─── CalendarPage ─────────────────────────────────────────────────────────────

export function CalendarPage() {
  const { user, effectiveUserId } = useAuth()
  const uid = effectiveUserId ?? user?.id ?? ''
  const navigate = useNavigate()

  const [weekStart, setWeekStart]             = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [selectedDate, setSelectedDate]       = useState(new Date())
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [children, setChildren]               = useState<Child[]>([])
  const [sessions, setSessions]               = useState<Session[]>([])
  const [conflictMap, setConflictMap]         = useState<Map<string, boolean>>(new Map())
  const [loading, setLoading]                 = useState(true)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [nextWeekSessions, setNextWeekSessions] = useState<Session[]>([])
  const [nextWeekStart, setNextWeekStart]       = useState<Date | null>(null)
  const [refreshCounter, setRefreshCounter]     = useState(0)

  const scrollRef       = useRef<HTMLDivElement>(null)
  const dayRefs         = useRef<Map<string, HTMLDivElement>>(new Map())
  const stripRef        = useRef<HTMLDivElement>(null)
  const prevPanelRef    = useRef<HTMLDivElement>(null)
  const currentPanelRef = useRef<HTMLDivElement>(null)
  const nextPanelRef    = useRef<HTMLDivElement>(null)
  const touchStartY     = useRef<number | null>(null)
  const didSwipe        = useRef(false)
  const isAnimating     = useRef(false)
  const weekStartRef    = useRef(weekStart)
  const prefetchingRef  = useRef(new Set<string>())
  const pullStartY      = useRef<number | null>(null)
  const feedWrapperRef  = useRef<HTMLDivElement>(null)
  const feedAnimDir     = useRef<'prev' | 'next' | null>(null)
  const isFirstLoad     = useRef(true)
  const [pullDist, setPullDist]       = useState(0)
  const [stripHeight, setStripHeight] = useState<number | undefined>(undefined)
  const PULL_THRESHOLD = 60

  const weekEnd      = endOfWeek(weekStart, { weekStartsOn: 0 })
  const prevWeekDays = eachDayOfInterval({ start: subWeeks(weekStart, 1), end: endOfWeek(subWeeks(weekStart, 1), { weekStartsOn: 0 }) })
  const weekDays     = eachDayOfInterval({ start: weekStart, end: weekEnd })
  const nextWeekDays = eachDayOfInterval({ start: addWeeks(weekStart, 1), end: endOfWeek(addWeeks(weekStart, 1), { weekStartsOn: 0 }) })

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

  // ── Keep weekStartRef in sync for use inside async callbacks ─────────────
  useEffect(() => { weekStartRef.current = weekStart }, [weekStart])

  // ── Re-load when an external mutation (e.g. LogPage save) invalidates our week
  useEffect(() => {
    return sessionCache.subscribe(dirtyWeek => {
      if (dirtyWeek.toISOString() === weekStartRef.current.toISOString()) {
        setRefreshCounter(c => c + 1)
      }
    })
  }, [])

  // ── Clear entire cache when app returns to foreground so all weeks get
  //    fresh data on next access (covers teacher/co-parent changes) ──────────
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      sessionCache.clear()
      setRefreshCounter(c => c + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // ── Cache-aware week loading ──────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return
    let active = true

    const currentKey = weekStart.toISOString()
    const nwStart    = addWeeks(weekStart, 1)
    const existing   = sessionCache.get(weekStart)

    function applyEntry(entry: WeekCacheEntry) {
      if (!active) return
      setSessions(entry.sessions)
      setConflictMap(entry.conflictMap)
    }

    function applyNextWeek() {
      if (!active) return
      const nextEntry = sessionCache.get(nwStart)
      setNextWeekStart(nextEntry ? nwStart : null)
      setNextWeekSessions(nextEntry?.sessions ?? [])
    }

    if (existing && !sessionCache.isStale(existing)) {
      // Fresh cache hit — render immediately, no spinner
      applyEntry(existing)
      applyNextWeek()
      setLoading(false)
    } else if (existing) {
      // Stale — show current data immediately, refresh in background
      applyEntry(existing)
      applyNextWeek()
      setLoading(false)
      fetchAndCache(weekStart, uid).then(fresh => {
        if (weekStartRef.current.toISOString() === currentKey) applyEntry(fresh)
      }).catch(console.error)
    } else {
      // Cache miss — show spinner, fetch, then render
      setLoading(true)
      fetchAndCache(weekStart, uid).then(fresh => {
        if (!active) return
        applyEntry(fresh)
        applyNextWeek()
        setLoading(false)
      }).catch(err => {
        console.error(err)
        if (active) setLoading(false)
      })
    }

    // Prefetch W-1, W+1, W+2 in background
    const nwKey = nwStart.toISOString()
    ;[subWeeks(weekStart, 1), nwStart, addWeeks(weekStart, 2)].forEach(target => {
      const tKey = target.toISOString()
      if (prefetchingRef.current.has(tKey)) return
      const cached = sessionCache.get(target)
      if (cached && !sessionCache.isStale(cached)) return

      prefetchingRef.current.add(tKey)
      fetchAndCache(target, uid)
        .then(entry => {
          if (tKey === nwKey && weekStartRef.current.toISOString() === currentKey) {
            setNextWeekStart(target)
            setNextWeekSessions(entry.sessions)
          }
        })
        .catch(console.error)
        .finally(() => prefetchingRef.current.delete(tKey))
    })

    return () => { active = false }
  }, [weekStart, uid, refreshCounter])

  // ── Pull-to-refresh: non-passive listener to allow preventDefault ─────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onTouchMove(e: TouchEvent) {
      if (pullStartY.current === null) return
      if (e.touches[0].clientY > pullStartY.current) e.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  function onFeedTouchStart(e: React.TouchEvent) {
    if (scrollRef.current?.scrollTop === 0) {
      pullStartY.current = e.touches[0].clientY
    }
  }
  function onFeedTouchMove(e: React.TouchEvent) {
    if (pullStartY.current === null) return
    const dist = e.touches[0].clientY - pullStartY.current
    if (dist > 0) setPullDist(dist)
  }
  function onFeedTouchEnd() {
    if (pullStartY.current === null) return
    const triggered = pullDist >= PULL_THRESHOLD
    pullStartY.current = null
    setPullDist(0)
    if (triggered) {
      sessionCache.clear()
      setRefreshCounter(c => c + 1)
    }
  }
  function onFeedTouchCancel() {
    pullStartY.current = null
    setPullDist(0)
  }

  // ── Strip snap + panel opacity reset + feed panel reset on week change ───
  useLayoutEffect(() => {
    const strip = stripRef.current
    if (strip) {
      strip.style.transition = 'none'
      strip.style.transform  = 'translateY(-33.333%)'
    }
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    // Reset strip panel opacities (no transition — happens before paint)
    for (const [ref, opacity] of [
      [prevPanelRef, '0.5'],
      [currentPanelRef, '1'],
      [nextPanelRef, '0.5'],
    ] as const) {
      const el = ref.current
      if (el) { el.style.transition = 'none'; el.style.opacity = opacity }
    }
    // Snap feed wrapper to incoming position before browser paints new week content
    const wrapper = feedWrapperRef.current
    if (wrapper && !isFirstLoad.current && feedAnimDir.current) {
      const dir = feedAnimDir.current
      wrapper.style.transition = 'none'
      wrapper.style.transform  = `translateY(${dir === 'next' ? '20px' : '-20px'})`
      wrapper.style.opacity    = '0'
    }
    if (isFirstLoad.current) isFirstLoad.current = false
  }, [weekStart])

  // Feed enter animation: after weekStart change, fade in the new content
  useEffect(() => {
    const wrapper = feedWrapperRef.current
    if (!wrapper || !feedAnimDir.current) return
    const rAF = requestAnimationFrame(() => {
      wrapper.style.transition = 'transform 350ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 350ms ease-out'
      wrapper.style.transform  = 'translateY(0)'
      wrapper.style.opacity    = '1'
      feedAnimDir.current = null
    })
    return () => cancelAnimationFrame(rAF)
  }, [weekStart])

  // Measure strip panel height once on mount so vertical carousel clips correctly
  useLayoutEffect(() => {
    const panel = currentPanelRef.current
    if (panel) setStripHeight(panel.offsetHeight)
  }, [])

  // ── Derived ───────────────────────────────────────────────────────────────
  // Cache holds all sessions; child filter is applied client-side so one cache
  // entry covers all filter states and switching is instant.
  const displaySessions = selectedChildId
    ? sessions.filter(s => s.child_id === selectedChildId)
    : sessions

  function dotColorsForDay(day: Date): string[] {
    const daySessions = sessions.filter(s => isSameDay(parseISO(s.starts_at), day))
    return [...new Set(daySessions.map(s => s.child_id))].map(id => {
      const child = children.find(c => c.id === id)
      return child ? CHILD_COLOR_HEX[getChildColor(child.display_order)] : '#999AAA'
    })
  }

  const weekGroups = weekDays.map(day => {
    const key = format(day, 'yyyy-MM-dd')
    const daySessions = displaySessions
      .filter(s => isSameDay(parseISO(s.starts_at), day))
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    return { day, key, sessions: daySessions }
  })

  // ── Scroll: feed → strip sync ─────────────────────────────────────────────
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    function onScroll() {
      const containerTop = container!.getBoundingClientRect().top
      const entries = Array.from(dayRefs.current.entries())
        .map(([key, el]) => ({ key, top: el.getBoundingClientRect().top }))
        .sort((a, b) => a.top - b.top)
      let activeKey: string | null = null
      for (const { key, top } of entries) {
        if (top <= containerTop + 10) activeKey = key
      }
      if (!activeKey && entries.length > 0) activeKey = entries[0].key
      if (activeKey) setSelectedDate(parseISO(activeKey))
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [weekStart])

  // ── Navigation ────────────────────────────────────────────────────────────
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
    if (dir === 'next') {
      if (next) { next.style.transition = easing; next.style.opacity = '1' }
    } else {
      if (prev) { prev.style.transition = easing; prev.style.opacity = '1' }
    }
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
      setWeekStart(target)
      setSelectedDate(target)
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
      setWeekStart(newStart)
      setSelectedDate(newStart)
    }, 300)
  }
  const prevWeek = () => navigateWeek('prev')
  const nextWeek = () => navigateWeek('next')

  // ── Date tap ──────────────────────────────────────────────────────────────
  function handleDateTap(day: Date) {
    if (didSwipe.current) { didSwipe.current = false; return }
    setSelectedDate(day)
    const key = format(day, 'yyyy-MM-dd')
    const el  = dayRefs.current.get(key)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Swipe on week strip (vertical: swipe up = next, swipe down = prev) ───
  function onStripTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY
    didSwipe.current    = false
  }
  function onStripTouchMove(e: React.TouchEvent) {
    if (touchStartY.current === null) return
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
      if (strip) {
        strip.style.transition = 'transform 180ms ease-out'
        strip.style.transform  = 'translateY(-33.333%)'
      }
    }
  }
  function onStripTouchCancel() {
    touchStartY.current = null
    const strip = stripRef.current
    if (!strip) return
    strip.style.transition = 'transform 180ms ease-out'
    strip.style.transform  = 'translateY(-33.333%)'
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="px-5 pt-3 pb-2 flex items-center justify-between">
        <div className="font-serif text-[22px] leading-tight" style={{ color: '#1A1A2E' }}>
          This week
        </div>
        <button
          onClick={() => navigate('/profile')}
          className="w-8 h-8 rounded-[10px] flex items-center justify-center"
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
            border:     selectedChildId === null ? '0.5px solid #D8D8DC' : '0.5px solid #E8E8EC',
            background: selectedChildId === null ? '#F5F5F7' : 'transparent',
            color:      selectedChildId === null ? '#1A1A2E' : '#555566',
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

      {/* Week nav */}
      <div className="flex items-center justify-between px-4 pb-1">
        <button onClick={prevWeek} className="w-7 h-7 flex items-center justify-center rounded-full" style={{ background: '#F5F5F7' }}>
          <i className="ti ti-chevron-left" style={{ fontSize: 14, color: '#555566' }} />
        </button>
        <span className="text-[12px] font-medium" style={{ color: '#555566' }}>{weekLabel}</span>
        <button onClick={nextWeek} className="w-7 h-7 flex items-center justify-center rounded-full" style={{ background: '#F5F5F7' }}>
          <i className="ti ti-chevron-right" style={{ fontSize: 14, color: '#555566' }} />
        </button>
      </div>

      {/* Week strip — 3-panel vertical carousel (swipe up = next, swipe down = prev) */}
      <div className="overflow-hidden" style={{ height: stripHeight }}>
        <div
          ref={stripRef}
          className="flex flex-col"
          style={{ willChange: 'transform' }}
          onTouchStart={onStripTouchStart}
          onTouchMove={onStripTouchMove}
          onTouchEnd={onStripTouchEnd}
          onTouchCancel={onStripTouchCancel}
        >
          <div ref={prevPanelRef} className="flex flex-shrink-0 px-3.5 pb-2 gap-0.5">
            {prevWeekDays.map(day => (
              <div key={day.toISOString()} className="flex-1 flex flex-col items-center py-1.5 rounded-xl" style={{ border: '0.5px solid transparent' }}>
                <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: '#999AAA' }}>{format(day, 'EEE')}</span>
                <span className="text-sm mt-0.5" style={{ color: '#1A1A2E', fontWeight: 600 }}>{format(day, 'd')}</span>
                <div className="h-2" />
              </div>
            ))}
          </div>
          <div ref={currentPanelRef} className="flex flex-shrink-0 px-3.5 pb-2 gap-0.5">
            {weekDays.map(day => {
              const selected  = isSameDay(day, selectedDate)
              const today     = isToday(day)
              const dotColors = dotColorsForDay(day)
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => handleDateTap(day)}
                  className="flex-1 flex flex-col items-center py-1.5 rounded-xl"
                  style={{
                    border:     selected ? '1.5px solid #7C6EE6' : today ? '0.5px solid #E8E8EC' : '0.5px solid transparent',
                    background: today && !selected ? '#F5F5F7' : 'transparent',
                  }}
                >
                  <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: selected ? '#7C6EE6' : '#999AAA' }}>
                    {format(day, 'EEE')}
                  </span>
                  <span className="text-sm mt-0.5" style={{ color: selected ? '#7C6EE6' : '#1A1A2E', fontWeight: selected ? 700 : 600 }}>
                    {format(day, 'd')}
                  </span>
                  <div className="flex justify-center mt-0.5 h-2 items-center">
                    <ActivityDot colors={dotColors} />
                  </div>
                </button>
              )
            })}
          </div>
          <div ref={nextPanelRef} className="flex flex-shrink-0 px-3.5 pb-2 gap-0.5">
            {nextWeekDays.map(day => {
              const dotColors = [...new Set(
                nextWeekSessions
                  .filter(s => isSameDay(parseISO(s.starts_at), day))
                  .map(s => s.child_id)
              )].map(id => {
                const child = children.find(c => c.id === id)
                return child ? CHILD_COLOR_HEX[getChildColor(child.display_order)] : '#999AAA'
              })
              return (
                <div key={day.toISOString()} className="flex-1 flex flex-col items-center py-1.5 rounded-xl" style={{ border: '0.5px solid transparent' }}>
                  <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: '#999AAA' }}>{format(day, 'EEE')}</span>
                  <span className="text-sm mt-0.5" style={{ color: '#1A1A2E', fontWeight: 600 }}>{format(day, 'd')}</span>
                  <div className="flex justify-center mt-0.5 h-2 items-center">
                    <ActivityDot colors={dotColors} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Session feed */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pb-4"
        onTouchStart={onFeedTouchStart}
        onTouchMove={onFeedTouchMove}
        onTouchEnd={onFeedTouchEnd}
        onTouchCancel={onFeedTouchCancel}
      >
        <div ref={feedWrapperRef} style={{ minHeight: '100%' }}>
          {/* Pull-to-refresh indicator */}
          {pullDist > 0 && (
            <div className="flex items-center justify-center" style={{ height: Math.min(pullDist * 0.5, 36), overflow: 'hidden' }}>
              <i
                className="ti ti-refresh"
                style={{
                  fontSize: 16,
                  color: '#7C6EE6',
                  opacity: Math.min(pullDist / PULL_THRESHOLD, 1),
                  transform: `rotate(${Math.min((pullDist / PULL_THRESHOLD) * 180, 180)}deg)`,
                }}
              />
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center pt-10">
              <span className="text-[13px]" style={{ color: '#999AAA' }}>Loading…</span>
            </div>
          ) : (
            <>
              {displaySessions.length === 0 ? (
                <div className="flex flex-col items-center pt-12 text-center px-8">
                  <i className="ti ti-calendar-off" style={{ fontSize: 32, color: '#D8D8DC' }} />
                  <p className="text-[13px] mt-3" style={{ color: '#999AAA' }}>No sessions this week.</p>
                </div>
              ) : (
                weekGroups
                  .filter(g => g.sessions.length > 0)
                  .map(({ day, key, sessions: daySessions }) => (
                    <div
                      key={key}
                      ref={el => { if (el) dayRefs.current.set(key, el); else dayRefs.current.delete(key) }}
                    >
                      <div
                        className="px-5 py-2 flex items-center gap-2"
                        style={{
                          position:     'sticky',
                          top:          0,
                          background:   '#fff',
                          zIndex:       1,
                          borderBottom: '0.5px solid #E8E8EC',
                          borderLeft:   isSameDay(day, selectedDate) ? '3px solid #7C6EE6' : '3px solid transparent',
                        }}
                      >
                        <span className="text-[12px] font-semibold" style={{ color: isSameDay(day, selectedDate) ? '#7C6EE6' : '#1A1A2E' }}>
                          {format(day, 'EEE, MMM d')}
                        </span>
                        {isToday(day) && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: '#EEEBfd', color: '#7C6EE6' }}>
                            Today
                          </span>
                        )}
                      </div>
                      <div className="px-5 py-2">
                        {daySessions.map(s => (
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
                  ))
              )}

              {/* Coming up */}
              {nextWeekSessions.length > 0 && nextWeekStart && (() => {
                const nwEnd = endOfWeek(nextWeekStart, { weekStartsOn: 0 })
                const dayGroups = eachDayOfInterval({ start: nextWeekStart, end: nwEnd })
                  .map(day => ({
                    day,
                    sessions: nextWeekSessions
                      .filter(s => isSameDay(parseISO(s.starts_at), day))
                      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
                  }))
                  .filter(g => g.sessions.length > 0)
                return (
                  <>
                    <div className="flex items-center gap-3 px-5 mt-4 mb-1">
                      <div className="flex-1 h-px" style={{ background: '#E8E8EC' }} />
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#C8C8D0' }}>
                        Coming up · {format(nextWeekStart, 'MMM d')}–{format(nwEnd, 'd')}
                      </span>
                      <div className="flex-1 h-px" style={{ background: '#E8E8EC' }} />
                    </div>
                    {dayGroups.map(({ day, sessions: daySessions }) => (
                      <div key={day.toISOString()}>
                        <div className="px-5 py-2 flex items-center gap-2" style={{ borderBottom: '0.5px solid #E8E8EC', borderLeft: '3px solid transparent' }}>
                          <span className="text-[12px] font-semibold" style={{ color: '#999AAA' }}>{format(day, 'EEE, MMM d')}</span>
                        </div>
                        <div className="px-5 py-2">
                          {daySessions.map(s => (
                            <div key={s.id} style={{ opacity: 0.5 }}>
                              <SessionBlock session={s} allChildren={children} hasConflict={false} onSelect={() => jumpToWeek(nextWeekStart!)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )
              })()}

              {/* Log prompt */}
              <div className="px-5 pt-2 pb-2">
                <button
                  onClick={() => navigate('/log')}
                  className="w-full rounded-[10px] px-2.5 py-2.5 text-xs flex items-center justify-center gap-1"
                  style={{ border: '0.5px dashed #E8E8EC', color: '#999AAA' }}
                >
                  <i className="ti ti-plus text-[13px]" />
                  Log an activity
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {selectedSession && (
        <SessionActionSheet
          session={selectedSession}
          allChildren={children}
          onClose={() => setSelectedSession(null)}
          onSaved={() => {
            setSelectedSession(null)
            sessionCache.invalidate(weekStart)
            setRefreshCounter(c => c + 1)
          }}
        />
      )}
    </div>
  )
}
