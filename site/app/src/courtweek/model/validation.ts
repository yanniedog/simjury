import { type CourtEvent, type CourtWeek, courtWeekSchema } from './schema'
import {
  contributionStage,
  furtherDiscussionContributionSceneIds,
  preSecondBallotContributionSceneIds,
} from './deliberationContract'

export type LegalState = {
  sworn: boolean
  crownOpened: boolean
  crownClosed: boolean
  defenceOpened: boolean
  defenceClosed: boolean
  addressesComplete: boolean
  summedUp: boolean
  retired: boolean
  provisionalVoteSealed: boolean
  firstBallotTaken: boolean
  verdictReturned: boolean
}

export const initialLegalState: LegalState = {
  sworn: false,
  crownOpened: false,
  crownClosed: false,
  defenceOpened: false,
  defenceClosed: false,
  addressesComplete: false,
  summedUp: false,
  retired: false,
  provisionalVoteSealed: false,
  firstBallotTaken: false,
  verdictReturned: false,
}

const words = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length

/** Conservative proxy until release audio durations replace it: 141 wpm plus natural pauses. */
export function estimateCueSeconds(text: string): number {
  const spoken = words(text) / 2.35
  const pauses = (text.match(/[.!?;:—]/gu) ?? []).length * 0.18
  return Math.ceil(Math.max(3, spoken + pauses))
}

export function estimateSessionSeconds(session: CourtWeek['manifest']['sessions'][number]): number {
  return session.scenes.reduce((total, scene) => total
    + scene.transitionSeconds
    + (scene.interaction?.minimumSeconds ?? 0)
    + scene.cues.reduce((cueTotal, cue, index, cues) => {
      if (index > 0 && cue.sourceCueId && cue.sourceCueId === cues[index - 1].sourceCueId) return cueTotal
      const sourceId = cue.sourceCueId
      const sourceText = sourceId
        ? cues.slice(index).filter((candidate) => candidate.sourceCueId === sourceId).map((candidate) => candidate.text).join(' ')
        : cue.text
      return cueTotal + estimateCueSeconds(sourceText)
    }, 0), 0)
}

