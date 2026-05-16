import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  validateInvitation,
  getUserDataSummary,
  acceptInvitation,
  type InvitationValidation,
} from '../lib/db/sharing'

export function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const { user, effectiveUserId, refreshLinks, signInWithGoogle } = useAuth()
  const navigate = useNavigate()

  const [invitation, setInvitation]   = useState<InvitationValidation | null>(null)
  const [loadingInvite, setLoadingInvite] = useState(true)
  const [alreadyLinked, setAlreadyLinked] = useState(false)
  const [existingData, setExistingData]   = useState<{ children_count: number; sessions_count: number } | null>(null)
  const [confirmed, setConfirmed]     = useState(false)
  const [accepting, setAccepting]     = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  // Validate the token (works without auth — SECURITY DEFINER RPC)
  useEffect(() => {
    if (!token) return
    validateInvitation(token)
      .then(setInvitation)
      .catch((err) => {
        console.error('validate_invitation failed:', err)
        setInvitation({ valid: false, reason: 'not_found', inviter_name: null, inviter_email: null })
      })
      .finally(() => setLoadingInvite(false))
  }, [token])

  // Once logged in + invitation is valid, run pre-acceptance checks
  useEffect(() => {
    if (!user || !invitation?.valid) return

    // Already linked somewhere?
    if (effectiveUserId !== null && effectiveUserId !== user.id) {
      setAlreadyLinked(true)
      return
    }

    // How much existing data do they have?
    getUserDataSummary(user.id).then(setExistingData).catch(console.error)
  }, [user, invitation, effectiveUserId])

  async function handleAccept() {
    if (!token) return
    setAccepting(true)
    setAcceptError(null)
    try {
      await acceptInvitation(token)
      await refreshLinks()
      navigate('/', { replace: true })
    } catch (err: unknown) {
      console.error('accept_invitation failed:', err)
      setAcceptError((err as { message?: string })?.message ?? 'Something went wrong')
    } finally {
      setAccepting(false)
    }
  }

  function handleSignIn() {
    // After OAuth, Google redirects back to this exact URL
    signInWithGoogle(`${window.location.origin}/join/${token}`)
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loadingInvite) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#7C6EE6', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  // ── Invalid invitation ────────────────────────────────────────────────────

  if (!invitation?.valid) {
    const messages: Record<string, string> = {
      expired:   'This invite link has expired. Ask the sender to generate a new one.',
      used:      'This invite link has already been used.',
      not_found: 'This invite link is invalid or doesn\'t exist.',
    }
    return (
      <div className="flex flex-col items-center justify-center h-screen px-6 text-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: '#FEE2E2' }}>
          <i className="ti ti-link-off" style={{ fontSize: 24, color: '#A32D2D' }} />
        </div>
        <div className="text-[18px] font-semibold mb-2" style={{ color: '#1A1A2E' }}>Link not valid</div>
        <div className="text-[14px] leading-relaxed" style={{ color: '#555566' }}>
          {messages[invitation?.reason ?? 'not_found']}
        </div>
      </div>
    )
  }

  const inviterDisplay = invitation.inviter_name ?? invitation.inviter_email ?? 'Someone'

  // ── Not logged in ─────────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6">
        <div className="w-full max-w-sm">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-5 mx-auto" style={{ background: '#EEEBfd' }}>
            <i className="ti ti-users" style={{ fontSize: 24, color: '#7C6EE6' }} />
          </div>
          <div className="text-center mb-6">
            <div className="text-[20px] font-semibold mb-2" style={{ color: '#1A1A2E' }}>
              You're invited
            </div>
            <div className="text-[14px] leading-relaxed" style={{ color: '#555566' }}>
              <span className="font-medium" style={{ color: '#1A1A2E' }}>{inviterDisplay}</span> wants to
              share their ActivityHub account with you. Sign in to accept.
            </div>
          </div>
          <button
            onClick={handleSignIn}
            className="w-full flex items-center justify-center gap-2.5 py-3 rounded-[12px] text-[14px] font-semibold"
            style={{ background: '#7C6EE6', color: '#fff' }}
          >
            <i className="ti ti-brand-google" style={{ fontSize: 16 }} />
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  // ── Already linked to someone else ────────────────────────────────────────

  if (alreadyLinked) {
    return (
      <div className="flex flex-col items-center justify-center h-screen px-6 text-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: '#FEF3DC' }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 24, color: '#9A6A10' }} />
        </div>
        <div className="text-[18px] font-semibold mb-2" style={{ color: '#1A1A2E' }}>Already connected</div>
        <div className="text-[14px] leading-relaxed mb-6" style={{ color: '#555566' }}>
          Your account is already sharing someone else's data. Disconnect from Profile first, then accept this invite.
        </div>
        <button
          onClick={() => navigate('/profile')}
          className="py-2.5 px-5 rounded-[12px] text-[13px] font-semibold"
          style={{ background: '#7C6EE6', color: '#fff' }}
        >
          Go to Profile
        </button>
      </div>
    )
  }

  // ── Has existing data — show warning ──────────────────────────────────────

  const hasData = (existingData?.children_count ?? 0) > 0 || (existingData?.sessions_count ?? 0) > 0

  if (hasData && !confirmed) {
    const parts: string[] = []
    if ((existingData?.children_count ?? 0) > 0)
      parts.push(`${existingData!.children_count} ${existingData!.children_count === 1 ? 'child' : 'children'}`)
    if ((existingData?.sessions_count ?? 0) > 0)
      parts.push(`${existingData!.sessions_count} ${existingData!.sessions_count === 1 ? 'session' : 'sessions'}`)

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6">
        <div className="w-full max-w-sm">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-5 mx-auto" style={{ background: '#FEF3DC' }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 24, color: '#9A6A10' }} />
          </div>
          <div className="text-center mb-5">
            <div className="text-[20px] font-semibold mb-2" style={{ color: '#1A1A2E' }}>
              Heads up
            </div>
            <div className="text-[14px] leading-relaxed" style={{ color: '#555566' }}>
              You have {parts.join(' and ')} in your account. While connected to{' '}
              <span className="font-medium" style={{ color: '#1A1A2E' }}>{inviterDisplay}</span>'s account,
              your own data will be hidden. It's restored if you ever disconnect.
            </div>
          </div>
          <button
            onClick={() => setConfirmed(true)}
            className="w-full py-3 rounded-[12px] text-[14px] font-semibold mb-3"
            style={{ background: '#7C6EE6', color: '#fff' }}
          >
            Understood, connect anyway
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 rounded-[12px] text-[14px]"
            style={{ color: '#555566' }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── Acceptance confirmation ────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div className="w-full max-w-sm">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-5 mx-auto" style={{ background: '#EEEBfd' }}>
          <i className="ti ti-users" style={{ fontSize: 24, color: '#7C6EE6' }} />
        </div>
        <div className="text-center mb-6">
          <div className="text-[20px] font-semibold mb-2" style={{ color: '#1A1A2E' }}>
            Accept invitation
          </div>
          <div className="text-[14px] leading-relaxed" style={{ color: '#555566' }}>
            You'll share the same calendar, children, and payments as{' '}
            <span className="font-medium" style={{ color: '#1A1A2E' }}>{inviterDisplay}</span>.
            You keep your own profile and can disconnect any time.
          </div>
        </div>

        {acceptError && (
          <div className="mb-4 px-3 py-2.5 rounded-[10px] text-[13px]" style={{ background: '#FDECEB', color: '#A32D2D' }}>
            {acceptError}
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={accepting}
          className="w-full py-3 rounded-[12px] text-[14px] font-semibold mb-3"
          style={{ background: accepting ? '#D8D8DC' : '#7C6EE6', color: '#fff' }}
        >
          {accepting ? 'Connecting…' : `Connect to ${inviterDisplay}'s account`}
        </button>
        <button
          onClick={() => navigate('/')}
          disabled={accepting}
          className="w-full py-3 rounded-[12px] text-[14px]"
          style={{ color: '#555566' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
