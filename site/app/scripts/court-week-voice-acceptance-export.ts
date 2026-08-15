import { createHash } from 'node:crypto'
import { constants, copyFileSync, lstatSync, readFileSync, readdirSync, realpathSync,
  statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateVoiceAcceptanceBundle, type VoiceAcceptanceBundle,
  type VoiceAcceptanceSource } from './court-week-voice-acceptance-bundle'
import { buildVoiceAcceptanceDecisionTemplate, VOICE_ACCEPTANCE_DEVICES,
  VOICE_DEFECT_KINDS, type ListenerDecision } from './court-week-voice-acceptance'
import { voiceReviewDigest } from './court-week-voice-distinctness'

export const VOICE_ACCEPTANCE_LISTENER_SUBMISSION_SCHEMA =
  'simjury.court-week-voice-acceptance-listener-submission/v1' as const
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '../../..')
const sha256 = (bytes: Uint8Array): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const canonicalJson = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonicalJson).join(',')}]`
  : value !== null && typeof value === 'object' ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}` : JSON.stringify(value)
const exact = (left: unknown, right: unknown): boolean => voiceReviewDigest(left) === voiceReviewDigest(right)
const exactKeys = (value: object, keys: string[]): boolean => exact(Object.keys(value).sort(), keys.sort())

type ExportRequest = {
  listener: unknown; operatorKey: unknown; source: VoiceAcceptanceSource
  distinctnessApproval: unknown; assignments: readonly unknown[]
}
export type ListenerSubmission = {
  schema: typeof VOICE_ACCEPTANCE_LISTENER_SUBMISSION_SCHEMA
  bundleDigest: string
  listener: ListenerDecision
}
type ExportPaths = { audioRoot: string; evidenceRoot: string; listenerOutput: string; operatorOutput: string }

const isWithin = (root: string, target: string): boolean => {
  const path = relative(root, target)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}
const overlaps = (left: string, right: string): boolean => isWithin(left, right) || isWithin(right, left)

function checkedDirectory(input: string, label: string, outsideRepository: boolean, empty = false): string {
  const requested = resolve(input)
  const link = lstatSync(requested)
  if (link.isSymbolicLink()) throw new Error(`${label} must not be a symlink or reparse point`)
  const directory = realpathSync(requested)
  if (!statSync(directory).isDirectory()) throw new Error(`${label} must be an existing directory`)
  if (outsideRepository && isWithin(realpathSync(repositoryRoot), directory)) {
    throw new Error(`${label} must be outside the repository and public asset tree`)
  }
  if (empty && readdirSync(directory).length) throw new Error(`${label} must be empty`)
  return directory
}

export function readPrivateExportRequest(input: string): unknown {
  const requested = resolve(input); const link = lstatSync(requested)
  if (link.isSymbolicLink() || !link.isFile()) throw new Error('Export request must be a regular private file, not a reparse point')
  const file = realpathSync(requested)
  if (isWithin(realpathSync(repositoryRoot), file)) throw new Error('Export request containing the operator key must be outside the repository')
  return JSON.parse(readFileSync(file, 'utf8')) as unknown
}

function evidenceResolver(input: string): (path: string) => Uint8Array {
  const root = checkedDirectory(input, 'Evidence root', false)
  return (path) => {
    const requested = resolve(root, path)
    if (!isWithin(root, requested)) throw new Error('Voice evidence escaped its supplied root')
    const link = lstatSync(requested)
    if (link.isSymbolicLink() || !link.isFile()) throw new Error('Voice evidence must be a regular file, not a reparse point')
    const file = realpathSync(requested)
    if (!isWithin(root, file)) throw new Error('Voice evidence escaped its supplied root')
    return readFileSync(file)
  }
}

function exportRequest(value: unknown): ExportRequest {
  const request = value as ExportRequest
  const keys = ['assignments', 'distinctnessApproval', 'listener', 'operatorKey', 'source']
  if (!request || typeof request !== 'object' || !exact(Object.keys(request).sort(), keys)
    || !Array.isArray(request.assignments)) {
    throw new Error('Export request must contain only the reviewed bundle inputs; human answers are forbidden')
  }
  return request
}

