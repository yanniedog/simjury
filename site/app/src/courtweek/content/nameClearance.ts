import { createHash } from 'node:crypto'
import { buildCourtWeekSpeechReviewLedger, type SpeechReviewLedgerRow } from './speechReviewLedger'
import { COURT_WEEK_ACTORS, type ActorId, type ActorRole } from './speechReview'

export const COURT_WEEK_NAME_CLEARANCE_SCHEMA = 'simjury.court-week-name-clearance/v1' as const
export const COURT_WEEK_NAME_POLICY_SOURCES = [
  'https://www.stylemanual.gov.au/grammar-punctuation-and-conventions/names-and-terms/personal-names',
  'https://www.supremecourt.vic.gov.au/areas/legal-resources/practice-notes/sc-gen-21-appearing-in-court',
  'https://www.supremecourt.vic.gov.au/going-to-court/how-to-address-a-judge',
  'https://www.abs.gov.au/statistics/people/people-and-communities/cultural-diversity-census/2021',
] as const

type ClearanceEvidence = {
  proposalSha256: string
  identitySearchReference: string
  culturalReviewReference: string
  pronunciationListeningReference: string
  legalCopyReviewReference: string
}

export type CourtWeekNameProposal = {
  actorId: ActorId
  role: ActorRole
  currentDisplayLabel: string
  currentPersonalName: string | null
  proposedPersonalName: string | null
  proposedDisplayLabel: string
  status: 'pending' | 'approved' | 'rejected' | 'not-applicable'
  evidence: ClearanceEvidence | null
}

const FUNCTIONAL_ACTORS = new Set<ActorId>(['clerk', 'court-officer', 'narrator', 'recorded-channel'])
const TITLE_PREFIX = /^(?:Judge|Crown counsel|Defence counsel|Dr)\s+/u
const NAME_PATTERN = /^[\p{L}\p{M}]+(?:[\p{L}\p{M}\u2019'-]*[\p{L}\p{M}])?(?: [\p{L}\p{M}]+(?:[\p{L}\p{M}\u2019'-]*[\p{L}\p{M}])?){1,3}$/u
const RESERVED_NAME_WORDS = new Set(['judge', 'crown', 'defence', 'clerk', 'officer', 'narrator', 'channel', 'foreperson'])
const sha256 = (value: string): string => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
const actorById = new Map(COURT_WEEK_ACTORS.map((actor) => [actor.id, actor]))
const canonicalSpeechReviewRows = buildCourtWeekSpeechReviewLedger().rows

export function courtWeekNameProposalDigest(entry: CourtWeekNameProposal): string {
  return sha256(JSON.stringify({
    actorId: entry.actorId, currentDisplayLabel: entry.currentDisplayLabel,
    proposedDisplayLabel: entry.proposedDisplayLabel, proposedPersonalName: entry.proposedPersonalName,
  }))
}

function clearanceEvidenceDigest(evidence: ClearanceEvidence): string {
  return sha256(JSON.stringify({
    proposalSha256: evidence.proposalSha256, identitySearchReference: evidence.identitySearchReference,
    culturalReviewReference: evidence.culturalReviewReference,
    pronunciationListeningReference: evidence.pronunciationListeningReference,
    legalCopyReviewReference: evidence.legalCopyReviewReference,
  }))
}

function person(actorId: ActorId, proposedPersonalName: string): CourtWeekNameProposal {
  const actor = actorById.get(actorId)!
  const currentPersonalName = actor.label.replace(TITLE_PREFIX, '')
  if (currentPersonalName === actor.label && FUNCTIONAL_ACTORS.has(actorId)) throw new Error(`${actorId}: functional actor is not a person`)
  return {
    actorId, role: actor.role, currentDisplayLabel: actor.label, currentPersonalName,
    proposedPersonalName, proposedDisplayLabel: actor.label.replace(currentPersonalName, proposedPersonalName),
    status: 'pending', evidence: null,
  }
}

function functional(actorId: ActorId): CourtWeekNameProposal {
  const actor = actorById.get(actorId)!
  return {
    actorId, role: actor.role, currentDisplayLabel: actor.label, currentPersonalName: null,
    proposedPersonalName: null, proposedDisplayLabel: actor.label, status: 'not-applicable', evidence: null,
  }
}

