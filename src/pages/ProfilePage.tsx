import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { getChildren, createChild, updateChild, deleteChild } from '../lib/db/children'
import {
  createInvitation, getMyInvitations, deleteInvitation,
  getLinkedUsers, getMyLink, revokeLink, disconnectSelf,
  type InvitationRow, type LinkedUser,
} from '../lib/db/sharing'
import { updateClaimedTeacherProfile } from '../lib/db/teachers'
import {
  getChildColor, CHILD_COLOR_HEX, CHILD_COLOR_BG, getInitials, getAge,
} from '../types'
import type { Child } from '../types'

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="relative w-11 h-6 rounded-full flex-shrink-0"
      style={{ background: on ? '#7C6EE6' : '#D8D8DC' }}
    >
      <div
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200"
        style={{ left: on ? '22px' : '2px' }}
      />
    </button>
  )
}

// ─── ProfilePage ──────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { user, effectiveUserId, claimedTeacher, refreshTeacherClaim, refreshLinks, signOut } = useAuth()
  const isLinkedUser = !!user && !!effectiveUserId && effectiveUserId !== user.id

  // ── Children ────────────────────────────────────────────────────────────────
  const [children, setChildren]           = useState<Child[]>([])
  const [editingChildId, setEditingChildId] = useState<string | null>(null) // child id or 'new'
  const [childName, setChildName]         = useState('')
  const [childDob, setChildDob]           = useState('')
  const [savingChild, setSavingChild]     = useState(false)

  // ── Profile editing ─────────────────────────────────────────────────────────
  const [displayName, setDisplayName]     = useState(user?.full_name ?? '')
  const [editingName, setEditingName]     = useState(false)
  const [nameInput, setNameInput]         = useState('')
  const [savingName, setSavingName]       = useState(false)

  // ── Notifications (localStorage) ────────────────────────────────────────────
  const [notifSession,  setNotifSession]  = useState(() => localStorage.getItem('notif_session')  !== 'false')
  const [notifPayment,  setNotifPayment]  = useState(() => localStorage.getItem('notif_payment')  !== 'false')

  // ── Avatar upload ────────────────────────────────────────────────────────────
  const [userAvatarUrl, setUserAvatarUrl]         = useState<string | null>(user?.avatar_url ?? null)
  const [uploadingUserAvatar, setUploadingUserAvatar] = useState(false)
  const [uploadingChildAvatarId, setUploadingChildAvatarId] = useState<string | null>(null)
  const userFileInputRef  = useRef<HTMLInputElement>(null)
  const childFileInputRef = useRef<HTMLInputElement>(null)
  const childUploadTargetRef = useRef<string | null>(null)

  // ── Sharing ──────────────────────────────────────────────────────────────────
  const [invitations, setInvitations]   = useState<InvitationRow[]>([])
  const [linkedUsers, setLinkedUsers]   = useState<LinkedUser[]>([])
  const [myLink, setMyLink]             = useState<{ primary_user_id: string; primary_user_name: string | null; primary_user_email: string } | null>(null)
  const [generatedLink, setGeneratedLink]   = useState<{ id: string; url: string } | null>(null)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [generateError, setGenerateError]   = useState<string | null>(null)
  const [linkCopied, setLinkCopied]         = useState(false)
  const [disconnecting, setDisconnecting]   = useState(false)

  // ── Teacher profile editing ───────────────────────────────────────────────────
  const [editingTeacher, setEditingTeacher] = useState(false)
  const [teacherForm, setTeacherForm] = useState({
    name: claimedTeacher?.name ?? '',
    subject: claimedTeacher?.subject ?? '',
    location: claimedTeacher?.location ?? '',
    email: claimedTeacher?.email ?? '',
    phone: claimedTeacher?.phone ?? '',
  })
  const [savingTeacher, setSavingTeacher] = useState(false)
  const [teacherSaveError, setTeacherSaveError] = useState<string | null>(null)

  // ── Sign out ─────────────────────────────────────────────────────────────────
  const [signingOut, setSigningOut] = useState(false)

  // ── Load ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return
    getChildren(effectiveUserId ?? user.id).then(setChildren).catch(console.error)
    setDisplayName(user.full_name ?? '')
    setUserAvatarUrl(user.avatar_url ?? null)

    if (isLinkedUser) {
      // Linked user: show who they're connected to
      getMyLink(user.id).then(setMyLink).catch(console.error)
    } else {
      // Primary user: show who's linked to them + pending invitations
      getLinkedUsers(user.id).then(setLinkedUsers).catch(console.error)
      getMyInvitations(user.id).then(setInvitations).catch(console.error)
    }
  }, [user, effectiveUserId, isLinkedUser])

  useEffect(() => { localStorage.setItem('notif_session',  String(notifSession))  }, [notifSession])
  useEffect(() => { localStorage.setItem('notif_payment',  String(notifPayment))  }, [notifPayment])

  // ── Sharing handlers ─────────────────────────────────────────────────────────

  async function handleGenerateLink() {
    if (!user) return
    setGeneratingLink(true)
    setGenerateError(null)
    try {
      const existing = await getMyInvitations(user.id)
      await Promise.all(existing.filter(inv => inv.invitation_type === 'partner').map(inv => deleteInvitation(inv.id)))

      const { id, token } = await createInvitation(user.id)
      const url = `${window.location.origin}/join/${token}`
      setGeneratedLink({ id, url })
      setInvitations([])
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate link')
      console.error(err)
    } finally {
      setGeneratingLink(false)
    }
  }

  async function handleCopyLink(url: string) {
    await navigator.clipboard.writeText(url)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  async function handleCancelInvitation(id: string) {
    try {
      await deleteInvitation(id)
      setInvitations(prev => prev.filter(i => i.id !== id))
      if (generatedLink?.id === id) setGeneratedLink(null)
    } catch (err) {
      console.error('Cancel failed:', err)
      // Re-sync from DB so the UI reflects actual state
      if (user) getMyInvitations(user.id).then(setInvitations).catch(console.error)
    }
  }

  async function handleRevoke(linkedUserId: string) {
    if (!user) return
    await revokeLink(user.id, linkedUserId)
    setLinkedUsers(prev => prev.filter(u => u.linked_user_id !== linkedUserId))
  }

  async function handleDisconnect() {
    if (!user) return
    setDisconnecting(true)
    try {
      await disconnectSelf(user.id)
      await refreshLinks()
      setMyLink(null)
      // Reload children under own account
      getChildren(user.id).then(setChildren).catch(console.error)
    } catch (err) {
      console.error(err)
    } finally {
      setDisconnecting(false)
    }
  }

  // ── Avatar upload helpers ────────────────────────────────────────────────────

  async function uploadAvatarFile(storagePath: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${storagePath}.${ext}`
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error) throw error
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    return `${data.publicUrl}?t=${Date.now()}`
  }

  async function handleUserAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploadingUserAvatar(true)
    try {
      const url = await uploadAvatarFile(`${user.id}/user`, file)
      await supabase
        .from('users')
        .update({ avatar_url: url, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      setUserAvatarUrl(url)
    } catch (err) {
      console.error(err)
    } finally {
      setUploadingUserAvatar(false)
      e.target.value = ''
    }
  }

  async function handleChildFileInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const childId = childUploadTargetRef.current
    if (!file || !childId || !user) return
    setUploadingChildAvatarId(childId)
    try {
      const url = await uploadAvatarFile(`${user.id}/child-${childId}`, file)
      const updated = await updateChild(childId, { avatar_url: url })
      setChildren(prev => prev.map(c => c.id === childId ? updated : c))
    } catch (err) {
      console.error(err)
    } finally {
      setUploadingChildAvatarId(null)
      childUploadTargetRef.current = null
      e.target.value = ''
    }
  }

  function openChildAvatarPicker(childId: string) {
    childUploadTargetRef.current = childId
    childFileInputRef.current?.click()
  }

  // ── Child handlers ───────────────────────────────────────────────────────────

  function openAddChild() {
    setEditingChildId('new')
    setChildName('')
    setChildDob('')
  }

  function openEditChild(child: Child) {
    setEditingChildId(child.id)
    setChildName(child.name)
    setChildDob(child.date_of_birth ?? '')
  }

  function cancelEditChild() {
    setEditingChildId(null)
    setChildName('')
    setChildDob('')
  }

  async function handleSaveChild() {
    if (!user || !childName.trim()) return
    setSavingChild(true)
    try {
      if (editingChildId === 'new') {
        const child = await createChild(user.id, {
          name:          childName.trim(),
          date_of_birth: childDob || undefined,
        })
        setChildren(prev => [...prev, child])
      } else {
        const updated = await updateChild(editingChildId!, {
          name:          childName.trim(),
          date_of_birth: childDob || undefined,
        })
        setChildren(prev => prev.map(c => c.id === updated.id ? updated : c))
      }
      cancelEditChild()
    } catch (err) {
      console.error(err)
    } finally {
      setSavingChild(false)
    }
  }

  async function handleDeleteChild(id: string) {
    try {
      await deleteChild(id)
      setChildren(prev => prev.filter(c => c.id !== id))
      if (editingChildId === id) cancelEditChild()
    } catch (err) {
      console.error(err)
    }
  }

  // ── Profile name handlers ────────────────────────────────────────────────────

  function openEditName() {
    setNameInput(displayName)
    setEditingName(true)
  }

  async function handleSaveName() {
    if (!user || !nameInput.trim()) return
    setSavingName(true)
    try {
      await supabase
        .from('users')
        .update({ full_name: nameInput.trim(), updated_at: new Date().toISOString() })
        .eq('id', user.id)
      setDisplayName(nameInput.trim())
      setEditingName(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSavingName(false)
    }
  }

  // ── Teacher profile save ──────────────────────────────────────────────────────

  async function handleSaveTeacherProfile() {
    if (!teacherForm.name.trim() || !teacherForm.subject.trim()) return
    setSavingTeacher(true)
    setTeacherSaveError(null)
    try {
      await updateClaimedTeacherProfile(teacherForm)
      await refreshTeacherClaim()
      setEditingTeacher(false)
    } catch (err) {
      setTeacherSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingTeacher(false)
    }
  }

  // ── Sign out ──────────────────────────────────────────────────────────────────

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      setSigningOut(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const initials = displayName
    ? getInitials(displayName)
    : (user?.email?.[0] ?? '?').toUpperCase()

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div
        className="px-5 pt-4 pb-3 flex-shrink-0"
        style={{ borderBottom: '0.5px solid #E8E8EC' }}
      >
        <div className="font-serif text-[22px] leading-tight" style={{ color: '#1A1A2E' }}>
          Profile
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pb-6">

        {/* User hero */}
        <div className="px-5 pt-4 pb-1">
          <div
            className="flex items-center gap-3.5 p-3.5 rounded-[14px]"
            style={{ background: '#F5F5F7' }}
          >
            <div className="relative flex-shrink-0">
              <div
                className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-base font-bold"
                style={userAvatarUrl ? {} : { background: '#EEEBfd', color: '#7C6EE6' }}
              >
                {userAvatarUrl
                  ? <img src={userAvatarUrl} alt="" className="w-full h-full object-cover" />
                  : initials
                }
              </div>
              <button
                onClick={() => userFileInputRef.current?.click()}
                disabled={uploadingUserAvatar}
                className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: '#7C6EE6', border: '2px solid #F5F5F7' }}
              >
                {uploadingUserAvatar
                  ? <div className="w-2 h-2 rounded-full border border-white border-t-transparent animate-spin" />
                  : <i className="ti ti-camera" style={{ fontSize: 9, color: '#fff' }} />
                }
              </button>
              <input
                ref={userFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUserAvatarChange}
              />
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex gap-2 items-center">
                  <input
                    autoFocus
                    className="flex-1 text-sm rounded-[8px] px-2.5 py-1.5 outline-none"
                    style={{ background: '#fff', border: '0.5px solid #7C6EE6', color: '#1A1A2E' }}
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={!nameInput.trim() || savingName}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-[8px]"
                    style={{ background: '#7C6EE6', color: '#fff' }}
                  >
                    {savingName ? '…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="text-xs px-2 py-1.5 rounded-[8px]"
                    style={{ color: '#999AAA' }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-[15px] font-semibold truncate" style={{ color: '#1A1A2E' }}>
                    {displayName || 'Add your name'}
                  </div>
                  <div className="text-[12px] mt-0.5 truncate" style={{ color: '#555566' }}>
                    {user?.email}
                  </div>
                </>
              )}
            </div>
            {!editingName && (
              <button
                onClick={openEditName}
                className="w-8 h-8 flex items-center justify-center rounded-[9px] flex-shrink-0"
                style={{ background: '#fff', border: '0.5px solid #E8E8EC' }}
              >
                <i className="ti ti-pencil" style={{ fontSize: 14, color: '#555566' }} />
              </button>
            )}
          </div>
        </div>

        {!claimedTeacher && <>{/* My children */}
        <div
          className="px-5 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: '#999AAA' }}
        >
          My children
        </div>
        <div className="px-5">
          <div className="rounded-[14px] overflow-hidden" style={{ border: '0.5px solid #E8E8EC' }}>
            {children.map((child, i) => {
              const color   = getChildColor(child.display_order)
              const hex     = CHILD_COLOR_HEX[color]
              const bg      = CHILD_COLOR_BG[color]
              const editing = editingChildId === child.id

              return (
                <div
                  key={child.id}
                  style={{ borderTop: i > 0 ? '0.5px solid #E8E8EC' : 'none' }}
                >
                  {/* Child row */}
                  <button
                    onClick={() => editing ? cancelEditChild() : openEditChild(child)}
                    className="w-full flex items-center gap-3 px-3.5 py-3"
                    style={{ background: editing ? '#F5F5F7' : '#fff' }}
                  >
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold"
                        style={child.avatar_url ? {} : { background: bg, color: hex }}
                      >
                        {child.avatar_url
                          ? <img src={child.avatar_url} alt="" className="w-full h-full object-cover" />
                          : getInitials(child.name)
                        }
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); openChildAvatarPicker(child.id) }}
                        disabled={uploadingChildAvatarId === child.id}
                        className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: '#7C6EE6', border: '2px solid #fff' }}
                      >
                        {uploadingChildAvatarId === child.id
                          ? <div className="w-1.5 h-1.5 rounded-full border border-white border-t-transparent animate-spin" />
                          : <i className="ti ti-camera" style={{ fontSize: 7, color: '#fff' }} />
                        }
                      </button>
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-[13px] font-medium" style={{ color: '#1A1A2E' }}>
                        {child.name}
                      </div>
                    </div>
                    {child.date_of_birth && (
                      <span className="text-[11px] mr-1" style={{ color: '#999AAA' }}>
                        Age {getAge(child.date_of_birth)}
                      </span>
                    )}
                    <i
                      className="ti ti-chevron-right"
                      style={{
                        fontSize: 15,
                        color: '#999AAA',
                        transform: editing ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.2s',
                      }}
                    />
                  </button>

                  {/* Inline edit form */}
                  {editing && (
                    <div
                      className="px-3.5 pb-3.5"
                      style={{ background: '#F5F5F7' }}
                    >
                      <input
                        autoFocus
                        className="w-full text-sm rounded-[9px] px-3 py-2 mb-2 outline-none"
                        style={{ background: '#fff', border: '0.5px solid #E8E8EC', color: '#1A1A2E' }}
                        placeholder="Child's name *"
                        value={childName}
                        onChange={e => setChildName(e.target.value)}
                      />
                      <label className="text-xs mb-1 block" style={{ color: '#999AAA' }}>
                        Date of birth (optional)
                      </label>
                      <input
                        type="date"
                        className="w-full text-sm rounded-[9px] px-3 py-2 mb-3 outline-none"
                        style={{ background: '#fff', border: '0.5px solid #E8E8EC', color: '#1A1A2E' }}
                        value={childDob}
                        max={new Date().toISOString().split('T')[0]}
                        onChange={e => setChildDob(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDeleteChild(child.id)}
                          className="py-2 px-3 rounded-[9px] text-xs font-medium"
                          style={{ border: '0.5px solid #F09595', color: '#A32D2D' }}
                        >
                          Remove
                        </button>
                        <div className="flex-1" />
                        <button
                          onClick={cancelEditChild}
                          className="py-2 px-3 rounded-[9px] text-xs"
                          style={{ background: '#fff', border: '0.5px solid #E8E8EC', color: '#555566' }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveChild}
                          disabled={!childName.trim() || savingChild}
                          className="py-2 px-3 rounded-[9px] text-xs font-semibold"
                          style={{
                            background: childName.trim() ? '#7C6EE6' : '#D8D8DC',
                            color:      childName.trim() ? '#fff' : '#999AAA',
                          }}
                        >
                          {savingChild ? '…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Add a child row */}
            {editingChildId === 'new' ? (
              <div
                className="px-3.5 pt-3 pb-3.5"
                style={{
                  borderTop:  children.length > 0 ? '0.5px solid #E8E8EC' : 'none',
                  background: '#F5F5F7',
                }}
              >
                <input
                  autoFocus
                  className="w-full text-sm rounded-[9px] px-3 py-2 mb-2 outline-none"
                  style={{ background: '#fff', border: '0.5px solid #E8E8EC', color: '#1A1A2E' }}
                  placeholder="Child's name *"
                  value={childName}
                  onChange={e => setChildName(e.target.value)}
                />
                <label className="text-xs mb-1 block" style={{ color: '#999AAA' }}>
                  Date of birth (optional)
                </label>
                <input
                  type="date"
                  className="w-full text-sm rounded-[9px] px-3 py-2 mb-3 outline-none"
                  style={{ background: '#fff', border: '0.5px solid #E8E8EC', color: '#1A1A2E' }}
                  value={childDob}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setChildDob(e.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={cancelEditChild}
                    className="py-2 px-3 rounded-[9px] text-xs"
                    style={{ background: '#fff', border: '0.5px solid #E8E8EC', color: '#555566' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveChild}
                    disabled={!childName.trim() || savingChild}
                    className="py-2 px-3 rounded-[9px] text-xs font-semibold"
                    style={{
                      background: childName.trim() ? '#7C6EE6' : '#D8D8DC',
                      color:      childName.trim() ? '#fff' : '#999AAA',
                    }}
                  >
                    {savingChild ? 'Saving…' : 'Add child'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={openAddChild}
                className="w-full flex items-center gap-3 px-3.5 py-3"
                style={{ borderTop: children.length > 0 ? '0.5px solid #E8E8EC' : 'none' }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-base font-medium flex-shrink-0"
                  style={{ background: '#F5F5F7', border: '0.5px dashed #D8D8DC', color: '#999AAA' }}
                >
                  +
                </div>
                <span className="text-[13px]" style={{ color: '#555566' }}>Add a child</span>
              </button>
            )}
          </div>
        </div>

        {/* Shared access */}
        <div
          className="px-5 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: '#999AAA' }}
        >
          Shared access
        </div>
        <div className="px-5">
          <div className="rounded-[14px] overflow-hidden" style={{ border: '0.5px solid #E8E8EC' }}>

            {isLinkedUser && myLink ? (
              /* ── Linked user view ── */
              <div className="flex items-center gap-3 px-3.5 py-3" style={{ background: '#fff' }}>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: '#EEEBfd', color: '#7C6EE6' }}
                >
                  {(myLink.primary_user_name ?? myLink.primary_user_email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: '#1A1A2E' }}>
                    {myLink.primary_user_name ?? myLink.primary_user_email}
                  </div>
                  <div className="text-[11px]" style={{ color: '#555566' }}>Connected account</div>
                </div>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="text-[12px] font-medium px-3 py-1.5 rounded-[8px] flex-shrink-0"
                  style={{ border: '0.5px solid #F09595', color: '#A32D2D' }}
                >
                  {disconnecting ? '…' : 'Disconnect'}
                </button>
              </div>
            ) : (
              /* ── Primary user view ── */
              <>
                {linkedUsers.map((lu) => (
                  <div
                    key={lu.linked_user_id}
                    className="flex items-center gap-3 px-3.5 py-3"
                    style={{ borderBottom: '0.5px solid #E8E8EC', background: '#fff' }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: '#EEEBfd', color: '#7C6EE6' }}
                    >
                      {(lu.linked_user_name ?? lu.linked_user_email)[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate" style={{ color: '#1A1A2E' }}>
                        {lu.linked_user_name ?? lu.linked_user_email}
                      </div>
                      <div className="text-[11px]" style={{ color: '#555566' }}>Has shared access</div>
                    </div>
                    <button
                      onClick={() => handleRevoke(lu.linked_user_id)}
                      className="text-[12px] font-medium px-3 py-1.5 rounded-[8px] flex-shrink-0"
                      style={{ border: '0.5px solid #F09595', color: '#A32D2D' }}
                    >
                      Revoke
                    </button>
                  </div>
                ))}

                {/* Pending invitations (partner type only; exclude whichever is shown in the green box) */}
                {invitations.filter(inv => inv.invitation_type === 'partner' && inv.id !== generatedLink?.id).map(inv => {
                  const url = `${window.location.origin}/join/${inv.token}`
                  return (
                    <div
                      key={inv.id}
                      className="px-3.5 py-3"
                      style={{ borderBottom: '0.5px solid #E8E8EC', background: '#FAFAFA' }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <i className="ti ti-clock" style={{ fontSize: 13, color: '#999AAA' }} />
                        <span className="text-[12px]" style={{ color: '#555566' }}>Pending invite link</span>
                        <button
                          onClick={() => handleCancelInvitation(inv.id)}
                          className="ml-auto text-[11px] px-2 py-0.5 rounded-[6px]"
                          style={{ border: '0.5px solid #E8E8EC', color: '#999AAA' }}
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="flex-1 text-[11px] font-mono px-2.5 py-1.5 rounded-[8px] truncate"
                          style={{ background: '#F5F5F7', color: '#555566' }}
                        >
                          {url}
                        </div>
                        <button
                          onClick={() => handleCopyLink(url)}
                          className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-[8px] flex-shrink-0"
                          style={{ background: '#7C6EE6', color: '#fff' }}
                        >
                          <i className={`ti ${linkCopied ? 'ti-check' : 'ti-copy'}`} style={{ fontSize: 12 }} />
                          {linkCopied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )
                })}

                {/* Generated link (just created) */}
                {generatedLink && (
                  <div className="px-3.5 py-3" style={{ background: '#F5FFF9' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[12px] flex-1" style={{ color: '#0F6E56' }}>
                        Share this link with your partner.
                      </span>
                      <button
                        onClick={() => handleCancelInvitation(generatedLink.id)}
                        className="text-[11px] px-2 py-0.5 rounded-[6px] flex-shrink-0"
                        style={{ border: '0.5px solid #B2DFCC', color: '#0F6E56' }}
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 text-[11px] font-mono px-2.5 py-1.5 rounded-[8px] truncate" style={{ background: '#fff', border: '0.5px solid #D8D8DC', color: '#555566' }}>
                        {generatedLink.url}
                      </div>
                      <button
                        onClick={() => handleCopyLink(generatedLink.url)}
                        className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-[8px] flex-shrink-0"
                        style={{ background: '#7C6EE6', color: '#fff' }}
                      >
                        <i className={`ti ${linkCopied ? 'ti-check' : 'ti-copy'}`} style={{ fontSize: 12 }} />
                        {linkCopied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Invite button */}
                {linkedUsers.length === 0 && invitations.filter(inv => inv.invitation_type === 'partner').length === 0 && !generatedLink && (
                  <div className="px-3.5 py-3" style={{ background: '#fff' }}>
                    <button
                      onClick={handleGenerateLink}
                      disabled={generatingLink}
                      className="w-full flex items-center gap-3"
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: '#F5F5F7', border: '0.5px dashed #D8D8DC', color: '#999AAA' }}
                      >
                        <i className="ti ti-user-plus" style={{ fontSize: 14 }} />
                      </div>
                      <span className="text-[13px]" style={{ color: '#555566' }}>
                        {generatingLink ? 'Generating…' : 'Invite a partner'}
                      </span>
                    </button>
                    {generateError && (
                      <div className="text-[11px] mt-2" style={{ color: '#A32D2D' }}>{generateError}</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        </>}

        {/* Teacher profile — shown only for claimed teacher accounts */}
        {claimedTeacher && (
          <>
            <div
              className="px-5 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: '#999AAA' }}
            >
              Teacher profile
            </div>
            <div className="px-5">
              <div className="rounded-[14px] overflow-hidden" style={{ border: '0.5px solid #E8E8EC' }}>
                {editingTeacher ? (
                  <div className="p-4" style={{ background: '#fff' }}>
                    {([ ['name', 'Name', 'text'], ['subject', 'Subject', 'text'], ['location', 'Location', 'text'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'] ] as const).map(([field, label, type]) => (
                      <div key={field} className="mb-2.5">
                        <label className="block text-[11px] font-medium mb-1" style={{ color: '#999AAA' }}>{label}</label>
                        <input
                          type={type}
                          value={teacherForm[field]}
                          onChange={e => setTeacherForm(f => ({ ...f, [field]: e.target.value }))}
                          className="w-full rounded-[9px] px-3 py-2 text-[13px] outline-none"
                          style={{ border: '0.5px solid #E8E8EC', background: '#F5F5F7', color: '#1A1A2E' }}
                          placeholder={field === 'location' || field === 'email' || field === 'phone' ? 'Optional' : ''}
                        />
                      </div>
                    ))}
                    {teacherSaveError && (
                      <div className="text-[12px] mb-2" style={{ color: '#A32D2D' }}>{teacherSaveError}</div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => { setEditingTeacher(false); setTeacherSaveError(null) }}
                        className="py-2 px-4 rounded-[9px] text-[13px]"
                        style={{ border: '0.5px solid #E8E8EC', color: '#555566' }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveTeacherProfile}
                        disabled={savingTeacher || !teacherForm.name.trim() || !teacherForm.subject.trim()}
                        className="flex-1 py-2 rounded-[9px] text-[13px] font-semibold"
                        style={{
                          background: !teacherForm.name.trim() || !teacherForm.subject.trim() ? '#E8E8EC' : '#7C6EE6',
                          color: !teacherForm.name.trim() || !teacherForm.subject.trim() ? '#999AAA' : '#fff',
                        }}
                      >
                        {savingTeacher ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: '#fff' }}>
                    {([
                      ['Name',     claimedTeacher.name],
                      ['Subject',  claimedTeacher.subject],
                      ['Location', claimedTeacher.location ?? '—'],
                      ['Email',    claimedTeacher.email ?? '—'],
                      ['Phone',    claimedTeacher.phone ?? '—'],
                    ] as const).map(([label, value], i) => (
                      <div
                        key={label}
                        className="flex items-center justify-between px-3.5 py-2.5"
                        style={{ borderTop: i > 0 ? '0.5px solid #E8E8EC' : 'none' }}
                      >
                        <span className="text-[12px]" style={{ color: '#999AAA' }}>{label}</span>
                        <span className="text-[13px] font-medium" style={{ color: '#1A1A2E' }}>{value}</span>
                      </div>
                    ))}
                    <div className="px-3.5 py-2.5" style={{ borderTop: '0.5px solid #E8E8EC' }}>
                      <button
                        onClick={() => {
                          setTeacherForm({
                            name:     claimedTeacher.name,
                            subject:  claimedTeacher.subject,
                            location: claimedTeacher.location ?? '',
                            email:    claimedTeacher.email ?? '',
                            phone:    claimedTeacher.phone ?? '',
                          })
                          setEditingTeacher(true)
                        }}
                        className="text-[13px] font-medium"
                        style={{ color: '#7C6EE6' }}
                      >
                        Edit profile
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Account */}
        <div
          className="px-5 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: '#999AAA' }}
        >
          Account
        </div>
        <div className="px-5">
          <div className="rounded-[14px] overflow-hidden" style={{ border: '0.5px solid #E8E8EC' }}>
            {/* Name */}
            <button
              onClick={openEditName}
              className="w-full flex items-center gap-3 px-3.5 py-3"
              style={{ background: '#fff' }}
            >
              <i className="ti ti-user" style={{ fontSize: 16, color: '#999AAA' }} />
              <div className="text-[13px] flex-shrink-0" style={{ color: '#999AAA', width: 48 }}>Name</div>
              <div className="flex-1 text-[13px] text-left truncate" style={{ color: '#1A1A2E' }}>
                {displayName || <span style={{ color: '#999AAA' }}>Not set</span>}
              </div>
              <i className="ti ti-chevron-right" style={{ fontSize: 15, color: '#999AAA' }} />
            </button>
            {/* Email */}
            <div
              className="flex items-center gap-3 px-3.5 py-3"
              style={{ borderTop: '0.5px solid #E8E8EC' }}
            >
              <i className="ti ti-mail" style={{ fontSize: 16, color: '#999AAA' }} />
              <div className="text-[13px] flex-shrink-0" style={{ color: '#999AAA', width: 48 }}>Email</div>
              <div className="flex-1 text-[13px] truncate" style={{ color: '#1A1A2E' }}>
                {user?.email}
              </div>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div
          className="px-5 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: '#999AAA' }}
        >
          Notifications
        </div>
        <div className="px-5">
          <div className="rounded-[14px] overflow-hidden" style={{ border: '0.5px solid #E8E8EC' }}>
            {[
              {
                label: 'Session reminders',
                sub:   '1 hour before',
                value: notifSession,
                set:   setNotifSession,
              },
              {
                label: 'Payment reminders',
                sub:   'When overdue',
                value: notifPayment,
                set:   setNotifPayment,
              },
            ].map((item, i) => (
              <div
                key={item.label}
                className="flex items-center px-3.5 py-3"
                style={{ borderTop: i > 0 ? '0.5px solid #E8E8EC' : 'none', background: '#fff' }}
              >
                <div className="flex-1">
                  <div className="text-[13px]" style={{ color: '#1A1A2E' }}>{item.label}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#555566' }}>{item.sub}</div>
                </div>
                <Toggle on={item.value} onChange={item.set} />
              </div>
            ))}
          </div>
        </div>

        {/* Sign out */}
        <div className="px-5 pt-4">
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full py-3 rounded-[12px] text-[13px] font-medium"
            style={{ border: '0.5px solid #F09595', color: '#A32D2D' }}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>

      </div>

      {/* Hidden file input for child avatar uploads */}
      <input
        ref={childFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChildFileInput}
      />
    </div>
  )
}
