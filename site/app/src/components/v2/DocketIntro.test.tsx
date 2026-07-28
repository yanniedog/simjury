import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { introSceneNarratorCue, phaseNarratorCue } from '../../lib/narratorCues'

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
    useState: <T,>(initial: T) => [initial, vi.fn()] as const,
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
    const trial = makeDocketCase({
      content_advisories: ['death', 'serious_violence'],
    })

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
        { text: introSceneNarratorCue(trial), key: 'narrator' },
        {
          text: 'Content advisory: death, serious violence.',
          key: 'narrator',
        },
        { text: trial.hook, key: 'narrator' },
      ],
      { rate: 1.15, done: expect.any(Function) },
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

  it('omits an advisory when the case has none', () => {
    const trial = makeDocketCase()
    const markup = DocketIntro({
      trial,
      dayNumber: 1,
      narration: true,
      playbackRate: 1,
      onBegin: () => undefined,
    })

    expect(markup.props.children).toBeDefined()
    expect(narrationMocks.speakAll).toHaveBeenCalledWith(
      [
        { text: phaseNarratorCue('intro'), key: 'narrator' },
        { text: introSceneNarratorCue(trial), key: 'narrator' },
        { text: trial.hook, key: 'narrator' },
      ],
      { rate: 1, done: expect.any(Function) },
    )
  })

  it('sets the scene, names the accused and charge, and omits punishment', () => {
    const trial = makeDocketCase({
      setting: 'The fictional coastal city of Orin Bay.',
      charge: 'obtaining funds by deception',
      accused: {
        cast_id: 'acc',
        human: 'Arden repairs bicycles and volunteers at a community workshop.',
        if_guilty: 'Arden would lose a career and face a long prison sentence.',
      },
    })
    const markup = renderToStaticMarkup(
      <DocketIntro
        trial={trial}
        dayNumber={1}
        narration={false}
        playbackRate={1}
        onBegin={() => undefined}
      />,
    )

    expect(markup).toContain('We begin in the coastal city of Orin Bay')
    expect(markup).toContain('Corin Vale is the accused')
    expect(markup).toContain('charged with obtaining funds by deception')
    expect(markup).toContain('repairs bicycles')
    expect(markup).not.toContain('long prison sentence')
    expect(markup).not.toContain('If you convict')
  })
})
