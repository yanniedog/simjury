import { createHash } from 'node:crypto'
import { COURT_WEEK_ACTORS } from '../src/courtweek/content/speechReview'
import {
  buildCourtWeekSpeechReviewLedger, type SpeechReviewLedgerRow,
} from '../src/courtweek/content/speechReviewLedger'

export const PRONOUNCEABILITY_POLICY_SCHEMA = 'simjury.court-week-pronounceability/v1' as const
export const PRONOUNCEABILITY_FINDING_KINDS = [
  'speaker-name', 'clock', 'statute', 'identifier', 'abbreviation',
  'homograph', 'all-caps', 'number', 'hyphenated-construction', 'em-dash',
] as const
export type PronounceabilityFindingKind = typeof PRONOUNCEABILITY_FINDING_KINDS[number]

export type PronounceabilityFinding = {
  id: string
  kind: PronounceabilityFindingKind
  actorId: string
  turnId: string | null
  canonicalTextSha256: string
  utf16Start: number
  utf16EndExclusive: number
  tokenStart: number
  tokenEndExclusive: number
  canonical: string
}

export type PronounceabilityDisposition = {
  findingId: string
  canonicalTextSha256: string
  status: 'pending' | 'approved'
  action: 'rewrite-source' | 'retain-reviewed-name' | 'provider-projection'
  spoken?: string
  rationale?: string
  reviewReference?: string
  listeningReference?: string
}

type HazardPattern = { kind: Exclude<PronounceabilityFindingKind, 'speaker-name'>; pattern: RegExp }
const HAZARD_PATTERNS: readonly HazardPattern[] = [
  { kind: 'clock', pattern: /\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/gu },
  { kind: 'statute', pattern: /\bs\s+\d+\b/giu },
  { kind: 'identifier', pattern: /\b[A-Z]{1,4}(?:-\d+)+\b/gu },
  { kind: 'abbreviation', pattern: /\b(?:Dr|Mr|Mrs|Ms)\.?(?=\s|$)/gu },
  { kind: 'all-caps', pattern: /\b[A-Z]{2,}\b/gu },
  { kind: 'number', pattern: /\b\d+(?:\.\d+)?%?(?![\p{L}\p{N}])/gu },
  { kind: 'hyphenated-construction', pattern: /\b[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)+\b/gu },
  { kind: 'em-dash', pattern: /—/gu },
]
const HOMOGRAPHS = new Set([
  'read', 'lead', 'live', 'record', 'close', 'minute', 'does', 'present',
  'refuse', 'separate', 'content', 'resume', 'permit', 'produce', 'subject', 'digest',
])
const wordPattern = /[\p{L}\p{M}]+(?:[’'][\p{L}\p{M}]+)*/gu
const NON_PERSONAL_ACTORS = new Set(['clerk', 'court-officer', 'narrator', 'recorded-channel'])
const namePrefixes = /^(?:Judge|Crown counsel|Defence counsel|Dr)\s+/u
const sha256 = (value: string): string => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
const overlaps = (start: number, end: number, ranges: readonly [number, number][]): boolean =>
  ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart)

function finding(
  kind: PronounceabilityFindingKind,
  actorId: string,
  turnId: string | null,
  source: string,
  start: number,
  end: number,
): PronounceabilityFinding {
  const canonical = source.slice(start, end)
  const canonicalTextSha256 = sha256(source)
  const tokens = [...source.matchAll(/\S+/gu)].map((match) => ({
    start: match.index, end: match.index + match[0].length,
  }))
  const tokenStart = tokens.findIndex((token) => token.end > start)
  let tokenEndExclusive = tokens.findIndex((token) => token.start >= end)
  if (tokenEndExclusive < 0) tokenEndExclusive = tokens.length
  if (tokenStart < 0 || tokenStart >= tokenEndExclusive) throw new Error('Pronounceability finding has no token range')
  return {
    id: sha256(JSON.stringify({
      kind, actorId, turnId, canonicalTextSha256, start, end, tokenStart, tokenEndExclusive, canonical,
    })),
    kind, actorId, turnId, canonicalTextSha256,
    utf16Start: start, utf16EndExclusive: end, tokenStart, tokenEndExclusive, canonical,
  }
}

export function scanPronounceabilityText(
  actorId: string,
  turnId: string,
  text: string,
): PronounceabilityFinding[] {
  const findings: PronounceabilityFinding[] = []
  const occupied: [number, number][] = []
  for (const { kind, pattern } of HAZARD_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      const start = match.index
      const end = start + match[0].length
      if (overlaps(start, end, occupied)) continue
      occupied.push([start, end])
      findings.push(finding(kind, actorId, turnId, text, start, end))
    }
  }
  wordPattern.lastIndex = 0
  for (const match of text.matchAll(wordPattern)) {
    if (!HOMOGRAPHS.has(match[0].toLocaleLowerCase('en-AU'))) continue
    const start = match.index
    const end = start + match[0].length
    if (overlaps(start, end, occupied)) continue
    findings.push(finding('homograph', actorId, turnId, text, start, end))
  }
  return findings.sort((left, right) =>
    left.utf16Start - right.utf16Start || left.kind.localeCompare(right.kind))
}

