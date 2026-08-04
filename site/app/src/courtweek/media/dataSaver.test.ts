import { describe, expect, it } from 'vitest'
import {
  courtWeekMediaPolicy,
  cueForMediaPolicy,
  navigatorRequestsDataSaver,
  nextCueForMediaPolicy,
} from './dataSaver'

describe('Court Week data-saver policy', () => {
  it('honours the browser save-data signal without guessing from user agent', () => {
    expect(navigatorRequestsDataSaver({ userAgent: 'test', connection: { saveData: true } })).toBe(true)
    expect(navigatorRequestsDataSaver({ userAgent: 'test', connection: { saveData: false } })).toBe(false)
    expect(navigatorRequestsDataSaver({ userAgent: 'test' })).toBe(false)
  })

  it('requires narration approval and always disables background media', () => {
    const refused = courtWeekMediaPolicy(true, false)
    expect(refused).toEqual({
      dataSaver: true,
      recordedNarration: false,
      preloadNextScene: false,
      ambience: false,
    })
    expect(courtWeekMediaPolicy(true, true)).toEqual({
      dataSaver: true,
      recordedNarration: true,
      preloadNextScene: false,
      ambience: false,
    })
    const cue = { id: 'cue-1', audio: { opus: 'https://example.test/cue.opus' } }
    expect(cueForMediaPolicy(cue, refused)).toEqual({ id: 'cue-1', audio: undefined })
    expect(cueForMediaPolicy(cue, courtWeekMediaPolicy(true, true))).toBe(cue)
    expect(nextCueForMediaPolicy(cue, courtWeekMediaPolicy(true, true))).toBeUndefined()
    expect(nextCueForMediaPolicy(cue, courtWeekMediaPolicy(false, false))).toBe(cue)
  })
})