function audioAliases(listener: VoiceAcceptanceBundle): { clipId: string; audioSha256: string }[] {
  const clips = [
    ...listener.comparisons.flatMap((comparison) => comparison.clips.map(({ clipId, audioSha256 }) => (
      { clipId, audioSha256: String(audioSha256) }))),
    ...listener.recognitionTrials.map(({ sampleClipId: clipId, sampleAudioSha256: audioSha256 }) => (
      { clipId, audioSha256 })),
  ]
  if (listener.comparisons.length !== 28 || listener.recognitionTrials.length !== 26 || clips.length !== 82
    || new Set(clips.map(({ clipId }) => clipId)).size !== 82
    || new Set(clips.map(({ audioSha256 }) => audioSha256)).size !== 82
    || clips.some(({ clipId, audioSha256 }) => !/^(?:ab-[0-9]{2}-[ab]|recognition-[0-9]{2}-sample)$/u.test(clipId)
      || !/^sha256:[0-9a-f]{64}$/u.test(audioSha256))) {
    throw new Error('Acceptance export requires exactly 82 unique opaque, hash-addressed clips')
  }
  return clips
}

export function pendingListenerSubmissions(
  requestInput: unknown, resolveEvidence: (path: string) => Uint8Array,
): { listener: VoiceAcceptanceBundle; operatorKey: unknown; submissions: ListenerSubmission[] } {
  const request = exportRequest(requestInput)
  const { listener, operatorKey } = validateVoiceAcceptanceBundle(request.listener, request.operatorKey,
    request.source, request.distinctnessApproval, request.assignments, resolveEvidence)
  const decisions = buildVoiceAcceptanceDecisionTemplate(request.listener, request.operatorKey,
    request.source, request.distinctnessApproval, request.assignments, resolveEvidence)
  const submissions = decisions.listeners.map((record) => ({
    schema: VOICE_ACCEPTANCE_LISTENER_SUBMISSION_SCHEMA,
    bundleDigest: listener.bundleDigest,
    listener: record,
  }))
  if (submissions.length !== 5 || submissions.some((submission, index) =>
    !exact(submission.listener, decisions.listeners[index]))) throw new Error('Listener templates must remain unanswered')
  return { listener, operatorKey, submissions }
}

/** Completed intake is separate from template export; every listener must name at least one real device. */
export function validateCompletedListenerSubmission(
  input: unknown, template: ListenerSubmission, listener: VoiceAcceptanceBundle,
): ListenerSubmission {
  const value = input as ListenerSubmission; const record = value?.listener
  if (!value || value.schema !== VOICE_ACCEPTANCE_LISTENER_SUBMISSION_SCHEMA
    || value.bundleDigest !== template.bundleDigest || value.bundleDigest !== listener.bundleDigest
    || record?.listenerId !== template.listener.listenerId
    || !exactKeys(value, ['bundleDigest', 'listener', 'schema'])
    || !exactKeys(record, Object.keys(template.listener))
    || !Array.isArray(record.devices) || record.devices.length === 0
    || !Array.isArray(record.clipRatings) || !Array.isArray(record.preferences)
    || !Array.isArray(record.recognitionAnswers) || !Array.isArray(record.distinctnessDecisions)
    || !Array.isArray(record.defects)
    || new Set(record.devices).size !== record.devices.length
    || record.devices.some((device) => !VOICE_ACCEPTANCE_DEVICES.includes(
      device as typeof VOICE_ACCEPTANCE_DEVICES[number]))) throw new Error('Listener submission has invalid or empty device evidence')
  const identifiers = (listener: ListenerDecision) => ({
    ratings: listener.clipRatings.map(({ roleId, clipId }) => ({ roleId, clipId })),
    preferences: listener.preferences.map(({ pairId }) => pairId),
    recognition: listener.recognitionAnswers.map(({ trialId }) => trialId),
    distinctness: listener.distinctnessDecisions.map(({ pairId }) => pairId),
  })
  if (!exact(identifiers(record), identifiers(template.listener))
    || typeof record.blindingConfirmed !== 'boolean'
    || typeof record.nativeAustralianEnglishSelfAttested !== 'boolean'
    || record.clipRatings.some(({ naturalness, australianAuthenticity, accentAssessment }, index) =>
      !exactKeys(record.clipRatings[index]!, ['accentAssessment', 'australianAuthenticity', 'clipId', 'naturalness', 'roleId'])
      || typeof naturalness !== 'number' || naturalness < 1 || naturalness > 5
      || typeof australianAuthenticity !== 'number' || australianAuthenticity < 1 || australianAuthenticity > 5
      || !['australian', 'not-australian'].includes(accentAssessment ?? ''))
    || record.preferences.some(({ pairId, preferredClipId }, index) =>
      !exactKeys(record.preferences[index]!, ['pairId', 'preferredClipId']) || preferredClipId !== 'tie'
      && !listener.comparisons.find((entry) => entry.pairId === pairId)?.clips.some(({ clipId }) => clipId === preferredClipId))
    || record.recognitionAnswers.some(({ trialId, selectedChoiceId }, index) =>
      !exactKeys(record.recognitionAnswers[index]!, ['selectedChoiceId', 'trialId'])
      || !listener.recognitionTrials.find((trial) => trial.trialId === trialId)?.options.some(({ choiceId }) => choiceId === selectedChoiceId))
    || record.distinctnessDecisions.some(({ distinguishable }, index) =>
      !exactKeys(record.distinctnessDecisions[index]!, ['distinguishable', 'pairId']) || typeof distinguishable !== 'boolean')
    || record.defectReviewComplete !== true || !record.reviewReference.trim()
    || record.defects.some(({ clipId, kind, resolved, note }, index) =>
      !exactKeys(record.defects[index]!, ['clipId', 'kind', 'note', 'resolved'])
      || !record.clipRatings.some((rating) => rating.clipId === clipId)
      || !VOICE_DEFECT_KINDS.includes(kind as typeof VOICE_DEFECT_KINDS[number]) || !resolved || !note.trim())) {
    throw new Error('Listener submission is incomplete or does not match its opaque template')
  }
  return value
}

