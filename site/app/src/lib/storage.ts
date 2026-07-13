import { z } from 'zod'

/**
 * A finished day's play, persisted so a refresh (or coming back later the same
 * day) shows the result instead of letting the juror re-run the case — the
 * one-verdict-a-day rule that makes it a daily.
 *
 * `correct` and the trap counts are recorded so cross-day stats (streaks, win
 * rate) can be computed without re-deriving them from each day's case. They are
 * optional for backward compatibility with plays saved before stats existed.
 *
 * `caseId` pins the play to the specific case it was scored against. Without
 * it, a queue edit (reorder, replace, resize) that shifts which case falls on
 * a day index could make a stored play "valid" (right length) but actually
 * belong to a different case than the one now showing for that day — silently
 * revealing/scoring the wrong trial. A schema mismatch (e.g. an older stored
 * play with no `caseId`) just fails to restore, same as any other corrupt entry.
 */
const storedPlaySchema = z.object({
  day: z.number(),
  caseId: z.string(),
  convictions: z.array(z.number()),
  verdict: z.enum(['Guilty', 'Not Guilty']),
  correct: z.boolean().optional(),
  swayedByTraps: z.number().optional(),
  totalTraps: z.number().optional(),
})

export type StoredPlay = z.infer<typeof storedPlaySchema>

const KEY_PREFIX = 'simjury-daily:v1:'

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Access can throw in privacy modes / sandboxed frames.
    return null
  }
}

export function loadPlay(day: number): StoredPlay | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(KEY_PREFIX + day)
    if (!raw) return null
    // Validate the shape: a schema change or corrupted entry must not crash the
    // game — a failed parse just means "not played today", so we start fresh.
    const parsed = storedPlaySchema.safeParse(JSON.parse(raw))
    return parsed.success && parsed.data.day === day ? parsed.data : null
  } catch {
    return null
  }
}

export function savePlay(play: StoredPlay): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(KEY_PREFIX + play.day, JSON.stringify(play))
  } catch {
    // Full/blocked storage is non-fatal; the play just won't persist.
  }
}

/** Every valid stored play, in no particular order. Corrupt entries are skipped. */
export function loadAllPlays(): StoredPlay[] {
  const store = storage()
  if (!store) return []
  const plays: StoredPlay[] = []
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)
    if (!key || !key.startsWith(KEY_PREFIX)) continue
    try {
      const raw = store.getItem(key)
      if (!raw) continue
      const parsed = storedPlaySchema.safeParse(JSON.parse(raw))
      if (parsed.success) plays.push(parsed.data)
    } catch {
      // Skip a corrupt entry rather than failing the whole stats read.
    }
  }
  return plays
}
