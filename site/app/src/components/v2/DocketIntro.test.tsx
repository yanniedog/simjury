import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { phaseNarratorCue } from '../../lib/narratorCues'

const narrationMocks = vi.hoisted(() => ({
  speakAll: vi.fn(),
  stopSpeech: vi.fn(),
}))
const effectState = vi.hoisted(() => ({
  cleanup: undefined as (() => void) | undefined,
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      effectState.cleanup = effect() ?? undefined
    },
  }
})

vi.mock('../../lib/narration', () => narrationMocks)

import { DocketIntro } from './DocketIntro'

describe('DocketIntro narration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    effectState.cleanup = undefined
  })

  it('narrates the briefing cue and hook at the selected playback rate and stops on cleanup', () => {
    const trial = makeDocketCase()

    DocketIntro({
      trial,
      dayNumber: 1,
      narration: true,
      playbackRate: 1.15,
      onBegin: () => undefined,
    })

    expect(narrationMocks.speakAll).toHaveBeenCalledWith(
      [
        { text: phaseNarratorCue('intro'), key: 'narrator' },
        { text: trial.hook, key: 'narrator' },
      ],
      { rate: 1.15 },
    )
    effectState.cleanup?.()
    expect(narrationMocks.stopSpeech).toHaveBeenCalledOnce()
  })

  it('does not narrate when narration is off', () => {
    DocketIntro({
      trial: makeDocketCase(),
      dayNumber: 1,
      narration: false,
      playbackRate: 1,
      onBegin: () => undefined,
    })

    expect(narrationMocks.speakAll).not.toHaveBeenCalled()
  })
})
