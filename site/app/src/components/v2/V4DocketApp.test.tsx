import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocketCaseV4 } from '../../lib/v2/caseSchema'
import { v4CourtroomCompatibilityIssue } from '../../lib/v2/v4CourtroomCompatibility'
import { V4JuryRoomUnavailable } from './V4DocketApp'

describe('V4 jury-room boundary', () => {
  it('stops explicitly instead of substituting the V3 room or revealing an answer', () => {
    const markup = renderToStaticMarkup(<V4JuryRoomUnavailable status="ready" />)

    expect(markup).toContain('new authored jury-room format')
    expect(markup).toContain('will not substitute the older hidden-weight room')
    expect(markup).not.toMatch(/reference verdict|guilty|not guilty/i)
  })

  it('fails closed before an authored interjection can be silently omitted', () => {
    const trial = {
      id: 'dd-v4-guard',
      beats: [{
        id: 'b1',
        interjections: [{ id: 'obj-1' }],
      }],
    } as unknown as Pick<DocketCaseV4, 'id' | 'beats'>

    expect(v4CourtroomCompatibilityIssue(trial)).toBe(
      'V4 case dd-v4-guard cannot open safely: beat b1 contains courtroom interjections, but the ordered player is not installed.',
    )
    expect(v4CourtroomCompatibilityIssue({
      ...trial,
      beats: [{ ...trial.beats[0], interjections: [] }],
    })).toBeNull()
  })
})
