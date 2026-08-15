import { createHash } from 'node:crypto'
import { constants, copyFileSync, existsSync, lstatSync, readFileSync, readdirSync,
  realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { VoiceAcceptanceBundle } from './court-week-voice-acceptance-bundle'
import { VOICE_ACCEPTANCE_LISTENER_SUBMISSION_SCHEMA, type ListenerSubmission } from
  './court-week-voice-acceptance-export'
import type { ListenerDecision } from './court-week-voice-acceptance'
import { voiceReviewDigest } from './court-week-voice-distinctness'

export const VOICE_ACCEPTANCE_LISTENER_PACKAGE_SCHEMA =
  'simjury.court-week-voice-acceptance-listener-package/v1' as const
const repositoryRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'))
const digest = (bytes: Uint8Array): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const within = (root: string, target: string): boolean => {
  const path = relative(root, target)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}
const overlaps = (left: string, right: string): boolean => within(left, right) || within(right, left)
const exactKeys = (value: object, expected: string[]): boolean =>
  Object.keys(value).sort().join('|') === [...expected].sort().join('|')
const sha = (value: unknown): value is string => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value)

function privateDirectory(input: string, label: string, empty = false): string {
  const requested = resolve(input); let cursor = requested
  while (true) {
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`${label} must not use a symlink or reparse point`)
    const parent = dirname(cursor); if (parent === cursor) break; cursor = parent
  }
  const directory = realpathSync(requested)
  if (!statSync(directory).isDirectory()) throw new Error(`${label} must be an existing directory`)
  for (cursor = directory; ; cursor = dirname(cursor)) {
    if (existsSync(join(cursor, '.git'))) throw new Error(`${label} must be outside every repository`)
    if (dirname(cursor) === cursor) break
  }
  if (within(repositoryRoot, directory)
    || directory.split(/[\\/]+/u).some((part) => part.toLowerCase() === 'public')) {
    throw new Error(`${label} must be outside every repository and public tree`)
  }
  if (empty && readdirSync(directory).length) throw new Error(`${label} must be empty`)
  return directory
}

function regularFile(root: string, name: string): string {
  const requested = resolve(root, name)
  if (!within(root, requested) || basename(requested) !== name || lstatSync(requested).isSymbolicLink()) {
    throw new Error(`${name} must be a regular file inside the private listener directory`)
  }
  const file = realpathSync(requested)
  if (!within(root, file) || !statSync(file).isFile()) throw new Error(`${name} escaped the private listener directory`)
  return file
}

const pendingDecision = (listener: VoiceAcceptanceBundle, listenerId: string): ListenerDecision => ({
  listenerId, blindingConfirmed: null, nativeAustralianEnglishSelfAttested: null, devices: [],
  clipRatings: listener.comparisons.flatMap(({ roleId, clips }) => clips.map(({ clipId }) => ({
    roleId, clipId, naturalness: null, australianAuthenticity: null, accentAssessment: null,
  }))),
  preferences: listener.comparisons.map(({ pairId }) => ({ pairId, preferredClipId: null })),
  recognitionAnswers: listener.recognitionTrials.map(({ trialId }) => ({ trialId, selectedChoiceId: null })),
  distinctnessDecisions: listener.distinctnessComparisons.map(({ pairId }) => ({ pairId, distinguishable: null })),
  defectReviewComplete: false, defects: [], reviewReference: '',
})

