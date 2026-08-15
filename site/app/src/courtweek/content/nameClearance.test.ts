import { describe, expect, it } from 'vitest'
import {
  assessCourtWeekNameClearance,
  courtWeekNameProposalDigest,
  COURT_WEEK_NAME_POLICY_SOURCES,
  COURT_WEEK_NAME_PROPOSALS,
  type CourtWeekNameProposal,
} from './nameClearance'
import { buildCourtWeekSpeechReviewLedger } from './speechReviewLedger'

const proposals = (): CourtWeekNameProposal[] => COURT_WEEK_NAME_PROPOSALS.map((entry) => ({ ...entry }))
const replace = (
  values: CourtWeekNameProposal[], actorId: CourtWeekNameProposal['actorId'],
  changes: Partial<CourtWeekNameProposal>,
): CourtWeekNameProposal[] => values.map((entry) => entry.actorId === actorId ? { ...entry, ...changes } : entry)

describe('inactive Court Week name-clearance ledger', () => {
  it('covers every candidate turn, actor, day and dynamic Sunday variant deterministically', () => {
    const first = assessCourtWeekNameClearance()
    expect(assessCourtWeekNameClearance()).toEqual(first)
    expect(first.coverage).toEqual({ actors: 28, turns: 288, runtimeVariants: 11, days: 7 })
    expect(first.candidateDigest).toBe('sha256:2ee734a3bfa9f8e9470fc766c510401b8c1ac8dbec2758ff648adb90542013f5')
    expect(first.proposalDigest).toBe('sha256:5adca2f355c6eba6dca15c9c199f56dbafe97de0aef60329ca1b4c9f36c1f94b')
    expect(first.reviewRows).toHaveLength(28)
    expect(first.reviewRows.reduce((sum, row) => sum + row.candidateTurnCount, 0)).toBe(288)
    expect(first.reviewRows.find(({ actorId }) => actorId === 'edda-rook')).toMatchObject({
      candidateDisplayLabels: ['Foreperson Edda Rook', 'Edda Rook'],
      projectedDisplayLabels: ['Foreperson Michelle Grant', 'Michelle Grant'],
    })
    expect(first.reviewRows.find(({ actorId }) => actorId === 'accused')).toMatchObject({ dialogueReferenceCount: 63 })
    expect(first.allowed).toBe(false)
    expect(first.pendingActorIds).toHaveLength(24)
  })

  it('fails closed on missing, reordered, stale or incompletely covered actors', () => {
    expect(() => assessCourtWeekNameClearance(proposals().slice(1))).toThrow(/cover the actor registry once/i)
    const reordered = proposals(); [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!]
    expect(() => assessCourtWeekNameClearance(reordered)).toThrow(/governance order/i)
    expect(() => assessCourtWeekNameClearance(replace(proposals(), 'judge', {
      currentDisplayLabel: 'Judge changed outside the registry',
    }))).toThrow(/registry has drifted/i)
    const rows = buildCourtWeekSpeechReviewLedger().rows.filter(({ actorId }) => actorId !== 'recorded-channel')
    expect(() => assessCourtWeekNameClearance(proposals(), rows)).toThrow(/every candidate actor/i)
  })

  it('rejects malformed, duplicate and orthographically confusable proposals', () => {
    expect(() => assessCourtWeekNameClearance(replace(proposals(), 'accused', {
      proposedPersonalName: 'Mara Venn', proposedDisplayLabel: 'Mara Venn',
    }))).toThrow(/malformed or unchanged/i)
    expect(() => assessCourtWeekNameClearance(replace(proposals(), 'accused', {
      proposedPersonalName: 'Priya Shah', proposedDisplayLabel: 'Priya Shah',
    }))).toThrow(/must be unique/i)
    expect(() => assessCourtWeekNameClearance(replace(proposals(), 'accused', {
      proposedPersonalName: 'Claire Shad', proposedDisplayLabel: 'Claire Shad',
    }))).toThrow(/orthographically confusable/i)
    expect(() => assessCourtWeekNameClearance(replace(proposals(), 'judge', {
      proposedPersonalName: 'Sell Ayven /sɛl/', proposedDisplayLabel: 'Judge Sell Ayven /sɛl/',
    }))).toThrow(/malformed/i)
    expect(() => assessCourtWeekNameClearance(replace(proposals(), 'judge', {
      proposedDisplayLabel: 'Judge unrelated label',
    }))).toThrow(/disagrees with its personal name/i)
    expect(() => assessCourtWeekNameClearance(replace(proposals(), 'judge', {
      status: 'not-applicable',
    }))).toThrow(/functional name or status/i)
    expect(() => assessCourtWeekNameClearance(replace(proposals(), 'accused', {
      proposedPersonalName: 'Court Officer', proposedDisplayLabel: 'Court Officer',
    }))).toThrow(/display labels must be unique/i)
  })

  it('requires proposal-bound search, cultural, listening and legal-copy evidence before approval', () => {
    expect(() => assessCourtWeekNameClearance(replace(proposals(), 'judge', {
      status: 'approved',
    }))).toThrow(/complete clearance evidence/i)
    const approved = proposals().map((entry): CourtWeekNameProposal => entry.status === 'not-applicable' ? entry : ({
      ...entry, status: 'approved', evidence: {
        proposalSha256: courtWeekNameProposalDigest(entry),
        identitySearchReference: `identity:${entry.actorId}`,
        culturalReviewReference: `cultural:${entry.actorId}`,
        pronunciationListeningReference: `listening:${entry.actorId}`,
        legalCopyReviewReference: `legal-copy:${entry.actorId}`,
      },
    }))
    expect(assessCourtWeekNameClearance(approved)).toMatchObject({ allowed: true, pendingActorIds: [] })
    const stale = replace(approved, 'judge', {
      evidence: { ...approved[0]!.evidence!, proposalSha256: `sha256:${'0'.repeat(64)}` },
    })
    expect(() => assessCourtWeekNameClearance(stale)).toThrow(/evidence is stale/i)
    expect(() => assessCourtWeekNameClearance(replace(proposals(), 'judge', {
      evidence: approved[0]!.evidence,
    }))).toThrow(/only approved proposals may carry evidence/i)
  })

  it('pins only primary Australian policy sources for the pending proposal', () => {
    expect(COURT_WEEK_NAME_POLICY_SOURCES).toHaveLength(4)
    for (const source of COURT_WEEK_NAME_POLICY_SOURCES) {
      const url = new URL(source)
      expect(url.protocol).toBe('https:')
      expect(['www.stylemanual.gov.au', 'www.supremecourt.vic.gov.au', 'www.abs.gov.au']).toContain(url.hostname)
    }
  })
})