/** Inactive proposals only. ActorIds remain stable and no value feeds sessions, packs, media or runtime. */
export const COURT_WEEK_NAME_PROPOSALS: readonly CourtWeekNameProposal[] = [
  person('judge', 'Helen Mercer'),
  functional('clerk'),
  functional('court-officer'),
  person('crown-counsel', 'Priya Shah'),
  person('defence-counsel', 'Daniel Brooks'),
  person('accused', 'Claire Donnelly'),
  person('ilan-saye', 'Noah Okafor'),
  person('nella-orr', 'Leonie Havers'),
  person('peli-dorn', 'Jordan Nguyen'),
  person('tovan-mir', 'Michael Farrow'),
  person('jaro-pell', 'Samuel Ortega'),
  person('eren-vos', 'Anika Rao'),
  person('oren-vale', 'Peter Wallace'),
  person('tali-rusk', 'Hannah Collins'),
  person('sera-quill', 'Rebecca Chen'),
  person('edda-rook', 'Michelle Grant'),
  person('niko-hale', 'Aaron Singh'),
  person('lina-fei', 'Chloe Bennett'),
  person('ari-tem', 'Lucas Ibrahim'),
  person('sola-iven', 'Zoe McKenzie'),
  person('bram-tey', 'Nathan Wu'),
  person('kessa-noor', 'Felicity Byrne'),
  person('daro-sen', 'Dominic Russo'),
  person('yara-merrow', 'Grace Adeyemi'),
  person('toma-reed', 'Cameron Li'),
  person('omri-cade', 'Evelyn Parker'),
  functional('narrator'),
  functional('recorded-channel'),
]

