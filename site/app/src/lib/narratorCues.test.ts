import { describe, expect, it } from 'vitest'
import { makeV3DocketCase } from './v2/fixtures'
import { introSceneNarratorCue, speakerNarratorCue } from './narratorCues'

describe('narrator cues', () => {
  it('sets the scene and introduces the accused and charge', () => {
    const trial = makeV3DocketCase()
    const cue = introSceneNarratorCue(trial)
    expect(cue).toMatch(/^We begin in .+\./)
    expect(cue).toContain(trial.cast.find(({ id }) => id === trial.accused.cast_id)!.name)
    expect(cue).toContain(trial.charge.toLocaleLowerCase())
  })

  it('varies procedural introductions while remaining stable for replay', () => {
    const trial = makeV3DocketCase()
    const witnessBeats = trial.beats.filter(
      (beat) => beat.kind === 'witness' && beat.mode !== 'cross',
    )
    const cues = witnessBeats.map((beat) => speakerNarratorCue(trial, beat))
    expect(new Set(cues).size).toBeGreaterThan(1)
    expect(speakerNarratorCue(trial, witnessBeats[0])).toBe(cues[0])
  })

  it('explains the listening task without repeating a fiction disclaimer', () => {
    const trial = makeV3DocketCase()
    const cues = trial.beats
      .map((beat) => speakerNarratorCue(trial, beat))
      .filter((cue): cue is string => Boolean(cue))
    expect(cues.some((cue) => /source|custody|authenticated|limits/i.test(cue))).toBe(true)
    expect(cues.join(' ')).not.toMatch(/\bfiction(?:al)?\b/i)
  })
})
