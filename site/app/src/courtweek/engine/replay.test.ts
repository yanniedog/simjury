import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import type { SceneCue } from '../model/schema'
import { nextReplaySafeCue, replaySafeCue } from './replay'

const strikeScene = elevenMinutesCourtWeek.manifest.sessions
  .flatMap((session) => session.scenes)
  .find((scene) => scene.id === 'wed-strike')!
const crossIndex = strikeScene.cues.findIndex((cue) => cue.id === 'wed-vale-cross-1')
const struckCue = strikeScene.cues.find((cue) => cue.id === 'wed-blurt')!

describe('completed-session replay containment', () => {
  it('skips the struck answer and proceeds directly to the ruling', () => {
    expect(nextReplaySafeCue(strikeScene.cues, crossIndex, false)?.id).toBe('wed-blurt')
    expect(nextReplaySafeCue(strikeScene.cues, crossIndex, true)?.id).toBe('wed-postanswer-ruling')
  })

  it('cannot render or play the struck substance from stale replay state', () => {
    const withAudio: SceneCue = {
      ...struckCue,
      audio: { mp3: 'https://media.example.invalid/struck-answer.mp3' },
    }
    const safe = replaySafeCue(withAudio, true)

    expect(safe.audio).toBeUndefined()
    expect(safe.text).not.toBe(struckCue.text)
    expect(JSON.stringify(safe)).not.toMatch(/had done this before/i)
    expect(safe.text).toMatch(/not repeated on replay/i)
  })
})
