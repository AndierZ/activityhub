import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '../types'
import type { Session as SupabaseSession, User as AuthUser } from '@supabase/supabase-js'
import { getClaimedTeacher, type ClaimedTeacher } from '../lib/db/teachers'

interface AuthContextValue {
  user:             User | null
  session:          SupabaseSession | null
  loading:          boolean
  canManageTeachers:          boolean
  effectiveUserId:  string | null   // primary user's id if linked, else own id
  claimedTeacher:   ClaimedTeacher | null  // set if this user has claimed a teacher profile
  refreshLinks:     () => Promise<void>
  refreshTeacherClaim: () => Promise<void>
  signInWithGoogle: (redirectTo?: string) => Promise<void>
  signOut:          () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                   = useState<User | null>(null)
  const [session, setSession]             = useState<SupabaseSession | null>(null)
  const [loading, setLoading]             = useState(true)
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(null)
  const [claimedTeacher, setClaimedTeacher]   = useState<ClaimedTeacher | null>(null)

  useEffect(() => {
    // Safety net: if onAuthStateChange hasn't fired within 10s, Supabase is
    // stuck (most likely a hung token-refresh request caused by a stale or
    // expired session). Wipe local auth state and send the user to login.
    // 10s is generous — a normal OAuth code exchange takes < 2s, so this
    // timer never fires during a healthy login flow.
    let resolved = false

    const stallTimer = setTimeout(() => {
      if (!resolved) {
        Object.keys(localStorage)
          .filter(k => k.startsWith('sb-'))
          .forEach(k => localStorage.removeItem(k))
        setUser(null)
        setLoading(false)
      }
    }, 10_000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        resolved = true
        clearTimeout(stallTimer)
        setSession(session)
        if (session) {
          // Unblock the app immediately using auth metadata (name + avatar
          // come from Google OAuth — no DB roundtrip needed).
          const u = session.user
          setUser({
            id:         u.id,
            email:      u.email ?? '',
            full_name:  u.user_metadata?.full_name ?? null,
            avatar_url: u.user_metadata?.avatar_url ?? null,
            can_manage_teachers:   false,
            created_at: u.created_at ?? new Date().toISOString(),
            updated_at: null,
          })
          setEffectiveUserId(u.id)  // default; updated by fetchUserProfile
          setLoading(false)
          // Silently refresh from DB in the background (picks up profile
          // edits the user may have made via the Profile page).
          fetchUserProfile(u)
        } else {
          setUser(null)
          setClaimedTeacher(null)
          setLoading(false)
        }
      }
    )

    return () => {
      clearTimeout(stallTimer)
      subscription.unsubscribe()
    }
  }, [])

  async function fetchUserProfile(authUser: AuthUser) {
    try {
      // Race the DB query against an 8s timeout so a slow/unreachable database
      // never blocks the user indefinitely.
      const queryPromise = supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single()

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('profile fetch timeout')), 8_000)
      )

      const { data, error } = await Promise.race([queryPromise, timeoutPromise])
      if (error) throw error
      setUser(data)
    } catch {
      // Profile row missing, query failed, or timed out.
      // Build a minimal user from auth data so authenticated users always
      // enter the app — the profile can be created/synced later.
      setUser({
        id:         authUser.id,
        email:      authUser.email ?? '',
        full_name:  authUser.user_metadata?.full_name ?? null,
        avatar_url: authUser.user_metadata?.avatar_url ?? null,
        can_manage_teachers:   false,
        created_at: new Date().toISOString(),
        updated_at: null,
      })
    } finally {
      setLoading(false)
      // Resolve effective user id and claimed teacher in parallel
      await Promise.all([
        resolveEffectiveUserId(authUser.id),
        resolveClaimedTeacher(authUser.id),
      ])
    }
  }

  async function resolveEffectiveUserId(ownId: string) {
    try {
      const { data } = await supabase
        .from('user_links')
        .select('primary_user_id')
        .eq('linked_user_id', ownId)
        .maybeSingle()
      setEffectiveUserId(data?.primary_user_id ?? ownId)
    } catch {
      setEffectiveUserId(ownId)
    }
  }

  async function resolveClaimedTeacher(ownId: string) {
    try {
      const teacher = await getClaimedTeacher(ownId)
      setClaimedTeacher(teacher)
    } catch {
      setClaimedTeacher(null)
    }
  }

  async function refreshLinks() {
    const id = (await supabase.auth.getUser()).data.user?.id
    if (id) await resolveEffectiveUserId(id)
  }

  async function refreshTeacherClaim() {
    const id = (await supabase.auth.getUser()).data.user?.id
    if (id) await resolveClaimedTeacher(id)
  }

  async function signInWithGoogle(redirectTo?: string) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo ?? window.location.origin },
    })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const canManageTeachers = user?.can_manage_teachers ?? false

  return (
    <AuthContext.Provider value={{
      user, session, loading, canManageTeachers,
      effectiveUserId, claimedTeacher,
      refreshLinks, refreshTeacherClaim,
      signInWithGoogle, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
