import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, isSameDay, isToday, isSameMonth,
  addMonths, subMonths, addDays,
} from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { getChildren } from '../lib/db/children'
import { getSavedTeachers, createTeacher, saveTeacher } from '../lib/db/teachers'
import {
  checkConflict,
  createOneOffSession,
  createRecurringSessions,
  getLatestSessionDefaults,
  getSessionsForDateAndTeacher,
} from '../lib/db/sessions'
import {
  getChildColor, CHILD_COLOR_HEX, CHILD_COLOR_BG, getInitials,
} from '../types'
import type { Child, Teacher, UserTeacher, ConflictCheckResult } from '../types'

// ─── Time presets ─────────────────────────────────────────────────────────────

const QUICK_START_TIMES = ['15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00']

function timeValueToLabel(value: string): string {
  const [hour, minute] = value.split(':').map(Number)
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return format(d, 'h:mm a')
}

function addMinutesToTimeValue(value: string, minutesToAdd: number): string {
  const [hour, minute] = value.split(':').map(Number)
  const d = new Date()
  d.setHours(hour, minute + minutesToAdd, 0, 0)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function durationBetweenTimeValues(start: string, end: string): number {
  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  return (endHour * 60 + endMinute) - (startHour * 60 + startMinute)
}

// ─── LogPage ──────────────────────────────────────────────────────────────────

export function LogPage() {
  const { user } = useAuth()
  const navigate  = useNavigate()

  const [step, setStep] = useState(1)

  // ── Step 1 ────────────────────────────────────────────────────────────────
  const [children, setChildren]           = useState<Child[]>([])
  const [savedTeachers, setSavedTeachers] = useState<UserTeacher[]>([])
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null)
  const [noTeacher, setNoTeacher]         = useState(false)
  const [activityTitle, setActivityTitle] = useState('')
  const [showAddForm, setShowAddForm]     = useState(false)
  const [newName, setNewName]             = useState('')
  const [newSubject, setNewSubject]       = useState('')
  const [newLocation, setNewLocation]     = useState('')
  const [savingTeacher, setSavingTeacher] = useState(false)

  // ── Step 2 ────────────────────────────────────────────────────────────────
  const [calMonth, setCalMonth]           = useState(new Date())
  const [selectedDate, setSelectedDate]   = useState(new Date())
  const [startTime, setStartTime]         = useState('15:30')
  const [endTime, setEndTime]             = useState('16:30')
  const [durationPresetMinutes, setDurationPresetMinutes] = useState(60)
  const [durationSource, setDurationSource] = useState<'default' | 'remembered'>('default')
  const [recurring, setRecurring]         = useState(false)
  const [recurrenceRule, setRecurrenceRule] = useState<'weekly' | 'biweekly'>('weekly')
  const [endDate, setEndDate]             = useState('')
  const [price, setPrice]                 = useState('')
  const [conflict, setConflict]           = useState<ConflictCheckResult | null>(null)
  const [ownSessions, setOwnSessions]     = useState<Array<{ id: string; starts_at: string; ends_at: string }>>([])
  const [saveError, setSaveError]         = useState<string | null>(null)

  // ── Saving ────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const startTimeRef = useRef(startTime)

  // ── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    getChildren(user.id).then(setChildren).catch(console.error)
    getSavedTeachers(user.id).then(setSavedTeachers).catch(console.error)
  }, [user])

  useEffect(() => {
    if (!selectedChildId && children.length > 0) {
      setSelectedChildId(children[0].id)
    }
  }, [children, selectedChildId])

  useEffect(() => {
    if (!selectedTeacher && !noTeacher && savedTeachers.length > 0 && savedTeachers[0].teacher) {
      setSelectedTeacher(savedTeachers[0].teacher)
    }
  }, [savedTeachers, selectedTeacher, noTeacher])

  useEffect(() => {
    startTimeRef.current = startTime
  }, [startTime])

  useEffect(() => {
    if (!user || !selectedChildId || !selectedTeacher) {
      setDurationPresetMinutes(60)
      setDurationSource('default')
      setEndTime(addMinutesToTimeValue(startTimeRef.current, 60))
      return
    }

    let cancelled = false
    getLatestSessionDefaults(user.id, selectedChildId, selectedTeacher.id)
      .then(defaults => {
        if (cancelled) return
        const duration = defaults?.duration_minutes ?? 60
        setDurationPresetMinutes(duration)
        setEndTime(addMinutesToTimeValue(startTimeRef.current, duration))
        setDurationSource(defaults ? 'remembered' : 'default')
        if (defaults) {
          setPrice(String(defaults.price))
        }
      })
      .catch(() => {
        if (cancelled) return
        setDurationPresetMinutes(60)
        setEndTime(addMinutesToTimeValue(startTimeRef.current, 60))
        setDurationSource('default')
      })

    return () => { cancelled = true }
  }, [user, selectedChildId, selectedTeacher])

  // ── Own sessions for selected date + teacher (to detect self-overlap) ─────

  useEffect(() => {
    if (!user || !selectedTeacher || noTeacher) { setOwnSessions([]); return }
    getSessionsForDateAndTeacher(user.id, selectedTeacher.id, selectedDate)
      .then(setOwnSessions)
      .catch(() => setOwnSessions([]))
  }, [user, selectedTeacher, noTeacher, selectedDate])

  // ── Conflict check (runs whenever teacher / date / slot change) ───────────

  useEffect(() => {
    if (!selectedTeacher || noTeacher || !startTime || !endTime || !user) {
      setConflict(null)
      return
    }

    const start = new Date(selectedDate)
    const [startHour, startMinute] = startTime.split(':').map(Number)
    start.setHours(startHour, startMinute, 0, 0)

    const end = new Date(selectedDate)
    const [endHour, endMinute] = endTime.split(':').map(Number)
    end.setHours(endHour, endMinute, 0, 0)

    if (end <= start) {
      setConflict(null)
      return
    }

    checkConflict(selectedTeacher.id, start.toISOString(), end.toISOString(), user.id)
      .then(setConflict)
      .catch(() => setConflict(null))
  }, [selectedTeacher, selectedDate, startTime, endTime, user])

  // ── Derived ───────────────────────────────────────────────────────────────

  const sessionStart  = startTime ? (() => {
    const d = new Date(selectedDate)
    const [hour, minute] = startTime.split(':').map(Number)
    d.setHours(hour, minute, 0, 0)
    return d
  })() : null
  const sessionEnd = endTime ? (() => {
    const d = new Date(selectedDate)
    const [hour, minute] = endTime.split(':').map(Number)
    d.setHours(hour, minute, 0, 0)
    return d
  })() : null
  const durationMinutes = sessionStart && sessionEnd
    ? Math.round((sessionEnd.getTime() - sessionStart.getTime()) / 60000)
    : 0

  // ── Calendar grid ─────────────────────────────────────────────────────────

  const calMonthStart = startOfMonth(calMonth)
  const calMonthEnd   = endOfMonth(calMonth)
  const calGridStart  = startOfWeek(calMonthStart, { weekStartsOn: 0 })
  const calDays       = eachDayOfInterval({ start: calGridStart, end: calMonthEnd })

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleBack() {
    if (step === 1) navigate(-1)
    else setStep(s => s - 1)
  }

  function handleStartTimeChange(nextStartTime: string) {
    setStartTime(nextStartTime)
    setEndTime(addMinutesToTimeValue(nextStartTime, durationPresetMinutes))
  }

  async function handleAddTeacher() {
    if (!user || !newName.trim() || !newSubject.trim()) return
    setSavingTeacher(true)
    try {
      const teacher = await createTeacher(user.id, {
        name:     newName.trim(),
        subject:  newSubject.trim(),
        location: newLocation.trim() || undefined,
      })
      await saveTeacher(user.id, teacher.id)
      setSavedTeachers(prev => [
        ...prev,
        {
          id: teacher.id, user_id: user.id, teacher_id: teacher.id,
          notes: null, created_at: new Date().toISOString(), updated_at: null,
          teacher,
        },
      ])
      setSelectedTeacher(teacher)
      setShowAddForm(false)
      setNewName(''); setNewSubject(''); setNewLocation('')
    } catch (err) {
      console.error(err)
    } finally {
      setSavingTeacher(false)
    }
  }

  async function handleSave() {
    if (!user || !selectedChildId || !sessionStart || !sessionEnd || !startTime || durationMinutes <= 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const teacherId = selectedTeacher?.id ?? null
      const title     = noTeacher ? activityTitle.trim() || null : null
      if (recurring && endDate) {
        await createRecurringSessions(user.id, {
          child_id:         selectedChildId,
          teacher_id:       teacherId,
          title,
          day_of_week:      sessionStart.getDay(),
          time_of_day:      `${startTime}:00`,
          duration_minutes: durationMinutes,
          price:            parseFloat(price) || 0,
          recurrence_rule:  recurrenceRule,
          start_date:       format(selectedDate, 'yyyy-MM-dd'),
          end_date:         endDate,
        })
      } else {
        await createOneOffSession(user.id, {
          child_id:   selectedChildId,
          teacher_id: teacherId,
          title,
          starts_at:  sessionStart.toISOString(),
          ends_at:    sessionEnd.toISOString(),
          price:      parseFloat(price) || 0,
        })
      }
      navigate('/', { replace: true })
    } catch (err) {
      console.error(err)
      setSaveError(err instanceof Error ? err.message : 'Could not save this activity. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const progressPct = step === 1 ? 33 : step === 2 ? 66 : 100

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 pt-3 pb-2.5 flex-shrink-0"
        style={{ borderBottom: '0.5px solid #E8E8EC' }}
      >
        <button onClick={handleBack} className="w-8 h-8 flex items-center justify-center">
          <i className="ti ti-arrow-left" style={{ fontSize: 18, color: '#555566' }} />
        </button>
        <div className="flex-1 text-sm font-semibold" style={{ color: '#1A1A2E' }}>
          Log an activity
        </div>
        <div className="text-xs" style={{ color: '#999AAA' }}>Step {step} of 3</div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 flex-shrink-0" style={{ background: '#E8E8EC' }}>
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${progressPct}%`, background: '#7C6EE6' }}
        />
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {step === 1 && Step1()}
        {step === 2 && Step2()}
        {step === 3 && Step3()}
      </div>

    </div>
  )

  // ────────────────────────────────────────────────────────────────────────────

  function Step1() {
    const canContinue = !!selectedChildId && (!!selectedTeacher || (noTeacher && !!activityTitle.trim()))

    return (
      <div className="px-5 pt-4 pb-8">

        {/* Self-report banner */}
        <div
          className="flex gap-2.5 p-3 rounded-[12px] mb-5"
          style={{ background: '#F5F5F7', border: '0.5px solid #E8E8EC' }}
        >
          <i className="ti ti-pencil flex-shrink-0 mt-0.5" style={{ fontSize: 14, color: '#999AAA' }} />
          <p className="text-xs leading-relaxed" style={{ color: '#555566' }}>
            <strong style={{ color: '#1A1A2E' }}>You are logging a session you have arranged.</strong>{' '}
            This is your personal record — it will not notify or confirm anything with the teacher.
          </p>
        </div>

        {/* Child selector */}
        <div
          className="text-[10px] font-semibold uppercase tracking-wide mb-2"
          style={{ color: '#999AAA' }}
        >
          For which child?
        </div>
        <div className="flex gap-2 mb-5">
          {children.map(child => {
            const color  = getChildColor(child.display_order)
            const hex    = CHILD_COLOR_HEX[color]
            const bg     = CHILD_COLOR_BG[color]
            const active = selectedChildId === child.id
            return (
              <button
                key={child.id}
                onClick={() => setSelectedChildId(child.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-[12px]"
                style={{
                  background: active ? bg : '#F5F5F7',
                  border:     `1px solid ${active ? hex : '#E8E8EC'}`,
                }}
              >
                <div
                  className="w-6 h-6 rounded-lg overflow-hidden flex items-center justify-center text-[10px] font-bold"
                  style={child.avatar_url ? {} : { background: active ? hex : '#D8D8DC', color: active ? '#fff' : '#999AAA' }}
                >
                  {child.avatar_url
                    ? <img src={child.avatar_url} alt="" className="w-full h-full object-cover" />
                    : getInitials(child.name)
                  }
                </div>
                <span className="text-sm font-medium" style={{ color: active ? hex : '#555566' }}>
                  {child.name}
                </span>
              </button>
            )
          })}
          {children.length === 0 && (
            <p className="text-xs" style={{ color: '#999AAA' }}>No children added yet — add one in Profile.</p>
          )}
        </div>

        {/* Teacher selector */}
        <div
          className="text-[10px] font-semibold uppercase tracking-wide mb-2"
          style={{ color: '#999AAA' }}
        >
          Which teacher?
        </div>
        <div className="flex flex-col gap-1.5 mb-5">
          {savedTeachers.map(ut => {
            const t      = ut.teacher!
            const active = selectedTeacher?.id === t.id
            return (
              <button
                key={t.id}
                onClick={() => { setSelectedTeacher(t); setNoTeacher(false); setShowAddForm(false) }}
                className="flex items-center gap-3 px-3.5 py-3 rounded-[14px] w-full text-left"
                style={{
                  border:     `0.5px solid ${active ? '#7C6EE6' : '#E8E8EC'}`,
                  background: active ? '#EEEBfd' : '#fff',
                }}
              >
                <div
                  className="w-8 h-8 rounded-[9px] flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                  style={{ background: active ? '#7C6EE6' : '#F5F5F7', color: active ? '#fff' : '#555566' }}
                >
                  {getInitials(t.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: active ? '#7C6EE6' : '#1A1A2E' }}>
                    {t.name}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#999AAA' }}>{t.subject}</div>
                </div>
                {t.active_students_count > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0"
                    style={{ background: '#FEF3DC', color: '#9A6A10' }}
                  >
                    {t.active_students_count} students
                  </span>
                )}
              </button>
            )
          })}

          {/* Add new teacher */}
          <button
            onClick={() => { setShowAddForm(f => !f); setNoTeacher(false) }}
            className="flex items-center gap-3 px-3.5 py-3 rounded-[14px] w-full text-left"
            style={{ border: '0.5px dashed #D8D8DC', background: 'transparent' }}
          >
            <div
              className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
              style={{ border: '0.5px dashed #D8D8DC' }}
            >
              <i className="ti ti-plus" style={{ fontSize: 14, color: '#999AAA' }} />
            </div>
            <div>
              <div className="text-[13px]" style={{ color: '#555566' }}>Add new teacher</div>
              <div className="text-[11px] mt-0.5" style={{ color: '#999AAA' }}>Join the community directory</div>
            </div>
          </button>

          {/* No teacher option */}
          <button
            onClick={() => { setNoTeacher(true); setSelectedTeacher(null); setShowAddForm(false) }}
            className="flex items-center gap-3 px-3.5 py-3 rounded-[14px] w-full text-left"
            style={{
              border:     `0.5px solid ${noTeacher ? '#7C6EE6' : '#E8E8EC'}`,
              background: noTeacher ? '#EEEBfd' : '#fff',
            }}
          >
            <div
              className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
              style={{ background: noTeacher ? '#7C6EE6' : '#F5F5F7' }}
            >
              <i className="ti ti-calendar-event" style={{ fontSize: 14, color: noTeacher ? '#fff' : '#999AAA' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium" style={{ color: noTeacher ? '#7C6EE6' : '#555566' }}>
                No teacher
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: '#999AAA' }}>Free-form activity</div>
            </div>
          </button>

          {/* Activity title input — shown when no teacher is selected */}
          {noTeacher && (
            <input
              autoFocus
              type="text"
              placeholder="Activity name, e.g. Swimming practice"
              value={activityTitle}
              onChange={e => setActivityTitle(e.target.value)}
              className="w-full text-sm rounded-[12px] px-3.5 py-3 outline-none"
              style={{
                border:      '0.5px solid #7C6EE6',
                background:  '#F5F5F7',
                color:       '#1A1A2E',
                fontFamily:  'inherit',
              }}
            />
          )}

          {/* Inline add form */}
          {showAddForm && (
            <div
              className="px-4 py-4 rounded-[14px]"
              style={{ background: '#F5F5F7', border: '0.5px solid #E8E8EC' }}
            >
              <input
                className="w-full text-sm rounded-[9px] px-3 py-2 mb-2 outline-none"
                style={{ background: '#fff', border: '0.5px solid #E8E8EC', color: '#1A1A2E' }}
                placeholder="Teacher name *"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
              <input
                className="w-full text-sm rounded-[9px] px-3 py-2 mb-2 outline-none"
                style={{ background: '#fff', border: '0.5px solid #E8E8EC', color: '#1A1A2E' }}
                placeholder="Subject (e.g. Piano) *"
                value={newSubject}
                onChange={e => setNewSubject(e.target.value)}
              />
              <input
                className="w-full text-sm rounded-[9px] px-3 py-2 mb-3 outline-none"
                style={{ background: '#fff', border: '0.5px solid #E8E8EC', color: '#1A1A2E' }}
                placeholder="Location (optional)"
                value={newLocation}
                onChange={e => setNewLocation(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowAddForm(false); setNewName(''); setNewSubject(''); setNewLocation('') }}
                  className="flex-1 py-2 rounded-[9px] text-sm"
                  style={{ background: '#fff', border: '0.5px solid #E8E8EC', color: '#555566' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddTeacher}
                  disabled={!newName.trim() || !newSubject.trim() || savingTeacher}
                  className="flex-1 py-2 rounded-[9px] text-sm font-medium"
                  style={{
                    background: newName.trim() && newSubject.trim() ? '#7C6EE6' : '#D8D8DC',
                    color:      newName.trim() && newSubject.trim() ? '#fff' : '#999AAA',
                  }}
                >
                  {savingTeacher ? 'Saving…' : 'Add teacher'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Continue */}
        <button
          onClick={() => { if (canContinue) setStep(2) }}
          className="w-full py-3.5 rounded-[14px] text-sm font-semibold"
          style={{
            background: canContinue ? '#7C6EE6' : '#E8E8EC',
            color:      canContinue ? '#fff' : '#999AAA',
          }}
        >
          Continue
        </button>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────────────────────

  function Step2() {
    const minRecurringEndDate = format(addDays(selectedDate, 1), 'yyyy-MM-dd')
    const maxRecurringEndDate = format(addDays(selectedDate, 180), 'yyyy-MM-dd')
    // Check if a given start time (HH:MM) overlaps any of the user's own sessions on this date+teacher
    function overlapsOwnSession(timeStr: string, durationMins: number): boolean {
      const s = new Date(selectedDate)
      const [h, m] = timeStr.split(':').map(Number)
      s.setHours(h, m, 0, 0)
      const e = new Date(s.getTime() + durationMins * 60000)
      return ownSessions.some(os => s < new Date(os.ends_at) && e > new Date(os.starts_at))
    }

    const selfConflict = !!startTime && durationMinutes > 0 && overlapsOwnSession(startTime, durationPresetMinutes)
    const canContinue  = !!startTime && durationMinutes > 0 && !selfConflict &&
                         (!recurring || (!!endDate && endDate >= minRecurringEndDate))
    const DAY_LABELS   = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

    return (
      <div className="px-5 pt-4 pb-8">

        {/* Mini calendar */}
        <div
          className="text-[10px] font-semibold uppercase tracking-wide mb-2"
          style={{ color: '#999AAA' }}
        >
          When did you arrange?
        </div>

        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setCalMonth(m => subMonths(m, 1))} className="p-1" style={{ color: '#999AAA' }}>
            <i className="ti ti-chevron-left text-xs" />
          </button>
          <span className="text-sm font-semibold" style={{ color: '#1A1A2E' }}>
            {format(calMonth, 'MMMM yyyy')}
          </span>
          <button onClick={() => setCalMonth(m => addMonths(m, 1))} className="p-1" style={{ color: '#999AAA' }}>
            <i className="ti ti-chevron-right text-xs" />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-0.5">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold" style={{ color: '#999AAA' }}>
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 mb-4">
          {calDays.map(day => {
            const inMonth  = isSameMonth(day, calMonth)
            const todayDay = isToday(day)
            const selected = isSameDay(day, selectedDate)
            return (
              <button
                key={day.toISOString()}
                onClick={() => { if (inMonth) setSelectedDate(day) }}
                className="flex items-center justify-center h-8"
              >
                <span
                  className="w-7 h-7 flex items-center justify-center rounded-full text-[13px]"
                  style={{
                    background: 'transparent',
                    color:      selected ? '#7C6EE6'
                               : todayDay ? '#7C6EE6'
                               : inMonth  ? '#1A1A2E'
                               : '#D8D8DC',
                    fontWeight: selected || todayDay ? 700 : 400,
                    border:     selected ? '1.5px solid #7C6EE6'
                               : todayDay ? '1px solid #7C6EE6'
                               : 'none',
                  }}
                >
                  {format(day, 'd')}
                </span>
              </button>
            )
          })}
        </div>

        {/* Time */}
        <div
          className="text-[10px] font-semibold uppercase tracking-wide mb-2"
          style={{ color: '#999AAA' }}
        >
          Time
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <label>
            <span className="text-xs mb-1 block" style={{ color: '#555566' }}>Start</span>
            <input
              type="time"
              step="900"
              className="w-full text-sm rounded-[10px] px-3 py-2.5 outline-none"
              style={{ background: '#F5F5F7', border: '0.5px solid #E8E8EC', color: '#1A1A2E' }}
              value={startTime}
              onChange={e => handleStartTimeChange(e.target.value)}
            />
          </label>
          <label>
            <span className="text-xs mb-1 block" style={{ color: '#555566' }}>End</span>
            <input
              type="time"
              step="900"
              className="w-full text-sm rounded-[10px] px-3 py-2.5 outline-none"
              style={{
                background: durationMinutes <= 0 ? '#FEF8EC' : '#F5F5F7',
                border:     `0.5px solid ${durationMinutes <= 0 ? '#E8A838' : '#E8E8EC'}`,
                color:      '#1A1A2E',
              }}
              value={endTime}
              onChange={e => {
                const nextEndTime = e.target.value
                const nextDuration = durationBetweenTimeValues(startTime, nextEndTime)
                setEndTime(nextEndTime)
                if (nextDuration > 0) setDurationPresetMinutes(nextDuration)
                setDurationSource('default')
              }}
            />
          </label>
        </div>
        <div className="text-[11px] mb-2" style={{ color: durationMinutes <= 0 ? '#B87A10' : '#999AAA' }}>
          {durationMinutes > 0
            ? `${durationMinutes} min${durationSource === 'remembered' ? ' · based on last session with this teacher' : ''}`
            : 'End time must be after start time'}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: 'none' }}>
          {QUICK_START_TIMES.map(time => {
            const selected = startTime === time
            const taken    = overlapsOwnSession(time, durationPresetMinutes)
            return (
              <button
                key={time}
                onClick={() => { if (!taken) handleStartTimeChange(time) }}
                disabled={taken}
                className="flex-shrink-0 px-3 py-1.5 rounded-[10px] text-xs font-medium flex items-center gap-1"
                style={{
                  background:  taken    ? '#F5F5F7' : selected ? '#7C6EE6' : '#F5F5F7',
                  color:       taken    ? '#C8C8D0' : selected ? '#fff'    : '#555566',
                  border:      taken    ? '0.5px dashed #D8D8DC' : '0.5px solid transparent',
                  cursor:      taken    ? 'default' : 'pointer',
                }}
              >
                {timeValueToLabel(time)}
              </button>
            )
          })}
        </div>

        {/* Self-conflict note (blocking) */}
        {selfConflict && (
          <div
            className="flex gap-2 p-3 rounded-[12px] mb-3 text-xs leading-relaxed"
            style={{ background: '#FDECEB', border: '0.5px solid #E86B5F', color: '#C0524A' }}
          >
            <i className="ti ti-alert-circle flex-shrink-0 mt-0.5" style={{ fontSize: 14 }} />
            <span>
              You've already logged a session with {selectedTeacher?.name} at this time.
              Pick a different time or delete the existing session first.
            </span>
          </div>
        )}

        {/* Other-student conflict note (advisory) */}
        {!selfConflict && conflict?.has_conflict && (
          <div
            className="flex gap-2 p-3 rounded-[12px] mb-3 text-xs leading-relaxed"
            style={{ background: '#FEF8EC', border: '0.5px solid #E8A838', color: '#B87A10' }}
          >
            <i className="ti ti-alert-triangle flex-shrink-0 mt-0.5" style={{ fontSize: 14 }} />
            <span>
              Another student also logged this time with {selectedTeacher?.name}.
              If you arranged a different time directly, go ahead and log it.
            </span>
          </div>
        )}

        {/* Recurring toggle */}
        <div
          className="flex items-center justify-between py-3"
          style={{ borderTop: '0.5px solid #E8E8EC' }}
        >
          <div>
            <div className="text-sm font-medium" style={{ color: '#1A1A2E' }}>Recurring session</div>
            <div className="text-xs mt-0.5" style={{ color: '#999AAA' }}>
              {recurring
                ? (recurrenceRule === 'weekly' ? 'Repeat weekly' : 'Repeat biweekly')
                : 'One-off session'}
            </div>
          </div>
          <button
            onClick={() => {
              setRecurring(r => {
                const next = !r
                if (next && (!endDate || endDate < minRecurringEndDate)) {
                  setEndDate(minRecurringEndDate)
                }
                return next
              })
            }}
            className="relative w-11 h-6 rounded-full flex-shrink-0"
            style={{ background: recurring ? '#7C6EE6' : '#D8D8DC' }}
          >
            <div
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200"
              style={{ left: recurring ? '22px' : '2px' }}
            />
          </button>
        </div>

        {recurring && (
          <div className="pb-1">
            <div className="flex gap-2 mb-3">
              {(['weekly', 'biweekly'] as const).map(rule => (
                <button
                  key={rule}
                  onClick={() => setRecurrenceRule(rule)}
                  className="px-3 py-1.5 rounded-[10px] text-xs font-medium"
                  style={{
                    background: recurrenceRule === rule ? '#EEEBfd' : '#F5F5F7',
                    color:      recurrenceRule === rule ? '#7C6EE6' : '#555566',
                    border:     `0.5px solid ${recurrenceRule === rule ? '#7C6EE6' : '#E8E8EC'}`,
                  }}
                >
                  {rule === 'weekly' ? 'Weekly' : 'Biweekly'}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: '#555566' }}>
                Ends on <span style={{ color: '#999AAA', fontWeight: 400 }}>(max 180 days)</span>
              </label>
              <input
                type="date"
                className="w-full text-sm rounded-[9px] px-3 py-2 outline-none"
                style={{ background: '#F5F5F7', border: '0.5px solid #E8E8EC', color: '#1A1A2E' }}
                value={endDate}
                min={minRecurringEndDate}
                max={maxRecurringEndDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Price — hidden for teacher-less sessions */}
        {!noTeacher && <div
          className="flex items-center justify-between py-3"
          style={{ borderTop: '0.5px solid #E8E8EC' }}
        >
          <div>
            <div className="text-sm font-medium" style={{ color: '#1A1A2E' }}>Price per session</div>
            <div className="text-xs mt-0.5" style={{ color: '#999AAA' }}>Edit if different</div>
          </div>
          <div
            className="flex items-center"
            style={{ border: '0.5px solid #E8E8EC', borderRadius: 9, background: '#F5F5F7' }}
          >
            <span className="pl-2.5 text-sm" style={{ color: '#999AAA' }}>$</span>
            <input
              type="number"
              className="w-16 text-sm text-right px-2 py-1.5 outline-none bg-transparent"
              style={{ color: '#1A1A2E' }}
              placeholder="0"
              value={price}
              onChange={e => setPrice(e.target.value)}
              min="0"
              step="0.01"
            />
          </div>
        </div>}

        {/* Continue */}
        <button
          onClick={() => { if (canContinue) setStep(3) }}
          className="w-full py-3.5 mt-2 rounded-[14px] text-sm font-semibold"
          style={{
            background: canContinue ? '#7C6EE6' : '#E8E8EC',
            color:      canContinue ? '#fff' : '#999AAA',
          }}
        >
          Continue
        </button>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────────────────────

  function Step3() {
    if (!sessionStart || !sessionEnd || !selectedChildId) return null
    const child = children.find(c => c.id === selectedChildId)
    if (!child) return null

    const color        = getChildColor(child.display_order)
    const hex          = CHILD_COLOR_HEX[color]
    const bg           = CHILD_COLOR_BG[color]
    const timeLabel    = `${format(sessionStart, 'h:mm')}-${format(sessionEnd, 'h:mm a')}`
    const dateLabel    = `${format(sessionStart, 'EEE MMM d')} · ${timeLabel}`
    const displayTitle = selectedTeacher
      ? `${selectedTeacher.subject} · ${selectedTeacher.name}`
      : (activityTitle.trim() || 'Activity')

    return (
      <div className="px-5 pt-4 pb-8">

        {/* Summary card */}
        <div className="rounded-[14px] overflow-hidden" style={{ border: '0.5px solid #E8E8EC' }}>

          {/* Card header */}
          <div
            className="px-4 py-4 flex flex-col items-center"
            style={{ background: bg, borderBottom: '0.5px solid #E8E8EC' }}
          >
            <i
              className={`ti ${selectedTeacher ? 'ti-school' : 'ti-calendar-event'}`}
              style={{ fontSize: 28, color: hex }}
            />
            <div className="text-sm font-semibold mt-1.5" style={{ color: '#1A1A2E' }}>
              {displayTitle}
            </div>
            <div className="text-xs mt-0.5" style={{ color: hex }}>
              {child.name} · your logged session
            </div>
          </div>

          {/* Detail rows */}
          <div>
            {/* Date & time */}
            <div
              className="flex items-start gap-3 px-4 py-3"
              style={{ borderBottom: '0.5px solid #E8E8EC' }}
            >
              <i className="ti ti-calendar mt-0.5" style={{ fontSize: 16, color: '#999AAA' }} />
              <div>
                <div className="text-[10px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: '#999AAA' }}>
                  Date and time
                </div>
                <div className="text-sm font-medium" style={{ color: '#1A1A2E' }}>{dateLabel}</div>
                <div
                  className="inline-flex items-center gap-1 mt-1 text-[10px] px-1.5 py-0.5 rounded-md"
                  style={{ background: '#F5F5F7', color: '#999AAA' }}
                >
                  <i className="ti ti-pencil" style={{ fontSize: 9 }} /> Logged by you
                </div>
              </div>
            </div>

            {/* Recurring */}
            {recurring && (
              <div
                className="flex items-start gap-3 px-4 py-3"
                style={{ borderBottom: '0.5px solid #E8E8EC' }}
              >
                <i className="ti ti-refresh mt-0.5" style={{ fontSize: 16, color: '#999AAA' }} />
                <div>
                  <div className="text-[10px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: '#999AAA' }}>
                    Recurring
                  </div>
                  <div className="text-sm font-medium" style={{ color: '#1A1A2E' }}>
                    Every {format(sessionStart, 'EEEE')} · {recurrenceRule === 'weekly' ? 'weekly' : 'biweekly'}
                  </div>
                  {endDate && (
                    <div className="text-xs mt-0.5" style={{ color: '#999AAA' }}>
                      Until {format(new Date(endDate), 'MMM d, yyyy')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Location */}
            {selectedTeacher?.location && (
              <div
                className="flex items-start gap-3 px-4 py-3"
                style={{ borderBottom: '0.5px solid #E8E8EC' }}
              >
                <i className="ti ti-map-pin mt-0.5" style={{ fontSize: 16, color: '#999AAA' }} />
                <div>
                  <div className="text-[10px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: '#999AAA' }}>
                    Location
                  </div>
                  <div className="text-sm font-medium" style={{ color: '#1A1A2E' }}>
                    {selectedTeacher.location}
                  </div>
                </div>
              </div>
            )}

            {/* Duration */}
            <div
              className="flex items-start gap-3 px-4 py-3"
              style={{ borderBottom: '0.5px solid #E8E8EC' }}
            >
              <i className="ti ti-clock-hour-4 mt-0.5" style={{ fontSize: 16, color: '#999AAA' }} />
              <div>
                <div className="text-[10px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: '#999AAA' }}>
                  Duration
                </div>
                <div className="text-sm font-medium" style={{ color: '#1A1A2E' }}>
                  {durationMinutes} minutes
                </div>
              </div>
            </div>

            {/* Price */}
            {!noTeacher && (
            <div className="flex items-start gap-3 px-4 py-3">
              <i className="ti ti-cash mt-0.5" style={{ fontSize: 16, color: '#999AAA' }} />
              <div>
                <div className="text-[10px] uppercase tracking-wide font-semibold mb-0.5" style={{ color: '#999AAA' }}>
                  Price this session
                </div>
                <div className="text-sm font-medium" style={{ color: '#1A1A2E' }}>
                  {price ? `$${parseFloat(price).toFixed(2)}` : 'Free'}
                </div>
              </div>
            </div>
            )}
          </div>
        </div>

        {/* Save */}
        {saveError && (
          <div
            className="flex gap-2 p-3 rounded-[12px] mt-4 text-xs leading-relaxed"
            style={{ background: '#FEF8EC', border: '0.5px solid #E8A838', color: '#B87A10' }}
          >
            <i className="ti ti-alert-triangle flex-shrink-0 mt-0.5" style={{ fontSize: 14 }} />
            <span>{saveError}</span>
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={saving || durationMinutes <= 0}
          className="w-full py-3.5 mt-5 rounded-[14px] text-sm font-semibold"
          style={{
            background: saving || durationMinutes <= 0 ? '#E8E8EC' : '#7C6EE6',
            color:      saving || durationMinutes <= 0 ? '#999AAA' : '#fff',
          }}
        >
          {saving ? 'Saving…' : 'Save to my calendar'}
        </button>
      </div>
    )
  }
}
