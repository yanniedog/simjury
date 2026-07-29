import { z } from 'zod'

/**
 * A finished day's play, persisted so a refresh (or coming back later the same
 * day) shows the result instead of letting the juror re-run the case — the
 * one-verdict-a-day rule that makes it a daily.
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
  verdict: z.enum(['Guilty', 'Not Guilty', 'Undecided']),
  swayedByTraps: z.number().optional(),
  totalTraps: z.number().optional(),
  /**
   * Optional pre-seal metacognition. Present when the player engaged the
   * reflection prompt; `counterargumentBeatId` is omitted when they chose
   * “no single point.”
   */
  reflection: z
    .object({
      counterargumentBeatId: z.string().min(1).optional(),
    })
    .optional(),
  /** The jury room's own result (docket loop); absent on v1 plays. */
  room: z
    .object({
      kind: z.enum(['unanimous', 'majority', 'hung']),
      verdict: z.enum(['guilty', 'not_guilty']).nullable(),
      g: z.number(),
      ng: z.number(),
      u: z.number().default(0),
    })
    .optional(),
})

export type StoredPlay = z.infer<typeof storedPlaySchema>
export type VerdictReflection = NonNullable<StoredPlay['reflection']>

const sittingNoteSchema = z.object({
  ownerId: z.string().min(1),
  beatId: z.string().min(1),
  text: z.string().min(1).max(140),
})

const storedProgressSchema = z.object({
  day: z.number(),
  caseId: z.string(),
  phase: z.enum(['openings', 'beats', 'closings', 'juryroom']),
  beatIndex: z.number().int().nonnegative(),
  /** Recollection notes taken during the sitting (player + NPC stubs). */
  notes: z.array(sittingNoteSchema).default([]),
})

export type StoredProgress = z.infer<typeof storedProgressSchema>

/** Caller may omit notes; save writes an empty list. */
export type StoredProgressInput = Omit<StoredProgress, 'notes'> & {
  notes?: StoredProgress['notes']
}

const KEY_PREFIX = 'simjury-daily:v1:'
const PROGRESS_PREFIX = 'simjury-progress:v1:'
const STORAGE_PROBE_KEY = 'simjury:storage-write-probe'
/** Versioned so the entirely new grave-crime guided case is offered once. */
export const INTRO_COMPLETE_KEY = 'simjury:intro-complete:v2'
/** Bumped when the single entry disclosure added the binding 18+ condition. */
export const FICTION_DISCLOSURE_KEY = 'simjury:fiction-disclosure:v2'

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Access can throw in privacy modes / sandboxed frames.
    return null
  }
}

/** True only when site storage accepts a write, not merely when the API exists. */
export function canPersistSitting(): boolean {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(STORAGE_PROBE_KEY, '1')
    const persisted = store.getItem(STORAGE_PROBE_KEY) === '1'
    store.removeItem(STORAGE_PROBE_KEY)
    return persisted
  } catch {
    try {
      store.removeItem(STORAGE_PROBE_KEY)
    } catch {
      // Storage is blocked; there is nothing else to clean up.
    }
    return false
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

export function savePlay(play: StoredPlay): boolean {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(KEY_PREFIX + play.day, JSON.stringify(play))
    return true
  } catch {
    // Full/blocked storage is non-fatal; the play just won't persist.
    return false
  }
}

/** Commit a sealed result and remove its now-obsolete resume point. Safe to repeat. */
export function completePlay(play: StoredPlay): void {
  // Retain resumable progress if the completed result could not be written.
  if (savePlay(play)) clearProgress(play.day)
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

export function saveProgress(progress: StoredProgressInput): void {
  const store = storage()
  if (!store) return
  try {
    const normalized: StoredProgress = {
      ...progress,
      notes: progress.notes ?? [],
    }
    store.setItem(PROGRESS_PREFIX + progress.day, JSON.stringify(normalized))
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

/** The combined fiction and 18+ notice is shown once per browser profile. */
export function hasSeenFictionDisclosure(): boolean {
  const store = storage()
  if (!store) return false
  try {
    return store.getItem(FICTION_DISCLOSURE_KEY) === '1'
  } catch {
    return false
  }
}

export function markFictionDisclosureSeen(): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(FICTION_DISCLOSURE_KEY, '1')
  } catch {
    // Blocked storage is non-fatal; the notice remains dismissed for this load.
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