export function buildCompletedListenerDownload(
  decision: unknown, template: ListenerSubmission, listener: VoiceAcceptanceBundle,
) {
  const submission = validateCompletedListenerSubmission({ schema: VOICE_ACCEPTANCE_LISTENER_SUBMISSION_SCHEMA,
    bundleDigest: template.bundleDigest, listener: decision }, template, listener)
  const json = `${canonicalJson(submission)}\n`; const digest = sha256(Buffer.from(json))
  return { submission, json, digest,
    filename: `voice-acceptance-${submission.listener.listenerId}-${digest.slice(7)}.json` }
}

export function exportPrivateVoiceAcceptance(requestInput: unknown, paths: ExportPaths) {
  const audioRoot = checkedDirectory(paths.audioRoot, 'Private audio root', true)
  const listenerOutput = checkedDirectory(paths.listenerOutput, 'Listener output', true, true)
  const operatorOutput = checkedDirectory(paths.operatorOutput, 'Operator output', true, true)
  if (overlaps(audioRoot, listenerOutput) || overlaps(audioRoot, operatorOutput)
    || overlaps(listenerOutput, operatorOutput)) throw new Error('Audio, listener and operator directories must not overlap')
  const { listener, operatorKey, submissions } = pendingListenerSubmissions(
    requestInput, evidenceResolver(paths.evidenceRoot))
  const clips = audioAliases(listener)
  const expectedFiles = new Set(clips.map(({ audioSha256 }) => `${audioSha256.slice(7)}.mp3`))
  const entries = readdirSync(audioRoot, { withFileTypes: true })
  if (entries.length !== 82 || entries.some((entry) => !entry.isFile() || !expectedFiles.has(entry.name))) {
    throw new Error('Private audio root must contain exactly the expected 82 hash-addressed MP3 files')
  }
  for (const { clipId, audioSha256 } of clips) {
    const source = join(audioRoot, `${audioSha256.slice(7)}.mp3`)
    if (lstatSync(source).isSymbolicLink() || sha256(readFileSync(source)) !== audioSha256) {
      throw new Error(`${clipId}: private audio bytes do not match the reviewed SHA-256`)
    }
  }
  for (const { clipId, audioSha256 } of clips) copyFileSync(
    join(audioRoot, `${audioSha256.slice(7)}.mp3`), join(listenerOutput, `${clipId}.mp3`), constants.COPYFILE_EXCL)
  writeFileSync(join(listenerOutput, 'listener.json'), `${JSON.stringify(listener, null, 2)}\n`, { flag: 'wx' })
  submissions.forEach((submission, index) => writeFileSync(
    join(listenerOutput, `submission-listener-${String(index + 1).padStart(2, '0')}.json`),
    `${JSON.stringify(submission, null, 2)}\n`, { flag: 'wx' }))
  writeFileSync(join(operatorOutput, 'operator-key.json'), `${JSON.stringify(operatorKey, null, 2)}\n`, { flag: 'wx' })
  return { bundleDigest: listener.bundleDigest, clipCount: clips.length, listenerTemplateCount: submissions.length }
}

const argument = (name: string): string => {
  const index = process.argv.indexOf(name); const value = index < 0 ? undefined : process.argv[index + 1]
  if (!value) throw new Error(`${name} is required`)
  return value
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const request = readPrivateExportRequest(argument('--request'))
  console.log(JSON.stringify(exportPrivateVoiceAcceptance(request, {
    audioRoot: argument('--audio-root'), evidenceRoot: argument('--evidence-root'),
    listenerOutput: argument('--listener-output'), operatorOutput: argument('--operator-output'),
  }), null, 2))
}
