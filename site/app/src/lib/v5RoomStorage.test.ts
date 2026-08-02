// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { ClientDeliberationPack } from './v2/caseBundles'
import { REASONING_MODELS } from '../engine/deliberationPackV5'
import { createV5Session } from '../engine/v5RoomSession'
import { clearV5Room, loadV5Room, saveV5Room } from './v5RoomStorage'

const revision = 'dd-0098@1234abcd'
const pack = {
  schema_version: 5,
  case_id: 'dd-0098',
  case_revision: revision,
  issues: [],
  evidence: [],
  propositions: [],
  responseMoves: [],
  reasoning_profiles: REASONING_MODELS.map((reasoning_model, index) => ({
    seat: index + 1,
    reasoning_model,
    display_name: index ? `Juror ${index + 1}` : 'You',
    baseline_position: 'U' as const,
    element_weights: {},
    change_threshold: 0.5,
    question_style: 'careful' as const,
  })),
} satisfies ClientDeliberationPack

describe('V5 room storage', () => {
  beforeEach(() => localStorage.clear())

  it('loads only the exact case revision and clears independently', () => {
    const session = createV5Session(revision, pack)
    saveV5Room(42, session)
    expect(loadV5Room(42, revision)).toEqual(session)
    expect(loadV5Room(42, 'dd-0098@ffffffff')).toBeNull()
    clearV5Room(42)
    expect(loadV5Room(42, revision)).toBeNull()
  })
})
