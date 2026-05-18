import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import {
  getSavedTeachers,
  searchTeachers,
  saveTeacher,
  unsaveTeacher,
  createTeacher,
  updateTeacher,
  findTeacherByContact,
} from '../lib/db/teachers'
import type { Teacher, Child, Session, UserTeacher } from '../types'
import {
  CHILD_COLORS,
  CHILD_COLOR_HEX,
  CHILD_COLOR_BG,
  getChildColor,
  getInitials,
} from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ChildColor = 'purple' | 'teal' | 'coral' | 'amber'

function teacherAvatarColor(id: string): ChildColor {
  const n = id.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  return CHILD_COLORS[n % 4]
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface ChildChip {
  child: Child
  daysLabel: string
}

// ─── TeacherCard ──────────────────────────────────────────────────────────────

interface TeacherCardProps {
  teacher: Teacher
  childChips: ChildChip[]
  hasConflict: boolean
  isSaved: boolean
  onSaveToggle: (id: string, save: boolean) => void
  onClick: () => void
  onEdit?: (t: Teacher) => void
}

export function TeacherCard({
  teacher,
  childChips,
  hasConflict,
  isSaved,
  onSaveToggle,
  onClick,
  onEdit,
}: TeacherCardProps) {
  const color = teacherAvatarColor(teacher.id)
  const colorHex = CHILD_COLOR_HEX[color]
  const colorBg = CHILD_COLOR_BG[color]

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        border: '1px solid #E8E8EC',
        marginBottom: 12,
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      {/* Top row */}
      <div
        style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'flex-start', gap: 12 }}
        onClick={onClick}
      >
        {/* Avatar */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: colorBg,
            color: colorHex,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {getInitials(teacher.name)}
        </div>

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: '#1A1A2E',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {teacher.name}
            </span>
            {teacher.claimed_by ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#26B99A',
                  background: '#E0F7F2',
                  borderRadius: 6,
                  padding: '2px 7px',
                  flexShrink: 0,
                }}
              >
                Claimed
              </span>
            ) : (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#7C6EE6',
                  background: '#DDD9FB',
                  borderRadius: 6,
                  padding: '2px 7px',
                  flexShrink: 0,
                }}
              >
                Community
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: '#555566', marginTop: 2 }}>
            {teacher.subject}
            {teacher.location ? ` · ${teacher.location}` : ''}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {onEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(teacher) }}
              style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}
              aria-label="Edit teacher"
            >
              <i className="ti ti-pencil" style={{ fontSize: 17, color: '#999AAA' }} />
            </button>
          )}
          <button
            onClick={e => {
              e.stopPropagation()
              onSaveToggle(teacher.id, !isSaved)
            }}
            style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}
            aria-label={isSaved ? 'Unsave teacher' : 'Save teacher'}
          >
            <i
              className={isSaved ? 'ti ti-heart-filled' : 'ti ti-heart'}
              style={{ fontSize: 20, color: isSaved ? '#E24B4A' : '#999AAA' }}
            />
          </button>
        </div>
      </div>

      {/* Chips row */}
      {(childChips.length > 0 || hasConflict) && (
        <div
          style={{
            padding: '0 14px 10px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
          onClick={onClick}
        >
          {childChips.map(chip => {
            const childColor = getChildColor(chip.child.display_order)
            return (
              <span
                key={chip.child.id}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: CHILD_COLOR_HEX[childColor],
                  background: CHILD_COLOR_BG[childColor],
                  borderRadius: 9,
                  padding: '3px 9px',
                }}
              >
                {chip.child.name} · {chip.daysLabel}
              </span>
            )
          })}
          {hasConflict && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: '#B87A10',
                background: '#FEF8EC',
                border: '1px solid #E8A838',
                borderRadius: 9,
                padding: '3px 9px',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <i className="ti ti-alert-triangle" style={{ fontSize: 12 }} />
              Another student also logged this time
            </span>
          )}
        </div>
      )}

      {/* Footer row */}
      <div
        onClick={onClick}
        style={{
          borderTop: '1px solid #F5F5F7',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: 14 }}>
          <span style={{ fontSize: 12, color: '#555566' }}>
            <span style={{ fontWeight: 600, color: '#1A1A2E' }}>{teacher.favorites_count}</span> saved
          </span>
          <span style={{ fontSize: 12, color: '#555566' }}>
            <span style={{ fontWeight: 600, color: '#1A1A2E' }}>{teacher.active_students_count}</span> active
          </span>
        </div>
        <i className="ti ti-chevron-right" style={{ fontSize: 18, color: '#999AAA' }} />
      </div>
    </div>
  )
}