function demand(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const closingAddressEvents = new Set<CourtEvent>(['crown-closing', 'defence-closing'])
const substantiveWitnessEvents = new Set<CourtEvent>(['witness-chief', 'witness-cross', 'witness-reexamination'])

export function transitionLegalState(state: LegalState, event: CourtEvent): LegalState {
  const next = { ...state }
  switch (event) {
    case 'oath':
      next.sworn = true
      break
    case 'crown-opening':
      demand(state.sworn, 'the Crown cannot open before the jury is sworn')
      next.crownOpened = true
      break
    case 'witness-chief':
    case 'witness-cross':
    case 'witness-reexamination':
    case 'exhibit-admitted':
      demand(state.sworn && state.crownOpened, 'evidence cannot be received before oath and Crown opening')
      demand(!state.defenceClosed, 'evidence cannot resume after the defence closes')
      break
    case 'crown-close':
      demand(state.crownOpened && !state.defenceOpened, 'the Crown must finish its continuous case before the defence opens')
      next.crownClosed = true
      break
    case 'defence-opening':
      demand(state.crownClosed, 'the defence cannot open before Crown closure')
      next.defenceOpened = true
      break
    case 'silence-direction':
      demand(state.crownClosed, 'the silence direction belongs after the Crown case')
      break
    case 'defence-close':
      demand(state.crownClosed && state.defenceOpened, 'the defence cannot close before opening')
      next.defenceClosed = true
      break
    case 'crown-closing':
      demand(state.defenceClosed, 'the Crown address follows the close of evidence')
      break
    case 'defence-closing':
      demand(state.defenceClosed, 'the defence address follows the close of evidence')
      next.addressesComplete = true
      break
    case 'summing-up':
      demand(state.addressesComplete, 'the judge sums up only after both addresses')
      next.summedUp = true
      break
    case 'retire':
      demand(state.summedUp, 'the jury retires only after the summing-up')
      next.retired = true
      break
    case 'provisional-vote':
      demand(state.retired, 'no juror votes before retirement')
      next.provisionalVoteSealed = true
      break
    case 'first-ballot':
      demand(state.provisionalVoteSealed, 'the player must seal a vote before seeing the aggregate ballot')
      next.firstBallotTaken = true
      break
    case 'jury-note':
    case 'second-ballot':
    case 'perseverance-direction':
    case 'majority-direction':
    case 'final-ballot':
      demand(state.firstBallotTaken, `${event} requires a completed first ballot`)
      break
    case 'verdict-return':
      demand(state.firstBallotTaken, 'a verdict cannot be returned before deliberation')
      next.verdictReturned = true
      break
    case 'analysis':
      demand(state.verdictReturned, 'analysis stays sealed until the open-court verdict')
      break
    default:
      break
  }
  return next
}

export type CourtWeekValidation = { durationSeconds: Record<string, number> }

export function validateCourtWeek(input: unknown): CourtWeekValidation {
  const courtWeek = courtWeekSchema.parse(input)
  const sessions = courtWeek.manifest.sessions
  const allCues = sessions.flatMap((session) => session.scenes.flatMap((scene) => scene.cues))
  const cueIds = allCues.map((cue) => cue.id)
  demand(new Set(cueIds).size === cueIds.length, 'cue ids must be unique across the week')
  allCues.filter((cue) => cue.sourceCueId).forEach((cue) => {
    demand(cueIds.includes(cue.sourceCueId!), `${cue.id}: source cue ${cue.sourceCueId} is absent`)
    const sourceIndex = cueIds.indexOf(cue.sourceCueId!)
    const cueIndex = cueIds.indexOf(cue.id)
    demand(sourceIndex <= cueIndex, `${cue.id}: caption continuation precedes its source cue`)
    demand(
      cue.id === cue.sourceCueId || allCues[cueIndex - 1]?.sourceCueId === cue.sourceCueId,
      `${cue.id}: caption continuations must remain contiguous with their source cue`,
    )
  })

  const expectedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const durations: Record<string, number> = {}
  sessions.forEach((session, index) => {
    demand(session.ordinal === index + 1, `session ${session.id} has the wrong ordinal`)
    demand(session.day === expectedDays[index], `session ${session.id} is not the expected weekday`)
    const expectedPrerequisites = index === 0 ? [] : [sessions[index - 1].id]
    demand(JSON.stringify(session.prerequisiteSessionIds) === JSON.stringify(expectedPrerequisites), `${session.id} must depend only on the preceding session`)
    const seconds = estimateSessionSeconds(session)
    demand(seconds >= 18 * 60 && seconds <= 22 * 60, `${session.id} computes to ${seconds}s; expected 1080..1320s`)
    durations[session.id] = seconds
    if (index > 0) demand(Date.parse(session.unlockAt) > Date.parse(sessions[index - 1].unlockAt), 'unlock times must increase')
  })

  const evidenceIds = courtWeek.trial.evidence.map((evidence) => evidence.id)
  demand(new Set(evidenceIds).size === evidenceIds.length, 'evidence ids must be unique')
  const propositionIds = courtWeek.deliberation.propositions.map(({ id }) => id)
  demand(new Set(propositionIds).size === propositionIds.length, 'deliberation proposition ids must be unique')
  const reasoningScenes = new Map(sessions.flatMap((session) => session.scenes)
    .filter((scene) => contributionStage(scene.id) !== null)
    .map((scene) => [scene.id, scene]))
  const reviewedTuples = new Set<string>()
  courtWeek.deliberation.propositions.forEach((proposition) => {
    demand(courtWeek.deliberation.legalQuestions.includes(proposition.legalQuestion), `${proposition.id}: unknown legal question`)
    demand(new Set(proposition.sceneIds).size === proposition.sceneIds.length, `${proposition.id}: scene ids must be unique`)
    demand(new Set(proposition.evidenceIds).size === proposition.evidenceIds.length, `${proposition.id}: evidence ids must be unique`)
    demand(new Set(proposition.moves).size === proposition.moves.length, `${proposition.id}: reasoning moves must be unique`)
    proposition.evidenceIds.forEach((evidenceId) => {
      const evidence = courtWeek.trial.evidence.find(({ id }) => id === evidenceId)
      demand(evidence?.status === 'admitted', `${proposition.id}: influence requires admitted evidence`)
    })
    proposition.sceneIds.forEach((sceneId) => {
      const scene = reasoningScenes.get(sceneId)
      demand(Boolean(scene), `${proposition.id}: ${sceneId} is not a ballot-influencing reasoning scene`)
      proposition.moves.forEach((move) => {
        demand(Boolean(scene?.interaction?.options?.includes(move)), `${proposition.id}: ${move} is unavailable in ${sceneId}`)
        proposition.evidenceIds.forEach((evidenceId) => {
          const tuple = [sceneId, proposition.legalQuestion, evidenceId, move].join('\u0000')
          demand(!reviewedTuples.has(tuple), `${proposition.id}: duplicate reviewed reasoning tuple in ${sceneId}`)
          reviewedTuples.add(tuple)
        })
      })
    })
  })
  reasoningScenes.forEach((_, sceneId) => {
    demand(courtWeek.deliberation.propositions.some(({ sceneIds }) => sceneIds.includes(sceneId)), `${sceneId}: no reviewed reasoning proposition`)
  })
  allCues.forEach((cue) => cue.evidenceIds.forEach((id) => {
    const item = courtWeek.trial.evidence.find((evidence) => evidence.id === id)
    demand(Boolean(item), `cue ${cue.id} cites unknown evidence ${id}`)
    demand(item?.status === 'admitted', `cue ${cue.id} cannot cite struck evidence ${id}`)
  }))

  const cueIndex = new Map(cueIds.map((id, index) => [id, index]))
  const witnessCueOwners = new Map<string, string[]>()
  courtWeek.trial.witnesses.forEach((witness) => {
    const chiefEnd = Math.max(...witness.chiefCueIds.map((id) => cueIndex.get(id) ?? -1))
    const crossStart = Math.min(...witness.crossCueIds.map((id) => cueIndex.get(id) ?? Number.MAX_SAFE_INTEGER))
    demand(chiefEnd >= 0 && crossStart < Number.MAX_SAFE_INTEGER && chiefEnd < crossStart, `${witness.name}: chief must precede cross`)
    witness.reexaminationCueIds.forEach((id) => demand((cueIndex.get(id) ?? -1) > crossStart, `${witness.name}: re-examination must follow cross`))
    demand(witness.reexaminationCueIds.length === 0 || witness.reexaminationScope.length > 0, `${witness.name}: re-examination needs a confined scope`)
    const memberships = [
      ['chief', witness.chiefCueIds, ['witness-chief', 'exhibit-admitted']],
      ['cross', witness.crossCueIds, ['witness-cross']],
      ['re-examination', witness.reexaminationCueIds, ['witness-reexamination']],
    ] as const
    memberships.forEach(([label, ids, allowedEvents]) => ids.forEach((id) => {
      const cue = allCues.find((item) => item.id === id)
      demand(Boolean(cue), `${witness.name}: ${label} cue ${id} does not exist`)
      demand(Boolean(cue && new Set<string>(allowedEvents).has(cue.event)), `${witness.name}: ${id} is not a ${label} cue`)
      witnessCueOwners.set(id, [...(witnessCueOwners.get(id) ?? []), witness.id])
    }))
  })
  const witnessNames = new Set(courtWeek.trial.witnesses.map((witness) => witness.name))
  const isSubstantiveWitnessEvidence = (cue: (typeof allCues)[number]) => (
    substantiveWitnessEvents.has(cue.event) ||
    (cue.event === 'exhibit-admitted' && witnessNames.has(cue.speaker))
  )
  allCues.filter((cue) => {
    const source = cue.sourceCueId ? allCues.find((candidate) => candidate.id === cue.sourceCueId) : cue
    return Boolean(source && isSubstantiveWitnessEvidence(source))
  }).forEach((cue) => {
    const ownershipId = cue.sourceCueId ?? cue.id
    demand(witnessCueOwners.get(ownershipId)?.length === 1, `substantive witness cue ${cue.id} must belong to exactly one witness`)
  })

  const provisionalAdmissions = allCues.filter((cue) => cue.admissionStatus === 'provisional')
  const finalAdmissions = allCues.filter((cue) => cue.admissionStatus === 'final')
  demand(provisionalAdmissions.length > 0, 'the recording condition must be represented as a provisional admission')
  const statefulAdmissions = [...provisionalAdmissions, ...finalAdmissions]
  statefulAdmissions.forEach((cue) => {
    demand(cue.event === 'exhibit-admitted' && cue.evidenceIds.length > 0, `${cue.id}: an admission state requires identified exhibit evidence`)
  })
  provisionalAdmissions.forEach((provisional) => provisional.evidenceIds.forEach((evidenceId) => {
    const final = finalAdmissions.find((cue) => (
      cue.evidenceIds.includes(evidenceId) && (cueIndex.get(cue.id) ?? -1) > (cueIndex.get(provisional.id) ?? -1)
    ))
    demand(Boolean(final), `${evidenceId}: provisional admission requires a later final-admission cue`)
  }))

  const objections = courtWeek.trial.objections
  demand(objections.some((o) => o.madeBy === 'Defence' && o.ruling === 'overruled'), 'one defence objection must be overruled')
  demand(objections.some((o) => o.madeBy === 'Crown'), 'the Crown must make an objection')
  demand(objections.some((o) => o.timing === 'pre-answer' && o.ruling === 'sustained'), 'one pre-answer objection must be sustained')
  const postAnswerStrikes = objections.filter((o) => o.timing === 'post-answer' && o.ruling === 'sustained' && o.struckEvidenceId)
  demand(postAnswerStrikes.length === 1, 'there must be exactly one credible post-answer strike')
  demand(Boolean(postAnswerStrikes[0].struckCueId), 'the post-answer strike must identify its excluded testimony cue')
  const struckItems = courtWeek.trial.evidence.filter((evidence) => evidence.status === 'struck')
  demand(struckItems.length === 1 && struckItems[0].id === postAnswerStrikes[0].struckEvidenceId, 'the single struck item must match the post-answer ruling')
  const struckCue = allCues.find((cue) => cue.id === postAnswerStrikes[0].struckCueId)
  demand(struckCue?.event === 'witness-cross', 'the post-answer strike must identify the excluded witness answer')
  demand((cueIndex.get(postAnswerStrikes[0].cueId) ?? -1) === (cueIndex.get(postAnswerStrikes[0].struckCueId!) ?? -1) + 1, 'the post-answer ruling must immediately follow its excluded answer')
  demand(!struckItems[0].replayable, 'struck material must never be replayable')

  const closingCues = allCues.filter((cue) => closingAddressEvents.has(cue.event))
  demand(closingCues.length === 4, 'the addresses must contain exactly four traced closing cues')
  allCues.filter((cue) => !closingAddressEvents.has(cue.event)).forEach((cue) => {
    demand((cue.closingPropositions ?? []).length === 0, `${cue.id}: only a closing address may define closing propositions`)
    demand((cue.nonEvidenceClosingText ?? []).length === 0, `${cue.id}: only a closing address may define non-evidence closing text`)
  })
  const closingPropositionIds = closingCues.flatMap((cue) => (cue.closingPropositions ?? []).map(({ id }) => id))
  demand(new Set(closingPropositionIds).size === closingPropositionIds.length, 'closing proposition ids must be unique')
  const struckCueIds = new Set(postAnswerStrikes.flatMap(({ struckCueId }) => struckCueId ? [struckCueId] : []))
  closingCues.forEach((closingCue) => {
    const closingPropositions = closingCue.closingPropositions ?? []
    demand(closingPropositions.length > 0, `${closingCue.id}: every closing cue requires proposition-level record sources`)
    const closingIndex = cueIndex.get(closingCue.id) ?? -1
    const tracedSegments = [
      ...closingPropositions.map(({ text }) => text),
      ...(closingCue.nonEvidenceClosingText ?? []),
    ].map((text) => {
      const start = closingCue.text.indexOf(text)
      demand(start >= 0, `${closingCue.id}: traced closing text does not appear in the address`)
      demand(closingCue.text.indexOf(text, start + 1) === -1, `${closingCue.id}: traced closing text must identify one unambiguous passage`)
      return { start, end: start + text.length }
    }).sort((left, right) => left.start - right.start)
    let coveredThrough = 0
    tracedSegments.forEach(({ start, end }) => {
      demand(start >= coveredThrough, `${closingCue.id}: traced closing passages must not overlap`)
      demand(closingCue.text.slice(coveredThrough, start).trim().length === 0, `${closingCue.id}: unlisted closing text has no admitted-record source or legal/rhetorical exemption`)
      coveredThrough = end
    })
    demand(closingCue.text.slice(coveredThrough).trim().length === 0, `${closingCue.id}: unlisted closing text has no admitted-record source or legal/rhetorical exemption`)
    closingPropositions.forEach((proposition) => {
      demand(closingCue.text.includes(proposition.text), `${proposition.id}: traced words must appear within ${closingCue.id}`)
      proposition.recordSources.forEach((source) => {
        if (source.kind === 'exhibit') {
          const evidence = courtWeek.trial.evidence.find(({ id }) => id === source.evidenceId)
          demand(evidence?.status === 'admitted', `${proposition.id}: exhibit source ${source.evidenceId} is not admitted`)
          const admittedRecordCue = allCues.find((cue, index) => (
            index < closingIndex && cue.evidenceIds.includes(source.evidenceId) && (
              cue.event === 'exhibit-admitted' || substantiveWitnessEvents.has(cue.event)
            )
          ))
          demand(Boolean(admittedRecordCue), `${proposition.id}: exhibit source ${source.evidenceId} was not in the admitted record before closing`)
          return
        }
        const testimony = allCues.find((cue) => cue.id === source.cueId)
        demand(Boolean(testimony && isSubstantiveWitnessEvidence(testimony)), `${proposition.id}: testimony source ${source.cueId} is not substantive witness evidence`)
        demand((cueIndex.get(source.cueId) ?? -1) < closingIndex, `${proposition.id}: testimony source ${source.cueId} was not heard before closing`)
        demand(!struckCueIds.has(source.cueId), `${proposition.id}: testimony source ${source.cueId} was struck`)
        demand(witnessCueOwners.get(source.cueId)?.length === 1, `${proposition.id}: testimony source ${source.cueId} lacks a unique witness owner`)
      })
    })
  })

  courtWeek.trial.evidence.forEach((evidence) => {
    demand(!evidence.replaySourceCueId || evidence.kind === 'recording', `${evidence.id}: only a recording may identify a replay source cue`)
    if (evidence.kind !== 'recording' || evidence.status !== 'admitted' || !evidence.replayable) return
    demand(Boolean(evidence.replaySourceCueId), `${evidence.id}: an admitted replayable recording requires an exact replay source cue`)
    const replayCues = allCues.filter((cue) => (cue.sourceCueId ?? cue.id) === evidence.replaySourceCueId)
    demand(replayCues.length > 0, `${evidence.id}: replay source cue ${evidence.replaySourceCueId} is absent`)
    demand(replayCues.every((cue) => cue.replayable), `${evidence.id}: every paced replay cue must be replayable`)
    demand(replayCues.every((cue) => cue.evidenceIds.includes(evidence.id)), `${evidence.id}: every paced replay cue must cite the recording`)
    demand(finalAdmissions.some((cue) => cue.evidenceIds.includes(evidence.id)), `${evidence.id}: replay requires a final-admission cue`)
  })

  let legalState = initialLegalState
  allCues.forEach((cue) => { legalState = transitionLegalState(legalState, cue.event) })
  demand(legalState.verdictReturned, 'the week must reach an open-court verdict return')

  const ordered = (events: CourtEvent[]) => events.map((event) => {
    const index = allCues.findIndex((cue) => cue.event === event)
    demand(index >= 0, `required event ${event} is absent`)
    return index
  })
  const procedure = ordered(['oath', 'crown-opening', 'crown-close', 'defence-opening', 'defence-close', 'crown-closing', 'defence-closing', 'summing-up', 'retire', 'provisional-vote', 'first-ballot', 'jury-note', 'judge-response', 'second-ballot', 'majority-direction', 'final-ballot', 'verdict-return', 'analysis'])
  demand(procedure.every((value, index) => index === 0 || value > procedure[index - 1]), 'required procedural events are out of order')

  const allScenes = sessions.flatMap((session) => session.scenes)
  const secondBallotSceneIndex = allScenes.findIndex((scene) => scene.id === 'sun-second-ballot')
  const majoritySceneIndex = allScenes.findIndex((scene) => scene.id === 'sun-majority')
  const contributionScenes = [...preSecondBallotContributionSceneIds, ...furtherDiscussionContributionSceneIds]
    .map((id) => allScenes.find((scene) => scene.id === id))
  demand(contributionScenes.every((scene) => scene?.phase === 'deliberation' && scene.interaction?.kind === 'reasoning'), 'every influential contribution must be an authored deliberation interaction')
  demand(preSecondBallotContributionSceneIds.every((id) => allScenes.findIndex((scene) => scene.id === id) < secondBallotSceneIndex), 'second-ballot influence must arise before that ballot')
  demand(furtherDiscussionContributionSceneIds.every((id) => {
    const index = allScenes.findIndex((scene) => scene.id === id)
    return index > secondBallotSceneIndex && index < majoritySceneIndex
  }), 'further influence must arise after failed unanimity and before majority eligibility')
  demand(preSecondBallotContributionSceneIds.length === 8, 'the journey must offer eight legitimate contributions before the second ballot')
  demand(contributionScenes.filter((scene) => scene?.interaction?.optional).length === 4, 'four pre-ballot contributions must remain optional so disagreement is reachable')

  demand(courtWeek.deliberation.outcomePaths.map((path) => path.verdict).join('|') === 'murder|manslaughter|not-guilty|unable-to-agree', 'all four outcomes must be defined in neutral order')
  demand(courtWeek.deliberation.majorityGate.minimumElapsedCourtHours > 8, 'majority consideration must wait more than eight court hours')
  return { durationSeconds: durations }
}

export function assertCourtWeek(input: unknown): asserts input is CourtWeek {
  validateCourtWeek(input)
}
