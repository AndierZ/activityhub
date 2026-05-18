import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, addMonths, subMonths, parseISO } from 'date-fns'
import { useAuth } from '../hooks/useAuth'
import { getMonthlyStatement, updatePayment, deletePayment } from '../lib/db/payments'
import { getSavedTeachers } from '../lib/db/teachers'
import { getChildren } from '../lib/db/children'
import { LogPaymentForm } from './StudentPaymentsPage'
import {
  getChildColor, CHILD_COLOR_HEX, CHILD_COLOR_BG, getInitials,
} from '../types'
import type { MonthlyStatement, StatementEntry, Child, UserTeacher } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAmt(n: number): string {
  return `$${Math.abs(n).toFixed(2).replace(/\.00$/, '')}`
}

function balanceLabel(n: number): { text: string; color: string } {
  if (Math.abs(n) < 0.01) return { text: 'Settled',   color: '#26B99A' }
  if (n > 0)              return { text: 'You owe',   color: '#C0830A' }
  return                         { text: 'In credit', color: '#26B99A' }
}

// ─── StudentStatementPage ─────────────────────────────────────────────────────

export function StudentStatementPage() {
  const { childId, teacherId } = useParams<{ childId: string; teacherId: string }>()
  const { user, effectiveUserId } = useAuth()
  const uid = effectiveUserId ?? user?.id ?? ''
  const navigate   = useNavigate()

  const [statement,     setStatement]     = useState<MonthlyStatement | null>(null)
  const [statMonth,     setStatMonth]     = useState(new Date())
  const [children,      setChildren]      = useState<Child[]>([])
  const [savedTeachers, setSavedTeachers] = useState<UserTeacher[]>([])
  const [loading,       setLoading]       = useState(true)
  const [showLogForm,   setShowLogForm]   = useState(false)
  const [editingEntry,  setEditingEntry]  = useState<StatementEntry | null>(null)
  const [editAmount,    setEditAmount]    = useState('')
  const [editDate,      setEditDate]      = useState('')
  const [editNote,      setEditNote]      = useState('')
  const [editSaving,    setEditSaving]    = useState(false)
  const [editError,     setEditError]     = useState<string | null>(null)

  useEffect(() => {
    if (!user || !childId || !teacherId) return
    Promise.all([
      getChildren(uid).then(setChildren),
      getSavedTeachers(uid).then(setSavedTeachers),
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
        uid, childId, teacherId,
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

  // ── Payment edit handlers ─────────────────────────────────────────────────────

  function openEditSheet(entry: StatementEntry) {
    setEditingEntry(entry)
    setEditAmount(String(Math.abs(entry.amount)))
    setEditDate(entry.date)
    setEditNote(entry.note ?? '')
    setEditError(null)
  }

  function closeEditSheet() {
    setEditingEntry(null)
    setEditSaving(false)
    setEditError(null)
  }

  async function handleSaveEdit() {
    if (!editingEntry) return
    const amt = parseFloat(editAmount)
    if (!editAmount || isNaN(amt) || amt <= 0) {
      setEditError('Enter a valid amount.')
      return
    }
    setEditSaving(true)
    setEditError(null)
    try {
      await updatePayment(editingEntry.id, {
        amount: amt,
        date:   editDate,
        note:   editNote.trim() || null,
      })
      closeEditSheet()
      loadStatement()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save.')
      setEditSaving(false)
    }
  }

  async function handleDeletePayment() {
    if (!editingEntry) return
    setEditSaving(true)
    try {
      await deletePayment(editingEntry.id)
      closeEditSheet()
      loadStatement()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to delete.')
      setEditSaving(false)
    }
  }

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
                    className={`flex items-start gap-3 py-3${isPayment ? ' cursor-pointer' : ''}`}
                    style={{ borderTop: i > 0 ? '0.5px solid #E8E8EC' : 'none' }}
                    onClick={isPayment ? () => openEditSheet(entry) : undefined}
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

                    {/* Edit affordance for payments only */}
                    {isPayment && (
                      <i className="ti ti-chevron-right flex-shrink-0 self-center" style={{ fontSize: 14, color: '#D8D8DC' }} />
                    )}
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

      {/* Edit payment bottom sheet */}
      {editingEntry && (
        <>
          {/* Backdrop */}
          <div
            className="absolute inset-0 z-20"
            style={{ background: 'rgba(0,0,0,0.3)' }}
            onClick={closeEditSheet}
          />

          {/* Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 z-30 rounded-t-[20px] pb-8"
            style={{ background: '#fff', boxShadow: '0 -4px 24px rgba(0,0,0,0.12)' }}
          >
            {/* Handle + header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <div className="text-[15px] font-semibold" style={{ color: '#1A1A2E' }}>
                Edit payment
              </div>
              <button onClick={closeEditSheet} className="p-1">
                <i className="ti ti-x" style={{ fontSize: 18, color: '#999AAA' }} />
              </button>
            </div>

            <div className="px-5 space-y-3">
              {/* Amount */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#999AAA' }}>
                  Amount
                </div>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-[10px]" style={{ border: '0.5px solid #E8E8EC', background: '#F5F5F7' }}>
                  <span className="text-[15px] font-medium" style={{ color: '#999AAA' }}>$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    className="flex-1 bg-transparent text-[15px] font-medium outline-none"
                    style={{ color: '#1A1A2E', fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
              </div>

              {/* Date */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#999AAA' }}>
                  Date
                </div>
                <input
                  type="date"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none"
                  style={{ border: '0.5px solid #E8E8EC', background: '#F5F5F7', color: '#1A1A2E', fontFamily: 'inherit' }}
                />
              </div>

              {/* Note */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#999AAA' }}>
                  Note (optional)
                </div>
                <input
                  type="text"
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  placeholder="e.g. May payment"
                  className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none"
                  style={{ border: '0.5px solid #E8E8EC', background: '#F5F5F7', color: '#1A1A2E', fontFamily: 'inherit' }}
                />
              </div>

              {editError && (
                <div className="text-[12px] px-1" style={{ color: '#E24B4A' }}>{editError}</div>
              )}

              {/* Save */}
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="w-full py-3 rounded-[12px] text-[14px] font-semibold text-white"
                style={{ background: editSaving ? '#B8B0F0' : '#7C6EE6' }}
              >
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>

              {/* Delete */}
              <button
                onClick={handleDeletePayment}
                disabled={editSaving}
                className="w-full py-3 rounded-[12px] text-[14px] font-semibold"
                style={{ color: '#E24B4A', border: '0.5px solid #F09595', background: '#fff' }}
              >
                Delete payment
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  )
}