function safeInputs(listenerInput: unknown, templateInput: unknown, expectedBundleDigest: string) {
  const listener = listenerInput as VoiceAcceptanceBundle; const template = templateInput as ListenerSubmission
  const { bundleDigest, ...bundlePayload } = listener ?? {}
  const sourceKeys = ['candidateContentDigest', 'mediaManifestDigest', 'nameReviewDigest', 'performanceDigest', 'pronunciationDigest']
  if (!listener || !exactKeys(listener, ['assignmentDigest', 'blinded', 'bundleDigest', 'castingContractDigest',
    'comparisons', 'distinctnessApprovalDigest', 'distinctnessComparisons', 'recognitionTrials', 'schema', 'sourceDigests'])
    || !sha(expectedBundleDigest) || bundleDigest !== expectedBundleDigest
    || listener.schema !== 'simjury.court-week-voice-acceptance-bundle/v1' || listener.blinded !== true
    || !exactKeys(listener.sourceDigests, sourceKeys) || Object.values(listener.sourceDigests).some((value) => !sha(value))
    || ![bundleDigest, listener.assignmentDigest, listener.castingContractDigest,
      listener.distinctnessApprovalDigest].every(sha)
    || !Array.isArray(listener.comparisons) || listener.comparisons.length !== 28
    || listener.comparisons.some((entry) => !exactKeys(entry, ['canonicalTextDigest', 'clips', 'listenerLabel', 'pairId', 'roleId'])
      || !/^role-[0-9]{2}$/u.test(entry.roleId) || !/^ab-[0-9]{2}$/u.test(entry.pairId)
      || !sha(entry.canonicalTextDigest) || typeof entry.listenerLabel !== 'string' || !entry.listenerLabel.trim()
      || !Array.isArray(entry.clips) || entry.clips.length !== 2 || entry.clips.some((clip) =>
        !exactKeys(clip, ['audioSha256', 'clipId', 'exactSourceEvidenceSha256', 'integratedLufs', 'loudnessAnalysisEvidenceSha256'])
        || !Number.isFinite(clip.integratedLufs) || !sha(clip.audioSha256) || !sha(clip.exactSourceEvidenceSha256)
        || !sha(clip.loudnessAnalysisEvidenceSha256)))
    || !Array.isArray(listener.recognitionTrials) || listener.recognitionTrials.length !== 26
    || listener.recognitionTrials.some((entry) => !exactKeys(entry, ['canonicalTextDigest', 'exactSourceEvidenceSha256',
      'options', 'sampleAudioSha256', 'sampleClipId', 'trialId']) || !Array.isArray(entry.options)
      || !/^recognition-[0-9]{2}$/u.test(entry.trialId) || !sha(entry.sampleAudioSha256)
      || !sha(entry.canonicalTextDigest) || !sha(entry.exactSourceEvidenceSha256)
      || entry.options.length !== 4 || entry.options.some((option) => !exactKeys(option, ['choiceId', 'listenerLabel'])
        || !/^recognition-[0-9]{2}-choice-[1-4]$/u.test(option.choiceId)
        || typeof option.listenerLabel !== 'string' || !option.listenerLabel.trim()))
    || !Array.isArray(listener.distinctnessComparisons) || voiceReviewDigest(bundlePayload) !== bundleDigest
    || listener.distinctnessComparisons.some((entry) => !exactKeys(entry, ['clipIds', 'pairId'])
      || !Array.isArray(entry.clipIds) || entry.clipIds.length !== 2)
    || !template || !exactKeys(template, ['bundleDigest', 'listener', 'schema'])
    || template.schema !== VOICE_ACCEPTANCE_LISTENER_SUBMISSION_SCHEMA || template.bundleDigest !== bundleDigest
    || !/^listener-0[1-5]$/u.test(template.listener?.listenerId ?? '')
    || voiceReviewDigest(template.listener) !== voiceReviewDigest(pendingDecision(listener, template.listener.listenerId))) {
    throw new Error('Listener bundle and selected template must be exact, matched and completely unanswered')
  }
  const forbiddenKey = /(?:operator|provider|identity)/iu; const forbiddenValue = /\b(?:https?|wss?):\/\//iu
  const inspect = (value: unknown): void => {
    if (typeof value === 'string' && forbiddenValue.test(value)) throw new Error('Outbound URLs are forbidden')
    if (!value || typeof value !== 'object') return
    for (const [key, entry] of Object.entries(value)) {
      if (forbiddenKey.test(key) || key === 'candidateClipId' || key === 'kokoroClipId') {
        throw new Error(`Private routing field is forbidden: ${key}`)
      }
      inspect(entry)
    }
  }
  inspect(listener); inspect(template)
  const clips = [...listener.comparisons.flatMap(({ clips }) => clips.map(({ clipId, audioSha256 }) => (
    { clipId, audioSha256: String(audioSha256) }))),
    ...listener.recognitionTrials.map(({ sampleClipId: clipId, sampleAudioSha256: audioSha256 }) => ({ clipId, audioSha256 }))]
  if (clips.length !== 82 || new Set(clips.map(({ clipId }) => clipId)).size !== 82
    || new Set(clips.map(({ audioSha256 }) => audioSha256)).size !== 82
    || clips.some(({ clipId, audioSha256 }) => !/^(?:ab-[0-9]{2}-[ab]|recognition-[0-9]{2}-sample)$/u.test(clipId)
      || !/^sha256:[0-9a-f]{64}$/u.test(audioSha256))) throw new Error('The package requires exactly 82 unique opaque clips')
  return { listener, template, clips }
}

