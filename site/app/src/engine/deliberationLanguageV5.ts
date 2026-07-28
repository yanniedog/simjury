import type {
  ArgumentFrame,
  BeliefState,
  DialogueAct,
  VotePosition,
} from './deliberationV5'

export interface LanguageConcept {
  id: string
  label: string
  aliases: string[]
}

export interface IssueConcept extends LanguageConcept {
  elementId?: string
}

export interface EvidenceConcept extends LanguageConcept {
  issueIds: string[]
}

export interface PropositionConcept extends LanguageConcept {
  issueId: string
  position: VotePosition
  evidenceIds: string[]
}

export interface ResponseMove {
  id: string
  issueIds: string[]
  acts: DialogueAct[]
  positions: VotePosition[]
  text: string
}

export interface DeliberationLanguagePack {
  caseId: string
  issues: IssueConcept[]
  evidence: EvidenceConcept[]
  propositions: PropositionConcept[]
  responseMoves: ResponseMove[]
}

export interface Understanding {
  frame: ArgumentFrame
  playerText: string
  paraphrase: string
  confidence: number
  needsClarification: boolean
  clarification: string | null
}

export interface PlannedReply {
  seat: number
  moveId: string | null
  kind: 'engage' | 'clarify'
  text: string
}

const STOP = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'i',
  'if', 'in', 'is', 'it', 'me', 'of', 'on', 'or', 'that', 'the', 'their',
  'they', 'this', 'to', 'was', 'we', 'were', 'what', 'with', 'you',
])

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\b(can't|cannot)\b/g, 'can not')
    .replace(/\b(don't|doesn't|didn't)\b/g, 'does not')
    .replace(/\b(isn't|wasn't|weren't)\b/g, 'is not')
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(' ').filter((token) => token.length > 1 && !STOP.has(token)))
}

function overlapScore(input: string, inputTokens: Set<string>, concept: LanguageConcept): number {
  const phrases = [concept.label, ...concept.aliases].map(normalize).filter(Boolean)
  let score = 0
  for (const phrase of phrases) {
    if (` ${input} `.includes(` ${phrase} `)) {
      score = Math.max(score, phrase.includes(' ') ? 8 : 5)
    }
    const phraseTokens = tokens(phrase)
    let overlap = 0
    for (const token of phraseTokens) if (inputTokens.has(token)) overlap++
    if (phraseTokens.size > 0) score = Math.max(score, (overlap / phraseTokens.size) * 4)
  }
  return score
}

function bestMatch<T extends LanguageConcept>(
  input: string,
  inputTokens: Set<string>,
  concepts: T[],
): { concept?: T; score: number } {
  return concepts
    .map((concept) => ({ concept, score: overlapScore(input, inputTokens, concept) }))
    .sort((a, b) => b.score - a.score || a.concept.id.localeCompare(b.concept.id))[0]
    ?? { score: 0 }
}

function positionOf(input: string): VotePosition {
  if (
    /\b(not guilty|reasonable doubt|not sure|not convinced|does not.{0,48}\bproves?|did not.{0,48}\bproves?|not think.{0,48}\b(guilty|proved|proves|convinced))\b/.test(input)
  ) return 'NG'
  if (/\b(undecided|unsure|do not know|can not decide|not certain)\b/.test(input)) return 'U'
  if (/\b(guilty|proved|convinced)\b/.test(input)) {
    return /\b(not|never|hardly)\b.{0,24}\b(guilty|proved|convinced)\b/.test(input) ? 'NG' : 'G'
  }
  return 'U'
}

function actOf(input: string): DialogueAct {
  if (/\b(reconcile|fit together|square that)\b/.test(input)) return 'ask_reconcile'
  if (/\b(source|authentic|provenance|chain of custody|tamper)\b/.test(input)) return 'challenge_source'
  if (/\b(does not.{0,48}\bproves?|leap|assumption|infer|inference)\b/.test(input)) return 'challenge_inference'
  if (/\b(what if|someone else|another person|alternative|could have)\b/.test(input)) return 'raise_alternative'
  if (/\b(disagree|does not follow|do not accept)\b/.test(input)) return 'disagree'
  if (/\b(agree|same point|that is right)\b/.test(input)) return 'agree'
  if (/\b(which|what)\b.{0,18}\b(evidence|exhibit|record)\b/.test(input)) return 'ask_evidence'
  if (/\b(element|ingredient|must prove|charge require)\b/.test(input)) return 'ask_element'
  if (/\b(why|how come|reason)\b/.test(input) || input.endsWith('?')) return 'ask_reason'
  if (/\b(together|combined|because|therefore)\b/.test(input)) return 'connect_evidence'
  return 'assert'
}

function stableId(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `player-${(hash >>> 0).toString(36)}`
}

function shortQuote(text: string): string {
  const words = text.trim().replace(/\s+/g, ' ').split(' ')
  return `${words.slice(0, 14).join(' ')}${words.length > 14 ? '…' : ''}`
}

export function understandContribution(
  rawText: string,
  pack: DeliberationLanguagePack,
  targetSeat?: number,
): Understanding {
  const playerText = rawText.trim().slice(0, 500)
  const input = normalize(playerText)
  const inputTokens = tokens(input)
  const issue = bestMatch(input, inputTokens, pack.issues)
  const proposition = bestMatch(input, inputTokens, pack.propositions)
  const matchedEvidence = pack.evidence
    .map((concept) => ({ concept, score: overlapScore(input, inputTokens, concept) }))
    .filter(({ score }) => score >= 4)
    .sort((a, b) => b.score - a.score || a.concept.id.localeCompare(b.concept.id))
    .slice(0, 3)
    .map(({ concept }) => concept.id)
  const propositionWins = proposition.score >= issue.score && proposition.score >= 4
  const evidenceIssues = new Set(
    pack.evidence
      .filter(({ id }) => matchedEvidence.includes(id))
      .flatMap(({ issueIds }) => issueIds),
  )
  const issueId = propositionWins
    ? proposition.concept?.issueId
    : issue.score >= 3
      ? issue.concept?.id
      : evidenceIssues.size === 1
        ? [...evidenceIssues][0]
        : undefined
  const confidence = Math.min(1, (
    Math.max(issue.score, proposition.score) + Math.min(3, matchedEvidence.length * 1.5)
  ) / 10)
  const label = pack.issues.find(({ id }) => id === issueId)?.label
  const needsClarification = !playerText || confidence < 0.35
  const options = pack.issues.slice(0, 3).map(({ label: option }) => option).join(', ')
  const paraphrase = label
    ? `You are raising ${label.toLowerCase()}${matchedEvidence.length ? ' and linked evidence' : ''}.`
    : `You raised your own concern: “${shortQuote(playerText)}”`

  return {
    playerText,
    paraphrase,
    confidence,
    needsClarification,
    clarification: needsClarification
      ? `I don't want to put words in your mouth. Is that about ${options || 'the evidence, an element of the charge, or another explanation'}?`
      : null,
    frame: {
      id: stableId(input),
      act: actOf(input),
      targetSeat,
      issueId,
      propositionId: propositionWins ? proposition.concept?.id : undefined,
      elementId: pack.issues.find(({ id }) => id === issueId)?.elementId,
      evidenceIds: matchedEvidence,
      relation: actOf(input) === 'raise_alternative' || actOf(input) === 'challenge_inference'
        ? 'undermines'
        : matchedEvidence.length > 1 ? 'supports' : undefined,
      position: positionOf(input),
      certainty: Math.max(0.15, confidence),
      negated: /\b(no|not|never|does not|can not)\b/.test(input),
    },
  }
}

function fillTemplate(text: string, understanding: Understanding, pack: DeliberationLanguagePack): string {
  const issue = pack.issues.find(({ id }) => id === understanding.frame.issueId)?.label ?? 'that concern'
  const evidence = pack.evidence.find(({ id }) => understanding.frame.evidenceIds.includes(id))?.label ?? 'the evidence'
  return text
    .split('{issue}').join(issue)
    .split('{evidence}').join(evidence)
    .split('{point}').join(shortQuote(understanding.playerText))
}

export function planJurorReplies(
  understanding: Understanding,
  pack: DeliberationLanguagePack,
  beliefs: BeliefState[],
  recentMoveIds: string[] = [],
): PlannedReply[] {
  const target = understanding.frame.targetSeat
  const candidates = beliefs.filter(({ seat }) => target === undefined || seat === target)
  const orderedSeats = [...candidates].sort((a, b) => {
    const key = understanding.frame.elementId
    const aIssue = key ? Math.abs(a.elements[key] ?? 0) : 0
    const bIssue = key ? Math.abs(b.elements[key] ?? 0) : 0
    return bIssue - aIssue || a.seat - b.seat
  })
  const seat = orderedSeats[0]?.seat ?? 1

  if (understanding.needsClarification) {
    return [{ seat, moveId: null, kind: 'clarify', text: understanding.clarification! }]
  }

  const recent = new Set(recentMoveIds.slice(-8))
  const ranked = pack.responseMoves
    .filter((move) => !recent.has(move.id))
    .map((move) => {
      let score = 0
      if (understanding.frame.issueId && move.issueIds.includes(understanding.frame.issueId)) score += 6
      if (move.acts.includes(understanding.frame.act)) score += 4
      if (score > 0 && move.positions.includes(understanding.frame.position)) score += 2
      return { move, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.move.id.localeCompare(b.move.id))

  if (!ranked.length) {
    return [{
      seat,
      moveId: null,
      kind: 'engage',
      text: `${understanding.paraphrase} Which part of that should we test first?`,
    }]
  }
  return ranked.slice(0, 2).map(({ move }, index) => ({
    seat: orderedSeats[index]?.seat ?? seat,
    moveId: move.id,
    kind: 'engage',
    text: fillTemplate(move.text, understanding, pack),
  }))
}
