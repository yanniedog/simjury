import { afterEach, describe, expect, it } from 'vitest'
import {
  ALT_VOICE_ENGINE_ID,
  ALT_VOICE_RELEASE_PREFIX,
  buildAltVoiceByKey,
  normaliseNarrationEngine,
} from './narrationAltVoice'
import {
  clearNarrationSpeakers,
  narrationIdFor,
  naturalVoiceUrlFor,
  setNarrationEngine,
  setNarrationSpeakers,
} from './narration'
import { buildSpeakerVoicePlan } from './speakerVoices'

afterEach(() => {
  setNarrationEngine('kokoro')
  clearNarrationSpeakers()
})

describe('experimental Scylla voice mode', () => {
  it('keeps Kokoro clip ids stable when engine is default', () => {
    const kokoro = narrationIdFor('The evidence is ready.', 'pc', 'female', 'af_bella', 'kokoro')
    expect(kokoro).toBe(narrationIdFor('The evidence is ready.', 'pc', 'female', 'af_bella'))
    expect(naturalVoiceUrlFor('The evidence is ready.', 'pc', 'female', 'af_bella', 'kokoro')).toMatch(
      /narration-kokoro-\d+\//,
    )
  })

  it('routes experimental clips to narration-scylla shards with divergent ids', () => {
    const kokoro = narrationIdFor('The evidence is ready.', 'pc', 'female', 'af_bella', 'kokoro')
    const scylla = narrationIdFor('The evidence is ready.', 'pc', 'female', 'gwen', ALT_VOICE_ENGINE_ID)
    expect(scylla).not.toBe(kokoro)
    expect(
      naturalVoiceUrlFor('The evidence is ready.', 'pc', 'female', 'gwen', ALT_VOICE_ENGINE_ID),
    ).toMatch(new RegExp(`/${ALT_VOICE_RELEASE_PREFIX}-\\d+/${scylla}\\.mp3$`))
  })

  it('assigns unique Scylla voices per gender pool', () => {
    const plan = buildSpeakerVoicePlan({
      cast: [
        { id: 'judge', name: 'Judge Vale' },
        { id: 'pc', name: 'Alex Rivera' },
        { id: 'dc', name: 'Morgan Lee' },
        { id: 'w1', name: 'Casey Ng' },
      ],
      jurors: [{ id: 'J-01', persona: 'retired librarian who trusts paperwork' }],
    })
    const byKey = buildAltVoiceByKey({ genderByKey: plan.genderByKey, keys: plan.keys })
    expect(byKey.get('narrator')).toBe('scylla')
    const values = [...byKey.values()]
    expect(new Set(values).size).toBe(values.length)
  })

  it('normalises unknown engines back to kokoro', () => {
    expect(normaliseNarrationEngine('nope')).toBe('kokoro')
    expect(normaliseNarrationEngine(ALT_VOICE_ENGINE_ID)).toBe(ALT_VOICE_ENGINE_ID)
    setNarrationSpeakers({
      cast: [{ id: 'pc', name: 'Alex Rivera' }],
    })
    setNarrationEngine(ALT_VOICE_ENGINE_ID)
    expect(
      naturalVoiceUrlFor('Order in the court.', 'narrator'),
    ).toContain(`${ALT_VOICE_RELEASE_PREFIX}-`)
  })
})
