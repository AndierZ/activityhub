import { supabase } from '../supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvitationRow {
  id: string
  token: string
  created_at: string
  accepted_at: string | null
  accepted_by_user_id: string | null
  invitation_type: 'partner' | 'teacher'
}

export interface InvitationValidation {
  valid: boolean
  reason?: string          // 'not_found' | 'expired' | 'used' | 'valid'
  inviter_name: string | null
  inviter_email: string | null
  invitation_type: 'partner' | 'teacher'
  teacher_name: string | null
  teacher_subject: string | null
}

export interface LinkedUser {
  linked_user_id: string
  linked_user_name: string | null
  linked_user_email: string
  created_at: string
}

// ─── Invitations ──────────────────────────────────────────────────────────────

export async function createInvitation(
  inviterUserId: string
): Promise<{ id: string; token: string }> {
  const { data, error } = await supabase
    .from('invitations')
    .insert({ inviter_user_id: inviterUserId })
    .select('id, token')
    .single()
  if (error) throw error
  return { id: data.id as string, token: data.token as string }
}

export async function getMyInvitations(userId: string): Promise<InvitationRow[]> {
  const { data, error } = await supabase
    .from('invitations')
    .select('id, token, created_at, accepted_at, accepted_by_user_id, invitation_type')
    .eq('inviter_user_id', userId)
    .is('accepted_at', null)        // only pending ones
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function deleteInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase
    .from('invitations')
    .delete()
    .eq('id', invitationId)
  if (error) throw error
}

// ─── Validation & acceptance (RPC — bypasses RLS) ────────────────────────────

export async function validateInvitation(token: string): Promise<InvitationValidation> {
  const { data, error } = await supabase.rpc('validate_invitation', { p_token: token })
  if (error) throw error
  const row = data?.[0]
  return {
    valid:            row?.valid ?? false,
    reason:           row?.reason ?? 'not_found',
    inviter_name:     row?.inviter_name ?? null,
    inviter_email:    row?.inviter_email ?? null,
    invitation_type:  row?.invitation_type ?? 'partner',
    teacher_name:     row?.teacher_name ?? null,
    teacher_subject:  row?.teacher_subject ?? null,
  }
}

export async function getUserDataSummary(
  userId: string
): Promise<{ children_count: number; sessions_count: number }> {
  const { data, error } = await supabase.rpc('get_user_data_summary', { p_user_id: userId })
  if (error) throw error
  const row = data?.[0]
  return {
    children_count: Number(row?.children_count ?? 0),
    sessions_count: Number(row?.sessions_count ?? 0),
  }
}

export async function acceptInvitation(token: string): Promise<void> {
  const { error } = await supabase.rpc('accept_invitation', { p_token: token })
  if (error) throw error
}

// ─── Links ────────────────────────────────────────────────────────────────────

export async function getLinkedUsers(primaryUserId: string): Promise<LinkedUser[]> {
  const { data: links, error } = await supabase
    .from('user_links')
    .select('linked_user_id, created_at')
    .eq('primary_user_id', primaryUserId)
  if (error) throw error
  if (!links || links.length === 0) return []

  const { data: users, error: ue } = await supabase
    .from('users')
    .select('id, full_name, email')
    .in('id', links.map(l => l.linked_user_id))
  if (ue) throw ue

  return links.map(link => {
    const u = users?.find(u => u.id === link.linked_user_id)
    return {
      linked_user_id:    link.linked_user_id,
      linked_user_name:  u?.full_name ?? null,
      linked_user_email: u?.email ?? '',
      created_at:        link.created_at,
    }
  })
}

export async function getMyLink(
  linkedUserId: string
): Promise<{ primary_user_id: string; primary_user_name: string | null; primary_user_email: string } | null> {
  const { data: link, error } = await supabase
    .from('user_links')
    .select('primary_user_id')
    .eq('linked_user_id', linkedUserId)
    .maybeSingle()
  if (error) throw error
  if (!link) return null

  const { data: u, error: ue } = await supabase
    .from('users')
    .select('full_name, email')
    .eq('id', link.primary_user_id)
    .single()
  if (ue) throw ue

  return {
    primary_user_id:    link.primary_user_id,
    primary_user_name:  u.full_name ?? null,
    primary_user_email: u.email,
  }
}

export async function revokeLink(primaryUserId: string, linkedUserId: string): Promise<void> {
  const { error } = await supabase
    .from('user_links')
    .delete()
    .eq('primary_user_id', primaryUserId)
    .eq('linked_user_id', linkedUserId)
  if (error) throw error
}

export async function disconnectSelf(linkedUserId: string): Promise<void> {
  const { error } = await supabase
    .from('user_links')
    .delete()
    .eq('linked_user_id', linkedUserId)
  if (error) throw error
}

// ─── Teacher invitations ──────────────────────────────────────────────────────

export async function getTeacherPendingInvitation(
  teacherId: string
): Promise<{ id: string; token: string } | null> {
  const { data, error } = await supabase
    .from('invitations')
    .select('id, token')
    .eq('teacher_id', teacherId)
    .eq('invitation_type', 'teacher')
    .is('accepted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? { id: data.id as string, token: data.token as string } : null
}

export async function createTeacherInvitation(
  inviterUserId: string,
  teacherId: string
): Promise<{ id: string; token: string }> {
  const { data, error } = await supabase
    .from('invitations')
    .insert({
      inviter_user_id: inviterUserId,
      invitation_type: 'teacher',
      teacher_id:      teacherId,
    })
    .select('id, token')
    .single()
  if (error) throw error
  return { id: data.id as string, token: data.token as string }
}

export async function acceptTeacherInvitation(token: string): Promise<void> {
  const { error } = await supabase.rpc('accept_teacher_invitation', { p_token: token })
  if (error) throw error
}
