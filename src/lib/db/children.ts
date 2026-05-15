import { supabase } from '../supabase'
import type { Child } from '../../types'

export async function getChildren(userId: string): Promise<Child[]> {
  const { data, error } = await supabase
    .from('children')
    .select('*')
    .eq('user_id', userId)
    .order('display_order', { ascending: true })

  if (error) throw error
  return data
}

export async function createChild(
  userId: string,
  input: { name: string; date_of_birth?: string; avatar_url?: string }
): Promise<Child> {
  // Get current max display_order so new child goes last
  const { data: existing } = await supabase
    .from('children')
    .select('display_order')
    .eq('user_id', userId)
    .order('display_order', { ascending: false })
    .limit(1)

  const nextOrder = existing && existing.length > 0
    ? existing[0].display_order + 1
    : 0

  const { data, error } = await supabase
    .from('children')
    .insert({
      user_id:       userId,
      name:          input.name,
      date_of_birth: input.date_of_birth ?? null,
      avatar_url:    input.avatar_url ?? null,
      display_order: nextOrder,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateChild(
  id: string,
  input: Partial<Pick<Child, 'name' | 'date_of_birth' | 'avatar_url' | 'display_order'>>
): Promise<Child> {
  const { data, error } = await supabase
    .from('children')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteChild(id: string): Promise<void> {
  const { error } = await supabase
    .from('children')
    .delete()
    .eq('id', id)

  if (error) throw error
}
