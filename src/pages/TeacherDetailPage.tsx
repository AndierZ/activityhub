import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import {
  getTeacherById,
  isTeacherSaved,
  saveTeacher,
  unsaveTeacher,
  getTeacherCrowdsourcedSchedule,
} from '../lib/db/teachers'
import type { CrowdsourcedSlot } from '../lib/db/teachers'
import { createTeacherInvitation, getTeacherPendingInvitation, deleteInvitation } from '../lib/db/sharing'
import type { Teacher, Session, Child } from '../types'
import { CHILD_COLOR_HEX, CHILD_COLOR_BG, getChildColor, getInitials, CHILD_COLORS } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ChildColor = 'purple' | 'teal' | 'coral' | 'amber'

function teacherAvatarColor(id: string): ChildColor {
  const n = id.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  return CHILD_COLORS[n % 4]
}

const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatTimeRange(timeOfDay: string): string {
  const [hStr, mStr] = timeOfDay.split(':')
  const h = parseInt(hStr)
  const m = parseInt(mStr)

  const startDate = new Date(2000, 0, 1, h, m)
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000)

  const fmt = (d: Date) => {
    const hours = d.getHours()
    const mins = d.getMinutes()
    const h12 = hours % 12 || 12
    return mins === 0 ? `${h12}` : `${h12}:${mins.toString().padStart(2, '0')}`
  }

  const endAmPm = endDate.getHours() >= 12 ? 'PM' : 'AM'
  return `${fmt(startDate)}–${fmt(endDate)} ${endAmPm}`
}

function timeOfDayToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// ─── TeacherDetailPage ────────────────────────────────────────────────────────

