import { describe, expect, it } from 'vitest'
import { hasSemanticUnlockModuleReference } from './sealed-build-names'

describe('sealed build semantic module names', () => {
  it.each([
    'day01_key.js',
    'day01Unlock.js',
    'sealed_keys.js',
    'dayseven.js',
    'unlock01.js',
    'assets/Monday-key.js',
    'sealed/keys/value.js',
    'lockedKey.js',
  ])('rejects %s', (name) => {
    expect(hasSemanticUnlockModuleReference(name)).toBe(true)
  })

  it.each([
    'unlockAt',
    'Monday opens at 08:30.',
    'assets/Cx0tF2Hc.js',
  ])('allows ordinary schedule or opaque text %s', (value) => {
    expect(hasSemanticUnlockModuleReference(value)).toBe(false)
  })
})
