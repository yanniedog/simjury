import type { LiveRoomEvent } from '../lib/liveJuryConnection'
import type { DocketBeat, DocketCase } from '../lib/v2/caseSchema'
import {
  actionForConcern,
  legacyLanguagePack,
  type ConcernInterpretation,
} from './legacyConcernMatcher'
import { playRound, startDeliberation } from './deliberation'
import { understandContribution, type Understanding } from './deliberationLanguageV5'

export type HybridTranscriptItem =
  | {
      kind: 'human'
      key: string
      event: LiveRoomEvent
    }
  | {
      kind: 'authored'
      key: string
      sourceSequence: number
      jurorId: string
      jurorLabel: string
      responseKind: 'engage' | 'clarify' | 'repeat'
      text: string
    }

export const LIVE_BRIDGE_HISTORY_EVENTS = 120

type AuthoredReply = { jurorId: string; jurorLabel: string; text: string }
const replyCache = new WeakMap<DocketCase, Map<string, AuthoredReply[]>>()

function relevantBeat(
  trial: DocketCase,
  understanding: Understanding,
  playerText: string,
): DocketBeat | undefined {
  const point = playerText.match(/\bpoint\s*(\d{1,2})\b/i)
  if (point) return trial.beats[Number(point[1]) - 1]
  const matched = understanding.frame.evidenceIds
    .map((id) => trial.beats.find((beat) => beat.id === id))
    .filter((beat): beat is DocketBeat => Boolean(beat))
  if (matched.length === 1) return matched[0]
  if (matched.length > 1) return undefined
  if (!understanding.frame.issueId) return undefined
  const issueBeats = trial.beats
    .filter((beat) => beat.tags.some((tag) => tag === understanding.frame.issueId))
  return issueBeats.length === 1 ? issueBeats[0] : undefined
}

function threadKey(understanding: Understanding, beat?: DocketBeat): string | null {
  const subject = beat
    ? `evidence:${beat.id}`
    : understanding.frame.issueId
      ? `issue:${understanding.frame.issueId}`
      : null
  return subject
    ? `${subject}:${understanding.frame.issueId ?? 'unclassified'}:${understanding.frame.position}`
    : null
}

function fallbackJuror(trial: DocketCase, sourceSequence: number) {
  const jurors = trial.jury.jurors
  return jurors[sourceSequence % jurors.length] ?? jurors[0]
}

function jurorForBeat(trial: DocketCase, beat: DocketBeat, issueId?: string) {
  return [...trial.jury.jurors].sort((a, b) => {
    const score = (weights: typeof a.weights) => issueId
      ? Math.abs(Object.entries(weights).find(([id]) => id === issueId)?.[1] ?? 0)
      : Math.max(...beat.tags.map((tag) => Math.abs(weights[tag] ?? 0)), 0)
    const aWeight = score(a.weights)
    const bWeight = score(b.weights)
    return bWeight - aWeight || a.seat - b.seat
  })[0]
}

function clarificationText(understanding: Understanding): string {
  return understanding.frame.evidenceIds.length > 1
    ? 'I can connect that wording to more than one part of the record. Which witness, exhibit, legal element, or numbered point do you mean?'
    : "I don't want to guess what you mean. Name the witness, exhibit, legal element, or numbered point you want us to test."
}

function authoredReplies(
  trial: DocketCase,
  sourceSequence: number,
  understanding: Understanding,
  beat: DocketBeat,
): AuthoredReply[] {
  const concern: ConcernInterpretation = {
    understanding,
    beatId: beat.id,
    clarification: null,
  }
  const seededCase = { ...trial, id: `${trial.id}-live-${sourceSequence}` }
  const state = startDeliberation(seededCase)
  const start = state.log.length
  playRound(state, actionForConcern(
    trial,
    concern,
    understanding.frame.position,
    jurorForBeat(trial, beat, understanding.frame.issueId)?.id,
  ))
  return state.log
    .slice(start)
    .filter((event) => event.type === 'respond' && Boolean(event.line))
    .slice(0, 2)
    .map((event) => {
      const juror = trial.jury.jurors.find(({ id }) => id === event.actor)
        ?? fallbackJuror(trial, sourceSequence)
      return {
        jurorId: juror.id,
        jurorLabel: juror.label,
        text: event.line!,
      }
    })
}