const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; media-src 'self'; connect-src 'none'; img-src 'none'; font-src 'none'; worker-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><title>Private voice review</title><link rel="stylesheet" href="review.css"></head><body><main><h1>Private voice review</h1><p>This package runs directly from this folder. It never connects to a network.</p><dl><dt>Listener</dt><dd id="listener">Checking…</dd><dt>Audio clips</dt><dd id="clips">Checking…</dd></dl><h2>Audio check</h2><audio controls preload="metadata" src="ab-01-a.mp3" aria-label="First opaque review clip"></audio><p id="status" role="status" aria-live="polite">Opening the sealed review package…</p><noscript>JavaScript is required to verify this local package.</noscript></main><script src="review-data.js"></script><script src="review-shell.js"></script></body></html>\n`
const css = `:root{font:100%/1.55 system-ui,sans-serif;color:#17201c;background:#f4f1e9}*{box-sizing:border-box}body{margin:0}main{max-width:46rem;margin:auto;padding:clamp(1rem,5vw,3rem)}h1{font-size:clamp(1.6rem,7vw,2.5rem);line-height:1.15}dl{display:grid;grid-template-columns:max-content 1fr;gap:.5rem 1rem;padding:1rem;background:#fff;border:1px solid #bbb}dd{margin:0;overflow-wrap:anywhere}@media(forced-colors:active){dl{border:2px solid CanvasText}}\n`
const shell = `'use strict';(()=>{const value=globalThis.__SIMJURY_VOICE_REVIEW__;if(!value||value.schema!==${JSON.stringify(VOICE_ACCEPTANCE_LISTENER_PACKAGE_SCHEMA)}||!/^sha256:[0-9a-f]{64}$/.test(value.packageDigest))throw new Error('Private review package is invalid');document.querySelector('#listener').textContent=value.template.listener.listenerId;document.querySelector('#clips').textContent=String(value.clips.length);document.querySelector('#status').textContent='Package ready. The listening form is installed in the next review stage.';globalThis.__SIMJURY_VOICE_REVIEW_READY__=value.packageDigest})();\n`
const readme = (bundle: string, reviewPackage: string) => `OFFLINE LAUNCH\n\nBundle: ${bundle}\nPackage: ${reviewPackage}\n\n1. Disconnect this computer from every network.\n2. Open review.html directly in a current browser. Do not run a web server.\n3. Confirm the page reports "Package ready" and 82 audio clips.\n\nThe fail-closed Content Security Policy blocks connections, remote assets, fonts, frames and workers. This foundation package does not collect answers; the blinded form is added in the next reviewed stage.\n`

export function createPrivateListenerReviewShell(
  sourceInput: string, outputInput: string, templateName: string, expectedBundleDigest: string,
) {
  const source = privateDirectory(sourceInput, 'Listener source'); const output = privateDirectory(outputInput, 'Review output', true)
  if (overlaps(source, output) || !/^submission-listener-0[1-5]\.json$/u.test(templateName)) {
    throw new Error('Listener source and review output must be separate, and one numbered template must be selected')
  }
  const listener = JSON.parse(readFileSync(regularFile(source, 'listener.json'), 'utf8')) as unknown
  const template = JSON.parse(readFileSync(regularFile(source, templateName), 'utf8')) as unknown
  const checked = safeInputs(listener, template, expectedBundleDigest)
  const expected = new Set(checked.clips.map(({ clipId }) => `${clipId}.mp3`))
  const audioEntries = readdirSync(source, { withFileTypes: true }).filter(({ name }) => name.endsWith('.mp3'))
  if (audioEntries.length !== 82 || audioEntries.some((entry) => !entry.isFile() || !expected.has(entry.name))) {
    throw new Error('Listener source must contain exactly the expected 82 opaque MP3 files')
  }
  const sources = checked.clips.map((clip) => {
    const sourceFile = regularFile(source, `${clip.clipId}.mp3`)
    if (digest(readFileSync(sourceFile)) !== clip.audioSha256) throw new Error(`${clip.clipId}: audio SHA-256 is stale`)
    return { ...clip, sourceFile }
  })
  for (const clip of sources) {
    const destination = join(output, `${clip.clipId}.mp3`)
    copyFileSync(clip.sourceFile, destination, constants.COPYFILE_EXCL)
    if (digest(readFileSync(destination)) !== clip.audioSha256) throw new Error(`${clip.clipId}: copied audio SHA-256 changed`)
  }
  const payload = { schema: VOICE_ACCEPTANCE_LISTENER_PACKAGE_SCHEMA, bundleDigest: checked.listener.bundleDigest,
    templateDigest: voiceReviewDigest(checked.template), listener: checked.listener, template: checked.template,
    clips: checked.clips.map(({ clipId, audioSha256 }) => ({ clipId, audioSha256 })) }
  const packageDigest = voiceReviewDigest(payload)
  const data = `globalThis.__SIMJURY_VOICE_REVIEW__=${JSON.stringify({ ...payload, packageDigest })};\n`
    .replace(/[<\u2028\u2029]/gu, (character) => `\\u${character.codePointAt(0)!.toString(16).padStart(4, '0')}`)
  for (const [name, bytes] of [['review.html', html], ['review.css', css], ['review-shell.js', shell],
    ['review-data.js', data], ['README.txt', readme(checked.listener.bundleDigest, packageDigest)]] as const) {
    writeFileSync(join(output, name), bytes, { flag: 'wx' })
  }
  return { packageDigest, bundleDigest: checked.listener.bundleDigest, listenerId: checked.template.listener.listenerId,
    clipCount: checked.clips.length, launchFile: join(output, 'review.html') }
}

const argument = (name: string): string => {
  const index = process.argv.indexOf(name); const value = index < 0 ? undefined : process.argv[index + 1]
  if (!value) throw new Error(`${name} is required`); return value
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) console.log(JSON.stringify(
  createPrivateListenerReviewShell(argument('--listener-directory'), argument('--output'), argument('--template'),
    argument('--expected-bundle-digest')), null, 2))
