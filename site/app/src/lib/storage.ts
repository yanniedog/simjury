import { z } from 'zod'

/**
 * A finished day's play, persisted so a refresh (or coming back later the same
 * day) shows the result instead of letting the juror re-run the case — the
 * one-verdict-a-day rule that makes it a daily.
 *
 * `correct` is recorded so cross-day stats can be computed without re-deriving
 * from each day's case. Optional for backward compatibility.
 *
 * `caseId` pins the play to the specific case it was scored against.
 *
 * `convictions` remains optional/empty for backward compatibility with older
 * plays that recorded mid-trial check-ins; new plays omit the journey series.
 */
const storedPlaySchema = z.object({
  day: z.number(),
  caseId: z.string(),
  convictions: z.array(z.number()).default([]),
  verdict: z.enum(['Guilty', 'Not Guilty']),
  correct: z.boolean().optional(),
  swayedByTraps: z.number().optional(),
  totalTraps: z.number().optional(),
  /** The jury room's own result (docket loop); absent on v1 plays. */
  room: z
    .object({
      kind: z.enum(['unanimous', 'majority', 'hung']),
      verdict: z.enum(['guilty', 'not_guilty']).nullable(),
      g: z.number(),
      ng: z.number(),
    })
    .optional(),
})

export type StoredPlay = z.infer<typeof storedPlaySchema>

const storedProgressSchema = z.object({
  day: z.number(),
  caseId: z.string(),
  phase: z.enum(['openings', 'beats', 'verdict']),
  beatIndex: z.number().int().nonnegative(),
})

export type StoredProgress = z.infer<typeof storedProgressSchema>

const KEY_PREFIX = 'simjury-daily:v1:'
const PROGRESS_PREFIX = 'simjury-progress:v1:'
export const INTRO_COMPLETE_KEY = 'simjury:intro-complete'

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

/** A stored verdict only belongs to the sitting it was authored against. */
export function loadPlayForSitting(
  day: number,
  caseId: string,
): StoredPlay | null {
  const play = loadPlay(day)
  return play?.caseId === caseId ? play : null
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

export function loadProgress(day: number): StoredProgress | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(PROGRESS_PREFIX + day)
    if (!raw) return null
    const parsed = storedProgressSchema.safeParse(JSON.parse(raw))
    return parsed.success && parsed.data.day === day ? parsed.data : null
  } catch {
    return null
  }
}

export function saveProgress(progress: StoredProgress): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(PROGRESS_PREFIX + progress.day, JSON.stringify(progress))
  } catch {
    // Blocked storage is non-fatal; the current sitting can still continue.
  }
}

export function clearProgress(day: number): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(PROGRESS_PREFIX + day)
  } catch {
    // Blocked storage is non-fatal.
  }
}

export function isIntroComplete(): boolean {
  const store = storage()
  if (!store) return false
  try {
    return store.getItem(INTRO_COMPLETE_KEY) === '1'
  } catch {
    return false
  }
}

export function markIntroComplete(): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(INTRO_COMPLETE_KEY, '1')
  } catch {
    // Blocked storage is non-fatal.
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