function cachedReplies(
  trial: DocketCase,
  sourceSequence: number,
  understanding: Understanding,
  beat: DocketBeat,
): AuthoredReply[] {
  let caseCache = replyCache.get(trial)
  if (!caseCache) {
    caseCache = new Map()
    replyCache.set(trial, caseCache)
  }
  const key = `${sourceSequence}:${understanding.frame.id}:${beat.id}`
  const prior = caseCache.get(key)
  if (prior) return prior
  const replies = authoredReplies(trial, sourceSequence, understanding, beat)
  caseCache.set(key, replies)
  return replies
}

/**
 * Builds one shared-looking transcript without persisting synthetic messages.
 * Every client receives the same sequenced human history and deterministically
 * derives the same clearly-labelled authored replies, including after reconnect.
 */
export function buildHybridTranscript(
  trial: DocketCase,
  events: LiveRoomEvent[],
): HybridTranscriptItem[] {
  const unique = new Map<number, LiveRoomEvent>()
  for (const event of events) {
    const existing = unique.get(event.sequence)
    if (!existing) {
      unique.set(event.sequence, event)
    } else if (JSON.stringify(existing) !== JSON.stringify(event)) {
      // Never log human text or names. First-seen server history remains authoritative.
      console.warn(`Live jury sequence ${event.sequence} conflicted; keeping its first event.`)
    }
  }
  const ordered = [...unique.values()]
    .sort((a, b) => a.sequence - b.sequence)
    .slice(-LIVE_BRIDGE_HISTORY_EVENTS)
  const pack = legacyLanguagePack(trial, [])
  const seenThreads = new Set<string>()
  const transcript: HybridTranscriptItem[] = []

  for (const event of ordered) {
    transcript.push({ kind: 'human', key: `human-${event.sequence}`, event })
    if (event.event_type !== 'message' || !event.text?.trim()) continue

    const understanding = understandContribution(event.text, pack)
    const beat = relevantBeat(trial, understanding, event.text)
    const key = threadKey(understanding, beat)
    const uncertain = understanding.needsClarification || !beat
    if (uncertain) {
      const juror = fallbackJuror(trial, event.sequence)
      transcript.push({
        kind: 'authored',
        key: `authored-${event.sequence}-clarify`,
        sourceSequence: event.sequence,
        jurorId: juror.id,
        jurorLabel: juror.label,
        responseKind: 'clarify',
        text: clarificationText(understanding),
      })
      continue
    }

    const repeated = Boolean(key && seenThreads.has(key))
    if (key) seenThreads.add(key)
    if (repeated) {
      const juror = jurorForBeat(trial, beat, understanding.frame.issueId)
        ?? fallbackJuror(trial, event.sequence)
      const subject = pack.issues.find(({ id }) => id === understanding.frame.issueId)?.label
        ?? pack.evidence.find(({ id }) => id === beat.id)?.label
        ?? 'evidence'
      transcript.push({
        kind: 'authored',
        key: `authored-${event.sequence}-repeat`,
        sourceSequence: event.sequence,
        jurorId: juror.id,
        jurorLabel: juror.label,
        responseKind: 'repeat',
        text: `That returns us to the same ${subject} concern. What new part of the record should change the earlier discussion?`,
      })
      continue
    }

    const replies = cachedReplies(trial, event.sequence, understanding, beat)
    const fallback = fallbackJuror(trial, event.sequence)
    const usable = replies.length ? replies : [{
      jurorId: fallback.id,
      jurorLabel: fallback.label,
      text: `${understanding.paraphrase} Which part of the record supports or weakens it?`,
    }]
    usable.forEach((reply, index) => transcript.push({
      kind: 'authored',
      key: `authored-${event.sequence}-${reply.jurorId}-${index}`,
      sourceSequence: event.sequence,
      jurorId: reply.jurorId,
      jurorLabel: reply.jurorLabel,
      responseKind: 'engage',
      text: reply.text,
    }))
  }

  return transcript
}