const scanTurn = (row: SpeechReviewLedgerRow): PronounceabilityFinding[] =>
  scanPronounceabilityText(row.actorId, row.turnId, row.text)

export function buildCourtWeekPronounceabilityAudit(
  rows: readonly SpeechReviewLedgerRow[] = buildCourtWeekSpeechReviewLedger().rows,
) {
  const names = COURT_WEEK_ACTORS.filter(({ id }) => !NON_PERSONAL_ACTORS.has(id)).map((actor) => {
    const personalName = actor.label.replace(namePrefixes, '')
    return finding('speaker-name', actor.id, null, personalName, 0, personalName.length)
  })
  const findings = [...names, ...rows.flatMap(scanTurn)]
  const counts = Object.fromEntries(PRONOUNCEABILITY_FINDING_KINDS.map((kind) => [
    kind, findings.filter((entry) => entry.kind === kind).length,
  ])) as Record<PronounceabilityFindingKind, number>
  const affectedRows = rows.filter((row) => findings.some((entry) =>
    entry.actorId === row.actorId && (entry.turnId === null || entry.turnId === row.turnId)))
  const coverage = {
    actors: new Set(rows.map(({ actorId }) => actorId)).size,
    turns: rows.length,
    runtimeVariants: new Set(rows.flatMap(({ variant }) => variant ? [variant] : [])).size,
  }
  const impact = {
    actorIds: [...new Set(findings.map(({ actorId }) => actorId))].sort(),
    turnIds: [...new Set(affectedRows.map(({ turnId }) => turnId))].sort(),
    cueIds: [...new Set(affectedRows.map(({ cueId }) => cueId))].sort(),
    sourceCueIds: [...new Set(affectedRows.flatMap(({ sourceCueIds }) => sourceCueIds))].sort(),
    captionIds: [...new Set(affectedRows.flatMap(({ captionIds }) => captionIds))].sort(),
    runtimeVariants: [...new Set(affectedRows.flatMap(({ variant }) => variant ? [variant] : []))].sort(),
  }
  const payload = {
    schema: PRONOUNCEABILITY_POLICY_SCHEMA, locale: 'en-AU' as const,
    coverage, counts, findings, impact,
  }
  return { ...payload, auditDigest: sha256(JSON.stringify(payload)) }
}

export function assessPronounceability(
  findings: readonly PronounceabilityFinding[],
  dispositions: readonly PronounceabilityDisposition[],
) {
  const byId = new Map(findings.map((entry) => [entry.id, entry]))
  const dispositionIds = dispositions.map(({ findingId }) => findingId)
  if (new Set(dispositionIds).size !== dispositionIds.length) throw new Error('Pronounceability dispositions must be unique')
  for (const disposition of dispositions) {
    const target = byId.get(disposition.findingId)
    if (!target) throw new Error(`${disposition.findingId}: stale or unknown pronounceability finding`)
    if (disposition.canonicalTextSha256 !== target.canonicalTextSha256) {
      throw new Error(`${disposition.findingId}: canonical text digest is stale`)
    }
    if (disposition.action === 'retain-reviewed-name' && target.kind !== 'speaker-name') {
      throw new Error(`${disposition.findingId}: only a speaker name may be retained after review`)
    }
    if (disposition.action === 'provider-projection' && !['statute', 'identifier'].includes(target.kind)) {
      throw new Error(`${disposition.findingId}: provider projections are limited to statutes and identifiers`)
    }
    if (disposition.action === 'rewrite-source' && disposition.status === 'approved') {
      throw new Error(`${disposition.findingId}: a source rewrite remains unresolved until the finding disappears`)
    }
    if (disposition.status === 'approved' && (
      !disposition.reviewReference?.trim() || !disposition.listeningReference?.trim()
    )) {
      throw new Error(`${disposition.findingId}: approved pronunciation needs review and listening references`)
    }
    if (disposition.action === 'provider-projection' && (
      !disposition.spoken?.trim() || disposition.spoken === target.canonical || !disposition.rationale?.trim()
    )) throw new Error(`${disposition.findingId}: provider projection needs distinct spoken text and rationale`)
    if (disposition.spoken && !/^[\p{L}\p{M}]+(?:[ ’'-][\p{L}\p{M}]+)*$/u.test(disposition.spoken)) {
      throw new Error(`${disposition.findingId}: spoken projection must use ordinary words`)
    }
  }
  const decisions = new Map(dispositions.map((entry) => [entry.findingId, entry]))
  const unresolved = findings.filter(({ id }) => decisions.get(id)?.status !== 'approved')
  return { allowed: unresolved.length === 0, unresolvedFindingIds: unresolved.map(({ id }) => id) }
}
