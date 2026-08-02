/**
 * Build Scylla's Band narration job files (experimental alt voice mode).
 * Removable with site/app/src/lib/narrationAltVoice.json + scylla-narration.yml.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assignScyllaVoices } from './scylla-voices.mjs'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const docketDir = join(siteRoot, 'app', 'docket')
const catalog = JSON.parse(
  readFileSync(join(siteRoot, 'app', 'src', 'lib', 'narrationAltVoice.json'), 'utf8'),
)
const ENGINE = catalog.engine
/** Must match ALT_VOICE_ENGINE_ID in site/app/src/lib/narrationAltVoice.ts. */
const ALT_VOICE_ENGINE_ID = 'scylla'
if (ENGINE !== ALT_VOICE_ENGINE_ID) {
  throw new Error(
    `Alt voice engine mismatch: narrationAltVoice.json.engine is "${ENGINE}", expected "${ALT_VOICE_ENGINE_ID}". ` +
      'Update narrationAltVoice.json or ALT_VOICE_ENGINE_ID in narrationAltVoice.ts so they match.',
  )
}
const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}
const requested = valueAfter('--case') ?? 'all'
const outputDir = resolve(valueAfter('--output') ?? join(siteRoot, '.scylla-jobs'))
const limit = Number.parseInt(valueAfter('--limit') ?? '', 10)

function hash(value) {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** Must match site/app/src/lib/narration.ts for engine !== kokoro. */
function narrationIdFor(text, key, gender = 'female', voice = 'ariadne') {
  const slug = key.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const material =
    key === 'narrator'
      ? `${key}\0${ENGINE}\0${text}`
      : `${key}\0${ENGINE}\0${gender}\0${voice}\0${text}`
  return `${slug}-${hash(material).toString(16).padStart(8, '0')}`
}

const cueCopy = JSON.parse(
  readFileSync(join(siteRoot, 'app', 'src', 'lib', 'narratorCueCopy.json'), 'utf8'),
)
const PHASE_CUES = cueCopy.phaseCues

function fillSpeakerTemplate(template, member) {
  return template.split('{name}').join(member.name).split('{role}').join(member.role_label)
}

function stableTemplate(templates, seed) {
  const index = [...seed].reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
    0,
  ) % templates.length
  return templates[index]
}

function speakerOf(docket, id) {
  return (docket.cast ?? []).find((m) => m.id === id)
}

function speakerNarratorCue(docket, beat) {
  const member = speakerOf(docket, beat.speaker)
  if (!member) return null
  const templates = cueCopy.speaker
  const seed = `${docket.id}:${beat.id}:${member.id}`
  const cue = (kind) =>
    fillSpeakerTemplate(stableTemplate(templates[kind], `${seed}:${kind}`), member)
  if (beat.kind === 'direction') return cue('direction')
  if (beat.kind === 'exhibit') return cue('exhibit')
  if (beat.mode === 'cross') return cue('cross')
  if (member.side === 'prosecution') return cue('prosecution')
  if (member.side === 'defence') return cue('defence')
  return cue('fallback')
}

function narratorCueLines(docket) {
  const lines = Object.values(PHASE_CUES).map((text) => ({ speaker: 'narrator', text }))
  for (const beat of docket.beats ?? []) {
    const text = speakerNarratorCue(docket, beat)
    if (text) lines.push({ speaker: 'narrator', text })
  }
  return lines
}

function spokenLines(c) {
  const lines = [...narratorCueLines(c)]
  if (c.hook) lines.push({ speaker: 'narrator', text: c.hook })
  for (const phase of ['opening', 'closing']) {
    for (const side of ['prosecution', 'defence']) {
      const statement = c.statements?.[phase]?.[side]
      if (statement?.speaker && statement?.text) lines.push(statement)
    }
  }
  for (const beat of c.beats ?? []) {
    lines.push(...(beat.turns ?? [{ speaker: beat.speaker, text: beat.text }]))
  }
  for (const juror of c.jury?.jurors ?? []) {
    for (const bank of Object.values(juror.lines ?? {})) {
      if (Array.isArray(bank)) {
        lines.push(...bank.map((text) => ({ speaker: juror.id, text })))
      }
    }
  }
  return lines
}

function clipsFor(docket) {
  const { voices: voiceBySpeaker, genders } = assignScyllaVoices(docket)
  const clips = new Map()
  for (const { speaker, text } of spokenLines(docket)) {
    const gender = genders.get(speaker) ?? 'female'
    const voice = voiceBySpeaker.get(speaker)
    if (!voice) throw new Error(`No Scylla voice assigned for speaker: ${speaker}`)
    const id = narrationIdFor(text, speaker, gender, voice)
    const clip = { id, speaker, gender, voice, text }
    const prior = clips.get(id)
    if (prior && JSON.stringify(prior) !== JSON.stringify(clip)) {
      throw new Error(`Narration id collision: ${id}`)
    }
    clips.set(id, clip)
  }
  return clips
}

const DOCKET_FILE_RE = /^(dd-\d{4}|dd-intro)\.json$/
const allCases = readdirSync(docketDir)
  .filter((file) => DOCKET_FILE_RE.test(file))
  .map((file) => file.replace(/\.json$/, ''))
  .sort((a, b) => {
    if (a === 'dd-intro') return 1
    if (b === 'dd-intro') return -1
    return a.localeCompare(b)
  })
const selected = requested === 'all'
  ? allCases
  : requested.split(',').map((item) => item.trim()).filter(Boolean)

for (const caseId of selected) {
  if (!allCases.includes(caseId)) throw new Error(`Unknown docket: ${caseId}`)
}
const corpusIds = new Map()
for (const caseId of allCases) {
  const docket = JSON.parse(readFileSync(join(docketDir, `${caseId}.json`), 'utf8'))
  for (const [id, clip] of clipsFor(docket)) {
    const prior = corpusIds.get(id)
    if (prior && JSON.stringify(prior) !== JSON.stringify(clip)) {
      throw new Error(`Corpus narration id collision: ${id}`)
    }
    corpusIds.set(id, clip)
  }
}
if (args.includes('--list')) {
  process.stdout.write(JSON.stringify(selected))
  process.exit(0)
}

mkdirSync(outputDir, { recursive: true })
for (const caseId of selected) {
  const docket = JSON.parse(readFileSync(join(docketDir, `${caseId}.json`), 'utf8'))
  const clips = clipsFor(docket)
  const job = {
    caseId,
    engine: 'lowkeytea/scyllasband',
    license: catalog.license,
    sampleRate: catalog.sampleRate,
    clips: [...clips.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, Number.isFinite(limit) ? limit : undefined),
  }
  writeFileSync(join(outputDir, `${caseId}.json`), `${JSON.stringify(job, null, 2)}\n`)
  console.log(`${caseId}: ${job.clips.length} scylla clips`)
}