export function TeacherDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, effectiveUserId, canManageTeachers } = useAuth()
  const uid = effectiveUserId ?? user?.id ?? ''

  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [saved, setSaved] = useState(false)
  const [slots, setSlots] = useState<CrowdsourcedSlot[]>([])
  const [mySessions, setMySessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [savingToggle, setSavingToggle] = useState(false)
  const [inviteLink, setInviteLink]     = useState<string | null>(null)
  const [inviteId,   setInviteId]       = useState<string | null>(null)
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [cancellingInvite, setCancellingInvite] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)

  useEffect(() => {
    if (!user || !id) return
    loadAll()
  }, [user, id])

  async function loadAll() {
    if (!user || !id) return
    setLoading(true)
    try {
      const [teacherData, savedData, slotsData, sessionsResult, pendingInvite] = await Promise.all([
        getTeacherById(id),
        isTeacherSaved(uid, id),
        getTeacherCrowdsourcedSchedule(id, uid),
        supabase
          .from('sessions')
          .select('*, child:children(*)')
          .eq('user_id', uid)
          .eq('teacher_id', id)
          .eq('status', 'scheduled'),
        canManageTeachers ? getTeacherPendingInvitation(id) : Promise.resolve(null),
      ])
      setTeacher(teacherData)
      setSaved(savedData)
      setSlots(slotsData)
      setMySessions((sessionsResult.data ?? []) as unknown as Session[])
      if (pendingInvite) {
        setInviteId(pendingInvite.id)
        setInviteLink(`${window.location.origin}/join/${pendingInvite.token}`)
      }
    } catch (err) {
      console.error('Failed to load teacher detail:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveToggle() {
    if (!user || !teacher || savingToggle) return
    setSavingToggle(true)
    try {
      if (saved) {
        await unsaveTeacher(uid, teacher.id)
        setSaved(false)
      } else {
        await saveTeacher(uid, teacher.id)
        setSaved(true)
      }
    } catch (err) {
      console.error('Failed to toggle save:', err)
    } finally {
      setSavingToggle(false)
    }
  }

  async function handleGenerateInvite() {
    if (!user || !teacher || generatingInvite) return
    setGeneratingInvite(true)
    try {
      if (inviteId) {
        try { await deleteInvitation(inviteId) } catch { /* stale id — continue */ }
      }
      const { id: newId, token } = await createTeacherInvitation(user.id, teacher.id)
      setInviteId(newId)
      setInviteLink(`${window.location.origin}/join/${token}`)
    } catch (err) {
      console.error('Failed to generate teacher invite:', err)
    } finally {
      setGeneratingInvite(false)
    }
  }

  async function handleCancelInvite() {
    if (!inviteId || cancellingInvite) return
    setCancellingInvite(true)
    try {
      await deleteInvitation(inviteId)
      setInviteId(null)
      setInviteLink(null)
    } catch (err) {
      console.error('Failed to cancel invite:', err)
    } finally {
      setCancellingInvite(false)
    }
  }

  async function handleCopyInvite() {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setInviteCopied(true)
    setTimeout(() => setInviteCopied(false), 2000)
  }

  // Find matching child session for a slot (by day + approximate time)
  function findChildForSlot(slot: CrowdsourcedSlot): Child | undefined {
    const slotMinutes = timeOfDayToMinutes(slot.time_of_day)
    for (const sess of mySessions) {
      const d = new Date(sess.starts_at)
      if (d.getDay() !== slot.day_of_week) continue
      const sessMinutes = d.getHours() * 60 + d.getMinutes()
      if (Math.abs(sessMinutes - slotMinutes) <= 5) {
        return sess.child as unknown as Child
      }
    }
    return undefined
  }

  // Group slots by day_of_week (1=Mon through 6=Sat)
  const groupedSlots: Map<number, CrowdsourcedSlot[]> = new Map()
  for (const slot of slots) {
    const day = slot.day_of_week
    if (!groupedSlots.has(day)) groupedSlots.set(day, [])
    groupedSlots.get(day)!.push(slot)
  }

  // Days 1-6 (Mon-Sat), show days with slots + one row for days without
  const activeDays = [1, 2, 3, 4, 5, 6].filter(d => groupedSlots.has(d))
  const inactiveDays = [1, 2, 3, 4, 5, 6].filter(d => !groupedSlots.has(d))

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F5F5F7' }}>
        <div
          style={{
            background: '#fff',
            borderBottom: '1px solid #E8E8EC',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            onClick={() => navigate(-1)}
            style={{
              background: '#F5F5F7',
              border: 'none',
              borderRadius: 9,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: 18, color: '#555566' }} />
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div
            style={{
              width: 28,
              height: 28,
              border: '2px solid #EEEBfd',
              borderTopColor: '#7C6EE6',
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }}
          />
        </div>
      </div>
    )
  }

  if (!teacher) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F5F5F7' }}>
        <div
          style={{
            background: '#fff',
            borderBottom: '1px solid #E8E8EC',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            onClick={() => navigate(-1)}
            style={{
              background: '#F5F5F7',
              border: 'none',
              borderRadius: 9,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: 18, color: '#555566' }} />
          </button>
        </div>
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999AAA' }}>
          Teacher not found
        </div>
      </div>
    )
  }

  const color = teacherAvatarColor(teacher.id)
  const colorHex = CHILD_COLOR_HEX[color]
  const colorBg = CHILD_COLOR_BG[color]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F5F5F7' }}>
      {/* Header */}
      <div
        style={{
          background: '#fff',
          borderBottom: '1px solid #E8E8EC',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          onClick={() => navigate(-1)}
          style={{
            background: '#F5F5F7',
            border: 'none',
            borderRadius: 9,
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          aria-label="Back"
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 18, color: '#555566' }} />
        </button>
        <span
          style={{
            flex: 1,
            fontSize: 17,
            fontWeight: 700,
            color: '#1A1A2E',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {teacher.name}
        </span>
        <button
          onClick={handleSaveToggle}
          disabled={savingToggle}
          style={{
            background: 'none',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          aria-label={saved ? 'Unsave teacher' : 'Save teacher'}
        >
          <i
            className={saved ? 'ti ti-heart-filled' : 'ti ti-heart'}
            style={{ fontSize: 22, color: saved ? '#E24B4A' : '#999AAA' }}
          />
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* Hero */}
        <div
          style={{
            background: '#fff',
            borderRadius: 14,
            border: '1px solid #E8E8EC',
            padding: '20px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: colorBg,
              color: colorHex,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {getInitials(teacher.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1A1A2E' }}>{teacher.name}</div>
            <div style={{ fontSize: 14, color: '#555566', marginTop: 3 }}>
              {teacher.subject}
              {teacher.location ? ` · ${teacher.location}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
              <span style={{ fontSize: 12, color: '#555566' }}>
                <span style={{ fontWeight: 600, color: '#1A1A2E' }}>{teacher.favorites_count}</span> saved
              </span>
              <span style={{ fontSize: 12, color: '#555566' }}>
                <span style={{ fontWeight: 600, color: '#1A1A2E' }}>{teacher.active_students_count}</span> active
              </span>
              {teacher.claimed_by ? (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#26B99A',
                    background: '#E0F7F2',
                    borderRadius: 6,
                    padding: '2px 8px',
                  }}
                >
                  Claimed
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#7C6EE6',
                    background: '#DDD9FB',
                    borderRadius: 6,
                    padding: '2px 8px',
                  }}
                >
                  Community
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Invite to ActivityHub — trusted users only, unclaimed teachers with an email only */}
        {canManageTeachers && !teacher.claimed_by && teacher.email && (
          <div
            style={{
              background: '#fff',
              border: '1px solid #E8E8EC',
              borderRadius: 14,
              padding: '14px 16px',
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>
              Invite to ActivityHub
            </div>
            <div style={{ fontSize: 12, color: '#555566', marginBottom: 12, lineHeight: 1.5 }}>
              Send {teacher.name} a link so they can claim this profile and see their schedule.
            </div>

            {inviteLink ? (
              <div>
                <div
                  style={{
                    background: '#F5F5F7',
                    borderRadius: 9,
                    padding: '8px 12px',
                    fontSize: 12,
                    color: '#555566',
                    wordBreak: 'break-all',
                    marginBottom: 8,
                  }}
                >
                  {inviteLink}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleCopyInvite}
                    style={{
                      flex: 1,
                      background: inviteCopied ? '#E0F7F2' : '#EEEBfd',
                      color: inviteCopied ? '#26B99A' : '#7C6EE6',
                      border: 'none',
                      borderRadius: 9,
                      padding: '8px 12px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <i className={`ti ${inviteCopied ? 'ti-check' : 'ti-copy'}`} style={{ fontSize: 14 }} />
                    {inviteCopied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={handleGenerateInvite}
                    disabled={generatingInvite}
                    title="Generate a new link (invalidates the current one)"
                    style={{
                      background: '#F5F5F7',
                      color: '#555566',
                      border: '0.5px solid #E8E8EC',
                      borderRadius: 9,
                      padding: '8px 12px',
                      fontSize: 13,
                      cursor: generatingInvite ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <i className="ti ti-refresh" style={{ fontSize: 14 }} />
                  </button>
                  <button
                    onClick={handleCancelInvite}
                    disabled={cancellingInvite}
                    title="Cancel this invite link"
                    style={{
                      background: '#fff',
                      color: '#A32D2D',
                      border: '0.5px solid #F09595',
                      borderRadius: 9,
                      padding: '8px 12px',
                      fontSize: 13,
                      cursor: cancellingInvite ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <i className="ti ti-x" style={{ fontSize: 14 }} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleGenerateInvite}
                disabled={generatingInvite}
                style={{
                  background: generatingInvite ? '#E8E8EC' : '#7C6EE6',
                  color: generatingInvite ? '#999AAA' : '#fff',
                  border: 'none',
                  borderRadius: 9,
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: generatingInvite ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <i className="ti ti-send" style={{ fontSize: 14 }} />
                {generatingInvite ? 'Generating…' : 'Generate invite link'}
              </button>
            )}
          </div>
        )}

        {/* Claimed badge — teacher has joined */}
        {teacher.claimed_by && (
          <div
            style={{
              background: '#E0F7F2',
              border: '1px solid #26B99A',
              borderRadius: 12,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 12,
            }}
          >
            <i className="ti ti-circle-check" style={{ fontSize: 18, color: '#26B99A' }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1A8A73' }}>
              {teacher.name} has joined ActivityHub
            </div>
          </div>
        )}

        {/* Crowdsourced banner */}
        <div
          style={{
            background: '#FEF3DC',
            border: '1px solid #E8A838',
            borderRadius: 12,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            marginBottom: 16,
          }}
        >
          <i className="ti ti-users" style={{ fontSize: 18, color: '#E8A838', flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#B87A10' }}>Crowdsourced schedule</div>
            <div style={{ fontSize: 12, color: '#B87A10', marginTop: 3, lineHeight: 1.5 }}>
              This schedule is based on self-reported sessions from parents in the community.
              Times may not reflect the teacher's actual availability.
            </div>
          </div>
        </div>

        {/* Schedule section label */}
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#999AAA',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 10,
          }}
        >
          Reported weekly schedule
        </div>

        {/* Schedule grid */}
        <div
          style={{
            background: '#fff',
            borderRadius: 14,
            border: '1px solid #E8E8EC',
            overflow: 'hidden',
          }}
        >
          {slots.length === 0 ? (
            <div
              style={{
                padding: '28px 16px',
                textAlign: 'center',
                color: '#999AAA',
                fontSize: 14,
              }}
            >
              No sessions reported yet
            </div>
          ) : (
            <>
              {activeDays.map((day, dayIdx) => {
                const daySlots = groupedSlots.get(day)!
                return (
                  <div
                    key={day}
                    style={{
                      borderBottom: dayIdx < activeDays.length - 1 || inactiveDays.length > 0
                        ? '1px solid #E8E8EC'
                        : 'none',
                    }}
                  >
                    {/* Day label */}
                    <div
                      style={{
                        padding: '10px 16px 6px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#555566',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {DAY_FULL[day]}
                    </div>

                    {/* Slots */}
                    {daySlots.map((slot, slotIdx) => {
                      if (slot.is_yours) {
                        const child = findChildForSlot(slot)
                        const childColor = child ? getChildColor(child.display_order) : 'purple'
                        return (
                          <div
                            key={slotIdx}
                            style={{
                              padding: '8px 16px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              borderLeft: `3px solid ${CHILD_COLOR_HEX[childColor]}`,
                              marginLeft: 16,
                              marginRight: 16,
                              marginBottom: 6,
                              background: CHILD_COLOR_BG[childColor],
                              borderRadius: '0 9px 9px 0',
                            }}
                          >
                            <div
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: CHILD_COLOR_HEX[childColor],
                                flexShrink: 0,
                              }}
                            />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>
                                {formatTimeRange(slot.time_of_day)}
                              </div>
                              {child && (
                                <div style={{ fontSize: 12, color: '#555566', marginTop: 1 }}>
                                  {child.name} (you)
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      } else {
                        return (
                          <div
                            key={slotIdx}
                            style={{
                              padding: '8px 16px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              marginLeft: 16,
                              marginRight: 16,
                              marginBottom: 6,
                              background: '#F5F5F7',
                              borderRadius: 9,
                            }}
                          >
                            <div
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: '#D8D8DC',
                                flexShrink: 0,
                              }}
                            />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>
                                {formatTimeRange(slot.time_of_day)}
                              </div>
                              <div style={{ fontSize: 12, color: '#999AAA', marginTop: 1 }}>
                                {slot.student_count === 1
                                  ? 'Another student'
                                  : `${slot.student_count} students`}
                              </div>
                            </div>
                          </div>
                        )
                      }
                    })}
                    <div style={{ height: 6 }} />
                  </div>
                )
              })}

              {/* Inactive days row */}
              {inactiveDays.length > 0 && (
                <div style={{ padding: '12px 16px' }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#999AAA',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      marginBottom: 8,
                    }}
                  >
                    {inactiveDays.map(d => DAY_FULL[d]).join(', ')}
                  </div>
                  <div
                    style={{
                      border: '1.5px dashed #D8D8DC',
                      borderRadius: 9,
                      padding: '10px 14px',
                      fontSize: 13,
                      color: '#999AAA',
                    }}
                  >
                    No sessions reported
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {/* Bottom padding */}
        <div style={{ height: 20 }} />
      </div>
    </div>
  )
}
