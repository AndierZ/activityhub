import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, isSameDay, isToday, isSameMonth,
  addMonths, subMonths, addDays,
} from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { getChildren } from '../lib/db/children'
import { getSavedTeachers, createTeacher, saveTeacher } from '../lib/db/teachers'
import { checkConflict, createOneOffSession, createRecurringSessions } from '../lib/db/sessions'
import {
  getChildColor, CHILD_COLOR_HEX, CHILD_COLOR_BG, getInitials,
} from '../types'
import type { Child, Teacher, UserTeacher, ConflictCheckResult } from '../types'

// ─── Time slots: 7 AM to 9 PM, 30-min increments ─────────────────────────────

const TIME_SLOTS: { hour: number; minute: number; label: string }[] = []
for (let h = 7; h <= 21; h++) {
  for (const m of [0, 30]) {
    if (h === 21 && m === 30) break
    const period = h < 12 ? 'am' : 'pm'
    const dh = h > 12 ? h - 12 : h === 0 ? 12 : h
    TIME_SLOTS.push({ hour: h, minute: m, label: `${dh}${m === 30 ? ':30' : ':00'}${period}` })
  }
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
  const [showAddForm, setShowAddForm]     = useState(false)
  const [newName, setNewName]             = useState('')
  const [newSubject, setNewSubject]       = useState('')
  const [newLocation, setNewLocation]     = useState('')
  const [savingTeacher, setSavingTeacher] = useState(false)

  // ── Step 2 ────────────────────────────────────────────────────────────────
  const [calMonth, setCalMonth]           = useState(new Date())
  const [selectedDate, setSelectedDate]   = useState(new Date())
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(null)
  const [recurring, setRecurring]         = useState(false)
  const [recurrenceRule, setRecurrenceRule] = useState<'weekly' | 'biweekly'>('weekly')
  const [endDate, setEndDate]             = useState('')
  const [price, setPrice]                 = useState('')
  const [conflict, setConflict]           = useState<ConflictCheckResult | null>(null)

  // ── Saving ────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)

  // ── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    getChildren(user.id).then(setChildren).catch(console.error)
    getSavedTeachers(user.id).then(setSavedTeachers).catch(console.error)
  }, [user])

  // ── Conflict check (runs whenever teacher / date / slot change) ───────────

  useEffect(() => {
    if (!selectedTeacher || selectedSlotIdx === null || !user) {
      setConflict(null)
      return
    }
    const slot  = TIME_SLOTS[selectedSlotIdx]
    const start = new Date(selectedDate)
    start.setHours(slot.hour, slot.minute, 0, 0)
    const end = new Date(start.getTime() + 60 * 60 * 1000)

    checkConflict(selectedTeacher.id, start.toISOString(), end.toISOString(), user.id)
      .then(setConflict)
      .catch(() => setConflict(null))
  }, [selectedTeacher, selectedDate, selectedSlotIdx, user])

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedSlot  = selectedSlotIdx !== null ? TIME_SLOTS[selectedSlotIdx] : null
  const sessionStart  = selectedSlot ? (() => {
    const d = new Date(selectedDate)
    d.setHours(selectedSlot.hour, selectedSlot.minute, 0, 0)
    return d
  })() : null
  const sessionEnd = sessionStart ? new Date(sessionStart.getTime() + 60 * 60 * 1000) : null

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
    if (!user || !selectedChildId || !selectedTeacher || !sessionStart || !sessionEnd || !selectedSlot) return
    setSaving(true)
    try {
      if (recurring && endDate) {
        await createRecurringSessions(user.id, {
          child_id:        selectedChildId,
          teacher_id:      selectedTeacher.id,
          day_of_week:     sessionStart.getDay(),
          time_of_day:     `${String(selectedSlot.hour).padStart(2, '0')}:${String(selectedSlot.minute).padStart(2, '0')}:00`,
          price:           parseFloat(price) || 0,
          recurrence_rule: recurrenceRule,
          start_date:      format(selectedDate, 'yyyy-MM-dd'),
          end_date:        endDate,
        })
      } else {
        await createOneOffSession(user.id, {
          child_id:   selectedChildId,
          teacher_id: selectedTeacher.id,
          starts_at:  sessionStart.toISOString(),
          ends_at:    sessionEnd.toISOString(),
          price:      parseFloat(price) || 0,
        })
      }
      navigate('/')
    } catch (err) {
      console.error(err)
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
    const canContinue = !!selectedChildId && !!selectedTeacher

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
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold"
                  style={{ background: active ? hex : '#D8D8DC', color: active ? '#fff' : '#999AAA' }}
                >
                  {getInitials(child.name)}
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
                onClick={() => { setSelectedTeacher(t); setShowAddForm(false) }}
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
                    style={{ background: '#F5F5F7', color: '#999AAA' }}
                  >
                    {t.active_students_count} students
                  </span>
                )}
              </button>
            )
          })}

          {/* Add new teacher */}
          <button
            onClick={() => setShowAddForm(f => !f)}
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
    const canContinue = selectedSlotIdx !== null && (!recurring || !!endDate)
    const DAY_LABELS  = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

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
                    background: selected ? '#7C6EE6' : 'transparent',
                    color:      selected ? '#fff'
                               : todayDay ? '#7C6EE6'
                               : inMonth  ? '#1A1A2E'
                               : '#D8D8DC',
                    fontWeight: selected || todayDay ? 600 : 400,
                    border:     todayDay && !selected ? '1px solid #7C6EE6' : 'none',
                  }}
                >
                  {format(day, 'd')}
                </span>
              </button>
            )
          })}
        </div>

        {/* Time slots */}
        <div
          className="text-[10px] font-semibold uppercase tracking-wide mb-2"
          style={{ color: '#999AAA' }}
        >
          Time
        </div>
        <div
          className="flex gap-2 overflow-x-auto pb-2 mb-2"
          style={{ scrollbarWidth: 'none' }}
        >
          {TIME_SLOTS.map((slot, i) => {
            const selected     = selectedSlotIdx === i
            const hasConflict  = conflict?.has_conflict && selected
            return (
              <button
                key={i}
                onClick={() => setSelectedSlotIdx(i)}
                className="flex-shrink-0 px-3 py-1.5 rounded-[10px] text-xs font-medium flex items-center gap-1"
                style={{
                  background: selected && !hasConflict ? '#7C6EE6'
                             : hasConflict             ? '#FEF8EC'
                             : '#F5F5F7',
                  color:      selected && !hasConflict ? '#fff'
                             : hasConflict             ? '#B87A10'
                             : '#555566',
                  border:     hasConflict ? '0.5px solid #E8A838' : '0.5px solid transparent',
                }}
              >
                {slot.label}
                {hasConflict && <i className="ti ti-alert-triangle" style={{ fontSize: 9 }} />}
              </button>
            )
          })}
        </div>

        {/* Conflict note */}
        {conflict?.has_conflict && selectedSlotIdx !== null && (
          <div
            className="flex gap-2 p-3 rounded-[12px] mb-3 text-xs leading-relaxed"
            style={{ background: '#FEF8EC', border: '0.5px solid #E8A838', color: '#B87A10' }}
          >
            <i className="ti ti-alert-triangle flex-shrink-0 mt-0.5" style={{ fontSize: 14 }} />
            <span>
              Another student also logged this time with {selectedTeacher?.name}.
              If you have confirmed a different time directly, go ahead and log it.
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
            onClick={() => setRecurring(r => !r)}
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
                min={format(selectedDate, 'yyyy-MM-dd')}
                max={format(addDays(selectedDate, 180), 'yyyy-MM-dd')}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Price */}
        <div
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
        </div>

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
    if (!selectedTeacher || !sessionStart || !sessionEnd || !selectedChildId) return null
    const child = children.find(c => c.id === selectedChildId)
    if (!child) return null

    const color     = getChildColor(child.display_order)
    const hex       = CHILD_COLOR_HEX[color]
    const bg        = CHILD_COLOR_BG[color]
    const timeLabel = `${format(sessionStart, 'h:mm')}-${format(sessionEnd, 'h:mm a')}`
    const dateLabel = `${format(sessionStart, 'EEE MMM d')} · ${timeLabel}`

    return (
      <div className="px-5 pt-4 pb-8">

        {/* Summary card */}
        <div className="rounded-[14px] overflow-hidden" style={{ border: '0.5px solid #E8E8EC' }}>

          {/* Card header */}
          <div
            className="px-4 py-4 flex flex-col items-center"
            style={{ background: bg, borderBottom: '0.5px solid #E8E8EC' }}
          >
            <i className="ti ti-school" style={{ fontSize: 28, color: hex }} />
            <div className="text-sm font-semibold mt-1.5" style={{ color: '#1A1A2E' }}>
              {selectedTeacher.subject} · {selectedTeacher.name}
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
            {selectedTeacher.location && (
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

            {/* Price */}
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
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 mt-5 rounded-[14px] text-sm font-semibold"
          style={{ background: '#7C6EE6', color: '#fff' }}
        >
          {saving ? 'Saving…' : 'Save to my calendar'}
        </button>
      </div>
    )
  }
}
