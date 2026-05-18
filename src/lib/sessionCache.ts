import type { Session } from '../types'
import { startOfWeek } from 'date-fns'

export const STALE_MS = 5 * 60 * 1000   // 5 minutes

export interface WeekCacheEntry {
  sessions:    Session[]
  conflictMap: Map<string, boolean>
  fetchedAt:   Date
}

// ─── LRU store ────────────────────────────────────────────────────────────────

const MAX_ENTRIES = 10
const store       = new Map<string, WeekCacheEntry>()
const lruKeys: string[] = []

function toKey(weekStart: Date): string {
  return startOfWeek(weekStart, { weekStartsOn: 0 }).toISOString()
}

function touchLRU(key: string) {
  const i = lruKeys.indexOf(key)
  if (i !== -1) lruKeys.splice(i, 1)
  lruKeys.push(key)
}

function evict() {
  while (store.size > MAX_ENTRIES) {
    const k = lruKeys.shift()
    if (k) store.delete(k)
  }
}

// ─── Pub/sub: StudentCalendarPage subscribes so external invalidations (e.g. LogPage
//     saving a session) can trigger a reload without a full page refresh. ─────

type Listener = (weekStart: Date) => void
const listeners = new Set<Listener>()

export function subscribe(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function get(weekStart: Date): WeekCacheEntry | undefined {
  const key   = toKey(weekStart)
  const entry = store.get(key)
  if (entry) touchLRU(key)
  return entry
}

export function set(weekStart: Date, entry: WeekCacheEntry): void {
  const key = toKey(weekStart)
  store.set(key, entry)
  touchLRU(key)
  evict()
}

export function invalidate(weekStart: Date): void {
  const key = toKey(weekStart)
  store.delete(key)
  const i = lruKeys.indexOf(key)
  if (i !== -1) lruKeys.splice(i, 1)
}

export function clear(): void {
  store.clear()
  lruKeys.length = 0
}

/** Called from other pages after creating/modifying a session. Invalidates the
 *  cache for that week and notifies any mounted StudentCalendarPage to reload. */
export function invalidateWeekOf(date: Date): void {
  const ws = startOfWeek(date, { weekStartsOn: 0 })
  invalidate(ws)
  listeners.forEach(cb => cb(ws))
}

export function isStale(entry: WeekCacheEntry): boolean {
  return Date.now() - entry.fetchedAt.getTime() > STALE_MS
}