// ─── DiscoverOverlay ──────────────────────────────────────────────────────────

interface DiscoverOverlayProps {
  savedTeacherIds: Set<string>
  onSaveToggle: (id: string, save: boolean) => void
  onClose: () => void
  onNavigate: (id: string) => void
  canManageTeachers: boolean
  onTeacherCreated: () => void
  initialEditId?: string
}

interface TeacherForm {
  name: string; subject: string; location: string; email: string; phone: string
}
const emptyForm = (): TeacherForm => ({ name: '', subject: '', location: '', email: '', phone: '' })

export function DiscoverOverlay({
  savedTeacherIds,
  onSaveToggle,
  onClose,
  onNavigate,
  canManageTeachers,
  onTeacherCreated,
  initialEditId,
}: DiscoverOverlayProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Edit form
  const [editId, setEditId]     = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TeacherForm>(emptyForm())
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const doSearch = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const data = await searchTeachers(q)
      setResults(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  async function handleEdit() {
    if (!editId || !editForm.name.trim() || !editForm.subject.trim()) return
    setEditSaving(true); setEditError(null)
    try {
      const updated = await updateTeacher(editId, {
        name: editForm.name.trim(), subject: editForm.subject.trim(),
        location: editForm.location.trim() || null,
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
      })
      setResults(prev => prev.map(t => t.id === editId ? updated : t))
      setEditId(null)
      onTeacherCreated()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update teacher.')
    } finally {
      setEditSaving(false)
    }
  }

  function startEdit(t: Teacher) {
    setEditId(t.id)
    setEditForm({ name: t.name, subject: t.subject, location: t.location ?? '',
      email: t.email ?? '', phone: t.phone ?? '' })
  }

  useEffect(() => {
    doSearch('').then(() => {
      if (initialEditId) {
        setResults(prev => {
          const t = prev.find(r => r.id === initialEditId)
          if (t) startEdit(t)
          return prev
        })
      }
    })
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [doSearch, initialEditId])

  const handleQueryChange = (val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 300)
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 16px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid #E8E8EC',
          paddingBottom: 14,
        }}
      >
        <button
          onClick={onClose}
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
          aria-label="Close"
        >
          <i className="ti ti-x" style={{ fontSize: 18, color: '#555566' }} />
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, color: '#1A1A2E' }}>Find a teacher</span>
      </div>

      {/* Search input */}
      <div style={{ padding: '12px 16px 8px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: '#F5F5F7',
            borderRadius: 12,
            padding: '0 12px',
            gap: 8,
          }}
        >
          <i className="ti ti-search" style={{ fontSize: 18, color: '#999AAA' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="Name or subject…"
            style={{
              flex: 1,
              border: 'none',
              background: 'none',
              outline: 'none',
              fontSize: 15,
              color: '#1A1A2E',
              padding: '11px 0',
            }}
          />
          {query && (
            <button
              onClick={() => handleQueryChange('')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <i className="ti ti-x" style={{ fontSize: 16, color: '#999AAA' }} />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 0' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
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
        ) : results.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#999AAA', fontSize: 14 }}>
            No teachers found
          </div>
        ) : (
          results.map(teacher => (
            <div key={teacher.id}>
              {editId === teacher.id ? (
                <InlineTeacherForm
                  form={editForm}
                  onChange={setEditForm}
                  onSave={handleEdit}
                  onCancel={() => { setEditId(null); setEditError(null) }}
                  saving={editSaving}
                  title={`Edit ${teacher.name}`}
                  error={editError}
                />
              ) : (
                <TeacherCard
                  teacher={teacher}
                  childChips={[]}
                  hasConflict={false}
                  isSaved={savedTeacherIds.has(teacher.id)}
                  onSaveToggle={onSaveToggle}
                  onClick={() => onNavigate(teacher.id)}
                  onEdit={canManageTeachers ? startEdit : undefined}
                />
              )}
            </div>
          ))
        )}
      </div>

    </div>
  )
}