function normalized(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-AU')
    .replace(/[\u2019']/gu, '').replace(/[^\p{L}]+/gu, '')
}

const nameComponents = (value: string): string[] => value.split(/[\s\u2019'-]+/u).map(normalized).filter(Boolean)

function editDistance(left: string, right: string): number {
  const rightLength = [...right].length
  const prior = Array.from({ length: rightLength + 1 }, (_, index) => index)
  for (const [leftIndex, leftCharacter] of [...left].entries()) {
    let diagonal = leftIndex; prior[0] = leftIndex + 1
    for (const [rightIndex, rightCharacter] of [...right].entries()) {
      const above = prior[rightIndex + 1]!
      prior[rightIndex + 1] = Math.min(above + 1, prior[rightIndex]! + 1, diagonal + (leftCharacter === rightCharacter ? 0 : 1))
      diagonal = above
    }
  }
  return prior[rightLength]!
}

function orthographicallyConfusable(left: string, right: string): boolean {
  return left === right || Math.min([...left].length, [...right].length) > 1 && editDistance(left, right) <= 1
}

function projectDisplayLabel(label: string, proposal: CourtWeekNameProposal): string {
  if (!proposal.currentPersonalName || !proposal.proposedPersonalName) return label
  if (!label.endsWith(proposal.currentPersonalName)) throw new Error(`${proposal.actorId}: candidate label cannot be projected`)
  return label.slice(0, -proposal.currentPersonalName.length) + proposal.proposedPersonalName
}

function referenceCount(rows: readonly SpeechReviewLedgerRow[], name: string): number {
  const references = [name, ...name.split(' ')].sort((left, right) => right.length - left.length)
  return rows.reduce((count, row) => {
    const occupied: [number, number][] = []
    for (const reference of references) {
      const pattern = new RegExp(`(?<![\\p{L}\\p{M}])${reference.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![\\p{L}\\p{M}])`, 'gu')
      for (const match of row.text.matchAll(pattern)) {
        const range: [number, number] = [match.index, match.index + match[0].length]
        if (!occupied.some(([start, end]) => range[0] < end && range[1] > start)) occupied.push(range)
      }
    }
    return count + occupied.length
  }, 0)
}

function assertDistinctPersonalNames(proposals: readonly CourtWeekNameProposal[]): void {
  const people = proposals.filter((entry) => entry.proposedPersonalName)
  const exact = people.map((entry) => normalized(entry.proposedPersonalName!))
  if (new Set(exact).size !== exact.length) throw new Error('Proposed personal names must be unique')
  const displayLabels = proposals.map(({ proposedDisplayLabel }) => normalized(proposedDisplayLabel))
  if (new Set(displayLabels).size !== displayLabels.length) throw new Error('Proposed display labels must be unique')
  for (const [index, left] of people.entries()) for (const right of people.slice(index + 1)) {
    const leftParts = nameComponents(left.proposedPersonalName!); const rightParts = nameComponents(right.proposedPersonalName!)
    if (leftParts.some((leftPart) => rightParts.some((rightPart) => orthographicallyConfusable(leftPart, rightPart)))) {
      throw new Error(`${left.actorId}/${right.actorId}: proposed names are orthographically confusable`)
    }
  }
}

export function assessCourtWeekNameClearance(
  proposals: readonly CourtWeekNameProposal[] = COURT_WEEK_NAME_PROPOSALS,
  rows: readonly SpeechReviewLedgerRow[] = canonicalSpeechReviewRows,
) {
  const expectedIds = COURT_WEEK_ACTORS.map(({ id }) => id)
  if (JSON.stringify(proposals.map(({ actorId }) => actorId)) !== JSON.stringify(expectedIds)) {
    throw new Error('Name proposals must cover the actor registry once, in governance order')
  }
  if (JSON.stringify([...new Set(rows.map(({ actorId }) => actorId))].sort()) !== JSON.stringify([...expectedIds].sort())) {
    throw new Error('Name proposals do not cover every candidate actor')
  }
  if (JSON.stringify(rows) !== JSON.stringify(canonicalSpeechReviewRows)) {
    throw new Error('Name clearance requires the complete canonical speech-review ledger')
  }
  const reviewRows = proposals.map((entry) => {
    const actor = actorById.get(entry.actorId)!
    if (entry.role !== actor.role || entry.currentDisplayLabel !== actor.label) throw new Error(`${entry.actorId}: actor registry has drifted`)
    const actorRows = rows.filter(({ actorId }) => actorId === entry.actorId)
    const personal = !FUNCTIONAL_ACTORS.has(entry.actorId)
    const registryPersonalName = personal ? actor.label.replace(TITLE_PREFIX, '') : null
    if (personal && (entry.currentPersonalName !== registryPersonalName || !entry.proposedPersonalName)) {
      throw new Error(`${entry.actorId}: personal-name fields disagree with the actor registry`)
    }
    if (!personal && (entry.currentPersonalName !== null || entry.proposedPersonalName !== null)) {
      throw new Error(`${entry.actorId}: functional actors must keep personal-name fields null`)
    }
    if (personal && (!NAME_PATTERN.test(entry.proposedPersonalName!) || entry.proposedPersonalName === entry.currentPersonalName)) {
      throw new Error(`${entry.actorId}: proposed personal name is malformed or unchanged`)
    }
    if (personal && (entry.status === 'not-applicable' || nameComponents(entry.proposedPersonalName!).some((word) => RESERVED_NAME_WORDS.has(word)))) {
      throw new Error(`${entry.actorId}: personal proposal uses a functional name or status`)
    }
    if (personal && projectDisplayLabel(actor.label, entry) !== entry.proposedDisplayLabel) {
      throw new Error(`${entry.actorId}: proposed display label disagrees with its personal name`)
    }
    if (!personal && (entry.status !== 'not-applicable' || entry.proposedDisplayLabel !== actor.label || entry.evidence)) {
      throw new Error(`${entry.actorId}: functional labels must remain unchanged and need no clearance`)
    }
    for (const row of actorRows) projectDisplayLabel(row.displayLabel, entry)
    if (entry.status === 'approved') {
      const evidence = entry.evidence
      if (!evidence || Object.values(evidence).some((value) => !value.trim())) throw new Error(`${entry.actorId}: approval needs complete clearance evidence`)
      if (evidence.proposalSha256 !== courtWeekNameProposalDigest(entry)) throw new Error(`${entry.actorId}: clearance evidence is stale`)
    } else if (personal && entry.evidence) throw new Error(`${entry.actorId}: only approved proposals may carry evidence`)
    return {
      actorId: entry.actorId, currentDisplayLabel: entry.currentDisplayLabel,
      proposedDisplayLabel: entry.proposedDisplayLabel, status: entry.status,
      evidenceDigest: entry.evidence ? clearanceEvidenceDigest(entry.evidence) : null,
      candidateTurnCount: actorRows.length,
      candidateDisplayLabels: [...new Set(actorRows.map(({ displayLabel }) => displayLabel))],
      projectedDisplayLabels: [...new Set(actorRows.map(({ displayLabel }) => projectDisplayLabel(displayLabel, entry)))],
      dialogueReferenceCount: entry.currentPersonalName ? referenceCount(rows, entry.currentPersonalName) : 0,
    }
  })
  assertDistinctPersonalNames(proposals)
  const pendingActorIds = proposals.filter(({ status }) => status !== 'approved' && status !== 'not-applicable').map(({ actorId }) => actorId)
  const coverage = {
    actors: expectedIds.length, turns: rows.length,
    runtimeVariants: new Set(rows.flatMap(({ variant }) => variant ? [variant] : [])).size,
    days: new Set(rows.map(({ day }) => day)).size,
  }
  const candidateDigest = sha256(JSON.stringify(rows.map(({ turnId, actorId, displayLabel, text, variant }) => ({ turnId, actorId, displayLabel, text, variant }))))
  const payload = { schema: COURT_WEEK_NAME_CLEARANCE_SCHEMA, sources: COURT_WEEK_NAME_POLICY_SOURCES, coverage, candidateDigest, reviewRows }
  return { ...payload, proposalDigest: sha256(JSON.stringify(payload)), allowed: pendingActorIds.length === 0, pendingActorIds }
}
