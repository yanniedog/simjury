import type { DocketBeat, DocketCase, Juror } from './v2/caseSchema'
import { rngFor } from '../engine/rng'

/** Max length for a single recollection note (player or NPC). */
export const NOTE_MAX_LEN = 140

/** Owner id for the player's seat (juror 1). */
export const PLAYER_NOTE_OWNER = 'player'

export interface SittingNote {
  /** `player` or a case juror id. */
  ownerId: string
  beatId: string
  /** Short recollection — never a verbatim transcript excerpt. */
  text: string
}

export function clipNote(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX_LEN)
}

export function notesForOwner(notes: SittingNote[], ownerId: string): SittingNote[] {
  return notes.filter((n) => n.ownerId === ownerId)
}

export function noteForBeat(
  notes: SittingNote[],
  ownerId: string,
  beatId: string,
): SittingNote | undefined {
  return notes.find((n) => n.ownerId === ownerId && n.beatId === beatId)
}

export function upsertPlayerNote(
  notes: SittingNote[],
  beatId: string,
  text: string,
): SittingNote[] {
  const clipped = clipNote(text)
  const without = notes.filter(
    (n) => !(n.ownerId === PLAYER_NOTE_OWNER && n.beatId === beatId),
  )
  if (!clipped) return without
  return [...without, { ownerId: PLAYER_NOTE_OWNER, beatId, text: clipped }]
}

function speakerName(trial: DocketCase, beat: DocketBeat): string {
  return trial.cast.find((m) => m.id === beat.speaker)?.name ?? 'the witness'
}

/**
 * Recollection stub from metadata only — never copies beat.text.
 * Kept short so deliberation stays note-based, not a primary-source dump.
 */
export function recollectionStub(
  trial: DocketCase,
  beat: DocketBeat,
  juror: Juror,
): string {
  const who = speakerName(trial, beat)
  const tags = beat.tags
  if (beat.kind === 'direction') {
    return tags.includes('burden')
      ? 'Bench direction: who carries the burden — keep that straight.'
      : 'Bench direction: the legal rule that binds the vote.'
  }
  if (beat.kind === 'exhibit') {
    return tags.includes('digital_forensics')
      ? `Exhibit (${who}): what the digital trail does — and does not — prove.`
      : `Exhibit from ${who}: sketch what it shows, not the whole document.`
  }
  if (tags.includes('credibility')) {
    return `${who} — how sure did they sound under pressure?`
  }
  if (tags.includes('identity')) {
    return `${who} on identity — note what was firm vs guessed.`
  }
  if (tags.includes('motive')) {
    return `${who} on motive — thin or solid from the chair?`
  }
  if (tags.includes('procedure')) {
    return `${who} on procedure — any gap worth the room’s time?`
  }
  if (beat.mode === 'cross') {
    return `Cross of ${who}: what wobbled, in one line.`
  }
  const lean =
    beat.direction === 'guilt'
      ? 'pushed toward guilt'
      : beat.direction === 'innocence'
        ? 'pushed toward doubt'
        : 'felt mixed'
  const theme = tags[0] ? ` (${tags[0]})` : ''
  return `${juror.label}: ${who}${theme} ${lean} — from memory only.`
}

/**
 * Fill silent NPC notes for the sitting (notes “taken” during evidence).
 * Deterministic from case id. Skips owners who already have notes. Caps each
 * juror at two notes and prefers high theme-weight beats.
 */
export function ensureNpcNotes(
  trial: DocketCase,
  existing: SittingNote[],
): SittingNote[] {
  const already = new Set(
    existing.filter((n) => n.ownerId !== PLAYER_NOTE_OWNER).map((n) => n.ownerId),
  )
  // If any NPC already has notes (resume), do not regenerate.
  if (already.size > 0) return existing

  const rng = rngFor(`${trial.id}:juror-notes`)
  const next = [...existing]
  const perJuror = new Map<string, number>()

  for (const juror of trial.jury.jurors) {
    const scored = trial.beats
      .map((beat) => {
        const tags = beat.tags ?? []
        const weight = Math.max(...tags.map((t) => juror.weights[t] ?? 0), 0)
        return { beat, weight }
      })
      .filter((row) => row.weight >= 0.45)
      .sort((a, b) => b.weight - a.weight || a.beat.id.localeCompare(b.beat.id))

    for (const row of scored) {
      if ((perJuror.get(juror.id) ?? 0) >= 2) break
      // Not every strong beat becomes a note — recollection is selective.
      if (rng() > 0.55 + row.weight * 0.2) continue
      next.push({
        ownerId: juror.id,
        beatId: row.beat.id,
        text: recollectionStub(trial, row.beat, juror),
      })
      perJuror.set(juror.id, (perJuror.get(juror.id) ?? 0) + 1)
    }
  }

  return next
}

/** Evidence label without primary-source text — for raise chips / agenda. */
export function memoryLabel(
  trial: DocketCase,
  beatId: string,
): { number: number; title: string; kind: string } {
  const index = trial.beats.findIndex((b) => b.id === beatId)
  const beat = trial.beats[index]
  const number = index + 1
  if (!beat) return { number: 0, title: 'A point from memory', kind: 'memory' }
  const speaker = speakerName(trial, beat)
  if (beat.kind === 'direction') {
    return { number, title: 'Judge’s direction', kind: 'direction' }
  }
  if (beat.kind === 'exhibit') {
    return { number, title: `Exhibit · ${speaker}`, kind: 'exhibit' }
  }
  const mode = beat.mode === 'cross' ? 'Cross' : 'Evidence'
  return { number, title: `${mode} · ${speaker}`, kind: beat.kind }
}
