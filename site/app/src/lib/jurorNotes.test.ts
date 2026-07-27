import { describe, expect, it } from 'vitest'
import {
  clipNote,
  ensureNpcNotes,
  NOTE_MAX_LEN,
  PLAYER_NOTE_OWNER,
  upsertPlayerNote,
} from './jurorNotes'
import { makeDocketCase } from './v2/fixtures'

describe('jurorNotes', () => {
  it('clips and upserts player notes', () => {
    const long = 'x'.repeat(NOTE_MAX_LEN + 40)
    expect(clipNote(long)).toHaveLength(NOTE_MAX_LEN)
    const once = upsertPlayerNote([], 'b1', '  first note  ')
    expect(once).toEqual([{ ownerId: PLAYER_NOTE_OWNER, beatId: 'b1', text: 'first note' }])
    const replaced = upsertPlayerNote(once, 'b1', 'updated')
    expect(replaced).toEqual([{ ownerId: PLAYER_NOTE_OWNER, beatId: 'b1', text: 'updated' }])
    expect(upsertPlayerNote(replaced, 'b1', '   ')).toEqual([])
  })

  it('synthesizes NPC notes without using beat text', () => {
    const trial = makeDocketCase()
    const notes = ensureNpcNotes(trial, [])
    expect(notes.some((n) => n.ownerId !== PLAYER_NOTE_OWNER)).toBe(true)
    for (const note of notes) {
      const beat = trial.beats.find((b) => b.id === note.beatId)
      expect(beat).toBeTruthy()
      expect(note.text.includes(beat!.text)).toBe(false)
    }
    // Resume must not regenerate.
    expect(ensureNpcNotes(trial, notes)).toEqual(notes)
  })
})
