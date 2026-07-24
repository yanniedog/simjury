import { describe, expect, it } from 'vitest'
import { playerMediaCaption } from './CaseMedia'

describe('playerMediaCaption', () => {
  it('strips authoring fiction labels for player display', () => {
    expect(playerMediaCaption('Fictional court sketch of the hearing.')).toBe(
      'Court sketch of the hearing.',
    )
    expect(playerMediaCaption('Fictional character portrait of the accused.')).toBe(
      'Character portrait of the accused.',
    )
    expect(playerMediaCaption('Fictional reconstruction of the alley.')).toBe(
      'Reconstruction of the alley.',
    )
  })
})
