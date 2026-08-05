import { readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { elevenMinutesCourtWeek } from '../src/courtweek/content'
import { courtWeekBootstrap } from '../src/courtweek/sealed/bootstrap'
import { BUILD_UNLOCK_FRAGMENTS } from '../src/courtweek/sealed/buildKeys'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const buildRoot = resolve(appRoot, '..', 'public', 'jury')

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

const files = filesBelow(buildRoot)
const sourceMaps = files.filter((file) => extname(file) === '.map')
if (sourceMaps.length) throw new Error(`Production source maps are forbidden: ${sourceMaps.join(', ')}`)

const publicCode = files
  .filter((file) => /\.(?:html|js|css)$/u.test(file))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')
const sensitiveStrings = elevenMinutesCourtWeek.manifest.sessions.flatMap((session) =>
  session.scenes.flatMap((scene) => [
    ...(scene.visual.fallbackId === 'courtroom' ? [] : [scene.visual.fallbackId]),
    ...scene.cues.flatMap((cue) => [
      cue.text,
      cue.accessibleProposition,
      cue.audio?.opus,
      cue.audio?.aac,
      cue.audio?.mp3,
    ].filter((value): value is string => Boolean(value))),
  ]),
)
const deliberationSensitiveStrings = [
  ...elevenMinutesCourtWeek.deliberation.jurors.flatMap((juror) => [
    juror.occupation, juror.concern, juror.reasoningStrength, juror.vulnerability,
  ]),
  ...elevenMinutesCourtWeek.deliberation.legalQuestions,
  ...elevenMinutesCourtWeek.deliberation.propositions.flatMap((proposition) => [
    proposition.id, proposition.legalQuestion, proposition.lawfulRationale,
  ]),
  ...elevenMinutesCourtWeek.deliberation.improperArguments.flatMap((argument) => [
    argument.claim, argument.correction,
  ]),
  elevenMinutesCourtWeek.deliberation.juryNote.question,
  elevenMinutesCourtWeek.deliberation.juryNote.answer,
  ...elevenMinutesCourtWeek.deliberation.outcomePaths.flatMap((outcome) => [
    outcome.lawfulRationale, outcome.counterAnalysis,
  ]),
]
for (const sensitive of deliberationSensitiveStrings) {
  if (sensitive.length >= 12 && publicCode.includes(sensitive)) {
    throw new Error(`Deliberation content leaked into an executable/static source: ${sensitive.slice(0, 72)}`)
  }
}
for (const sensitive of sensitiveStrings) {
  if (sensitive.length >= 12 && publicCode.includes(sensitive)) {
    throw new Error(`Authored Court Week content leaked into an executable/static source: ${sensitive.slice(0, 72)}`)
  }
}

const indexHtml = readFileSync(join(buildRoot, 'index.html'), 'utf8')
if (/\.sjp|court-week\/packs/iu.test(indexHtml)) {
  throw new Error('The initial HTML must not preload or name a sealed day pack.')
}
const initialAssets = Array.from(indexHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/gu), (match) => match[1])
const initialCode = initialAssets.map((asset) => {
  const relative = asset.replace(/^\/jury\//u, '')
  return readFileSync(join(buildRoot, relative), 'utf8')
}).join('\n')
const semanticUnlockReference = /(?:day0[1-7](?:[-.]|$)|unlockkey|sealed\/keys)/iu
if (semanticUnlockReference.test(indexHtml) || semanticUnlockReference.test(initialCode)) {
  throw new Error('The initial asset graph names a future-day unlock module.')
}

const initialJavaScript = new Set(initialAssets
  .filter((asset) => asset.endsWith('.js'))
  .map((asset) => resolve(buildRoot, asset.replace(/^\/jury\//u, ''))))
const dynamicJavaScript = files.filter((file) => extname(file) === '.js' && !initialJavaScript.has(resolve(file)))
for (const file of dynamicJavaScript) {
  if (!/^[A-Za-z0-9_-]{8}\.js$/u.test(basename(file))) {
    throw new Error(`Dynamic production chunk is not content-hash-only: ${basename(file)}`)
  }
}
for (const fragment of BUILD_UNLOCK_FRAGMENTS) {
  if (initialCode.includes(fragment)) {
    throw new Error('A future-day unlock fragment leaked into the initial asset graph.')
  }
}

const packRoot = join(buildRoot, 'court-week', 'packs')
const packNames = readdirSync(packRoot).sort()
const expectedNames = courtWeekBootstrap.sessions.map((session) => session.locator).sort()
if (JSON.stringify(packNames) !== JSON.stringify(expectedNames)) {
  throw new Error(`Built sealed-pack set does not match bootstrap: ${packNames.join(', ')}`)
}
for (const packName of packNames) {
  const packText = readFileSync(join(packRoot, packName), 'utf8')
  for (const sensitive of sensitiveStrings) {
    if (sensitive.length >= 12 && packText.includes(sensitive)) {
      throw new Error(`Plaintext authored content leaked into ${packName}`)
    }
  }
}

console.log('Sealed build contains no authored dialogue/media map in code, HTML, maps or pack plaintext.')