// ─── TeachersPage ─────────────────────────────────────────────────────────────

export function TeachersPage() {
  const { user, effectiveUserId, canManageTeachers } = useAuth()
  const uid = effectiveUserId ?? user?.id ?? ''
  const navigate = useNavigate()

  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm]         = useState<TeacherForm>(emptyForm())
  const [addSaving, setAddSaving]     = useState(false)
  const [addError, setAddError]       = useState<string | null>(null)

  const [savedTeachers, setSavedTeachers] = useState<UserTeacher[]>([])
  const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([])
  const [conflictMap, setConflictMap] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [showDiscover, setShowDiscover] = useState(false)
  const [discoverInitialEditId, setDiscoverInitialEditId] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)

  // Load data on mount
  useEffect(() => {
    if (!user) return
    loadData()
  }, [user])

  async function loadData() {
    if (!user) return
    setLoading(true)
    try {
      const now = new Date()
      const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
      const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

      const [savedData, sessionsResult] = await Promise.all([
        getSavedTeachers(uid),
        supabase
          .from('sessions')
          .select(
            'id, teacher_id, child_id, starts_at, ends_at, child:children(id, name, display_order, user_id, date_of_birth, avatar_url, created_at, updated_at)'
          )
          .eq('user_id', uid)
          .eq('status', 'scheduled')
          .gte('starts_at', now.toISOString())
          .lte('starts_at', in90.toISOString()),
      ])

      setSavedTeachers(savedData)

      const sessions = (sessionsResult.data ?? []) as unknown as Session[]
      setUpcomingSessions(sessions)

      // Check conflicts for sessions in next 14 days
      const near = sessions.filter(s => new Date(s.starts_at) <= in14)
      const teacherIdsToCheck = [...new Set(near.map(s => s.teacher_id).filter((id): id is string => id !== null))]
      const conflicts: Record<string, boolean> = {}

      await Promise.all(
        teacherIdsToCheck.map(async tid => {
          const teacherSessions = near.filter(s => s.teacher_id === tid && s.teacher_id !== null)
          for (const sess of teacherSessions) {
            const { data } = await supabase.rpc('check_session_conflict', {
              p_teacher_id: tid,
              p_starts_at: sess.starts_at,
              p_ends_at: sess.ends_at,
              p_user_id: uid,
            })
            const result = data?.[0]
            if (result?.has_conflict) {
              conflicts[tid] = true
              break
            }
          }
        })
      )
      setConflictMap(conflicts)
    } catch (err) {
      console.error('Failed to load teachers data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Derive child chips per teacher
  function getChildChips(teacherId: string): ChildChip[] {
    const teacherSessions = upcomingSessions.filter(s => s.teacher_id === teacherId)
    const childMap = new Map<string, { child: Child; days: Set<number> }>()
    for (const sess of teacherSessions) {
      const child = sess.child as unknown as Child
      if (!child) continue
      if (!childMap.has(child.id)) childMap.set(child.id, { child, days: new Set() })
      childMap.get(child.id)!.days.add(new Date(sess.starts_at).getDay())
    }
    return Array.from(childMap.values()).map(({ child, days }) => {
      const sortedDays = [...days].sort()
      const daysLabel = sortedDays.map(d => DAY_SHORT[d]).join(' & ')
      return { child, daysLabel }
    })
  }

  const savedTeacherIds = new Set(savedTeachers.map(ut => ut.teacher_id))

  async function handleSaveToggle(teacherId: string, save: boolean) {
    if (!user) return
    if (save) {
      await saveTeacher(uid, teacherId)
      const fresh = await getSavedTeachers(uid)
      setSavedTeachers(fresh)
    } else {
      await unsaveTeacher(uid, teacherId)
      setSavedTeachers(prev => prev.filter(ut => ut.teacher_id !== teacherId))
    }
  }

  async function handleAddTeacher() {
    if (!user || !addForm.name.trim() || !addForm.subject.trim()) return
    setAddSaving(true); setAddError(null)
    try {
      const email = addForm.email.trim() || undefined
      const phone = addForm.phone.trim() || undefined
      const dupe = await findTeacherByContact(email, phone)
      if (dupe) {
        setAddError(`"${dupe.teacher.name}" already uses this ${dupe.field} — search for them in Find a new teacher.`)
        return
      }
      const teacher = await createTeacher(user.id, {
        name: addForm.name.trim(), subject: addForm.subject.trim(),
        location: addForm.location.trim() || undefined,
        email, phone,
      })
      await saveTeacher(uid, teacher.id)
      setAddForm(emptyForm()); setShowAddForm(false)
      loadData()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add teacher.')
    } finally {
      setAddSaving(false)
    }
  }

  const filteredTeachers = savedTeachers.filter(ut => {
    const t = ut.teacher
    if (!t) return false
    const q = searchQuery.toLowerCase()
    return (
      t.name.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      (t.location ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F5F5F7' }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '20px 16px 0', borderBottom: '1px solid #E8E8EC' }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>
          Teachers
        </h1>

        {/* Search bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: '#F5F5F7',
            borderRadius: 12,
            padding: '0 12px',
            gap: 8,
            marginTop: 12,
            marginBottom: 14,
          }}
        >
          <i className="ti ti-search" style={{ fontSize: 18, color: '#999AAA' }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search my teachers…"
            style={{
              flex: 1,
              border: 'none',
              background: 'none',
              outline: 'none',
              fontSize: 15,
              color: '#1A1A2E',
              padding: '11px 0',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <i className="ti ti-x" style={{ fontSize: 16, color: '#999AAA' }} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        {/* Find a new teacher */}
        <button
          onClick={() => setShowDiscover(true)}
          style={{
            width: '100%',
            background: '#7C6EE6',
            border: 'none',
            borderRadius: 14,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
            marginBottom: 10,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              background: 'rgba(255,255,255,0.18)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <i className="ti ti-compass" style={{ fontSize: 20, color: '#fff' }} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Find a new teacher</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
              Browse the community directory
            </div>
          </div>
          <i className="ti ti-chevron-right" style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)' }} />
        </button>

        {/* Add teacher — trusted users only */}
        {canManageTeachers && (
          <button
            onClick={() => { setShowAddForm(f => !f); setAddError(null) }}
            style={{
              width: '100%',
              background: showAddForm ? '#EEEBfd' : '#fff',
              border: `1px ${showAddForm ? 'solid' : 'dashed'} #7C6EE6`,
              borderRadius: 14,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              marginBottom: showAddForm ? 10 : 20,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                background: '#EEEBfd',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <i className="ti ti-plus" style={{ fontSize: 20, color: '#7C6EE6' }} />
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#7C6EE6' }}>Add new teacher</div>
              <div style={{ fontSize: 12, color: '#999AAA', marginTop: 2 }}>
                Create a new profile in the directory
              </div>
            </div>
            <i className="ti ti-chevron-right" style={{ fontSize: 18, color: '#7C6EE6', opacity: 0.5 }} />
          </button>
        )}

        {/* Add teacher inline form */}
        {canManageTeachers && showAddForm && (
          <div style={{ marginBottom: 20 }}>
            <InlineTeacherForm
              form={addForm}
              onChange={setAddForm}
              onSave={handleAddTeacher}
              onCancel={() => { setShowAddForm(false); setAddForm(emptyForm()); setAddError(null) }}
              saving={addSaving}
              title="New teacher"
              error={addError}
            />
          </div>
        )}

        {/* Can't find teacher */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#F5F5F7',
            border: '1px solid #E8E8EC',
            borderRadius: 14,
            padding: '12px 14px',
            marginBottom: 20,
          }}
        >
          <i className="ti ti-info-circle" style={{ fontSize: 16, color: '#999AAA', flexShrink: 0 }} />
          <p style={{ fontSize: 12, lineHeight: 1.5, color: '#555566', margin: 0 }}>
            Can't find your teacher?{' '}
            <a
              href="mailto:support@edgewaterland.com?subject=ActivityHub%20-%20New%20Teacher%20Request"
              style={{ color: '#7C6EE6', fontWeight: 500 }}
            >
              Let us know
            </a>{' '}
            and we'll add them to the directory.
          </p>
        </div>

        {/* My teachers section */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
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
        ) : (
          <>
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
              My teachers
            </div>

            {filteredTeachers.length === 0 ? (
              <div
                style={{
                  background: '#fff',
                  borderRadius: 14,
                  border: '1px solid #E8E8EC',
                  padding: '32px 20px',
                  textAlign: 'center',
                }}
              >
                <i className="ti ti-users" style={{ fontSize: 32, color: '#DDD9FB' }} />
                <div style={{ marginTop: 10, fontSize: 15, fontWeight: 600, color: '#1A1A2E' }}>
                  {searchQuery ? 'No teachers match your search' : 'No saved teachers yet'}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: '#999AAA' }}>
                  {searchQuery
                    ? 'Try a different search term'
                    : 'Use "Find a new teacher" to discover teachers in your community'}
                </div>
              </div>
            ) : (
              filteredTeachers.map(ut => {
                const teacher = ut.teacher!
                return (
                  <TeacherCard
                    key={teacher.id}
                    teacher={teacher}
                    childChips={getChildChips(teacher.id)}
                    hasConflict={!!conflictMap[teacher.id]}
                    isSaved
                    onSaveToggle={handleSaveToggle}
                    onClick={() => navigate(`/teachers/${teacher.id}`)}
                    onEdit={canManageTeachers ? t => {
                      setDiscoverInitialEditId(t.id)
                      setShowDiscover(true)
                    } : undefined}
                  />
                )
              })
            )}
          </>
        )}
      </div>

      {/* Discover overlay */}
      {showDiscover && (
        <DiscoverOverlay
          savedTeacherIds={savedTeacherIds}
          onSaveToggle={handleSaveToggle}
          onClose={() => { setShowDiscover(false); setDiscoverInitialEditId(undefined) }}
          onNavigate={id => {
            setShowDiscover(false)
            setDiscoverInitialEditId(undefined)
            navigate(`/teachers/${id}`)
          }}
          canManageTeachers={canManageTeachers}
          onTeacherCreated={loadData}
          initialEditId={discoverInitialEditId}
        />
      )}
    </div>
  )
}

// ─── InlineTeacherForm ────────────────────────────────────────────────────────

interface InlineTeacherFormProps {
  form: TeacherForm
  onChange: (f: TeacherForm) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  title: string
  error?: string | null
}

function InlineTeacherForm({ form, onChange, onSave, onCancel, saving, title, error }: InlineTeacherFormProps) {
  const canSave = !!form.name.trim() && !!form.subject.trim()

  return (
    <div style={{ background: '#F5F5F7', border: '0.5px solid #E8E8EC', borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#555566', marginBottom: 10 }}>{title}</div>
      {(['name', 'subject', 'location', 'email', 'phone'] as const).map(key => (
        <input
          key={key}
          type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
          placeholder={
            key === 'name' ? 'Teacher name *' :
            key === 'subject' ? 'Subject (e.g. Piano) *' :
            key === 'location' ? 'Location (optional)' :
            key === 'email' ? 'Email (optional)' : 'Phone (optional)'
          }
          value={form[key] as string}
          onChange={e => onChange({ ...form, [key]: e.target.value })}
          style={{ display: 'block', width: '100%', boxSizing: 'border-box', fontSize: 14,
            borderRadius: 9, padding: '9px 12px', marginBottom: 8, outline: 'none',
            background: '#fff', border: '0.5px solid #E8E8EC', color: '#1A1A2E', fontFamily: 'inherit' }}
        />
      ))}
      {error && (
        <div style={{ fontSize: 12, color: '#E86B5F', marginBottom: 10, lineHeight: 1.4 }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onCancel}
          style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '0.5px solid #E8E8EC',
            background: '#fff', fontSize: 14, color: '#555566', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!canSave || saving}
          style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
            background: canSave ? '#7C6EE6' : '#D8D8DC',
            color: canSave ? '#fff' : '#999AAA',
            fontSize: 14, fontWeight: 600, cursor: canSave ? 'pointer' : 'default' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
