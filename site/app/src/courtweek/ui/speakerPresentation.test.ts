import { describe, expect, it } from 'vitest'
import { elevenMinutesSessions } from '../content/sessions'
import { canonicalSpeakerName, speakerCaptionColour } from './speakerPresentation'

const speakers = [...new Set(elevenMinutesSessions.flatMap((session) =>
  session.scenes.flatMap((scene) => scene.cues.flatMap((cue) => [
    cue.speaker,
    ...(cue.turns?.map((turn) => turn.speaker) ?? []),
  ])),
))]

function hslLightness(colour: string): number {
  const match = colour.match(/hsl\([^ ]+ 74% (\d+)%\)/u)
  if (!match) throw new Error(`Unexpected caption colour ${colour}`)
  return Number(match[1])
}

describe('speaker caption presentation', () => {
  it('assigns every authored character a stable, distinct, high-contrast colour', () => {
    const byCharacter = new Map<string, string>()
    for (const speaker of speakers) {
      const character = canonicalSpeakerName(speaker)
      const colour = speakerCaptionColour(speaker)
      expect(hslLightness(colour)).toBeGreaterThanOrEqual(82)
      expect(byCharacter.get(character) ?? colour).toBe(colour)
      byCharacter.set(character, colour)
    }
    expect(new Set(byCharacter.values()).size).toBe(byCharacter.size)
  })

  it('keeps a character colour when their procedural role is added to the label', () => {
    expect(speakerCaptionColour('Foreperson Edda Rook')).toBe(speakerCaptionColour('Edda Rook'))
  })
})
