import { describe, expect, it } from 'vitest'
import { storyParagraphs } from './storyText'

describe('storyParagraphs', () => {
  it('chunks prose without changing decimal values', () => {
    expect(storyParagraphs('It was worth 1.1 million. That changed everything. Then she called.')).toEqual([
      'It was worth 1.1 million. That changed everything.',
      'Then she called.',
    ])
  })

  it('returns no paragraphs for blank copy', () => {
    expect(storyParagraphs('   ')).toEqual([])
  })
})
