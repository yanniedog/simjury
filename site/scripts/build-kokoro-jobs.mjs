import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const docketDir = join(siteRoot, 'app', 'docket')
const args = process.argv.slice(2)
const valueAfter = (flag) => args[args.indexOf(flag) + 1]
const requested = valueAfter('--case') ?? 'all'
const outputDir = resolve(valueAfter('--output') ?? join(siteRoot, '.narration-jobs'))
const limit = Number.parseInt(valueAfter('--limit') ?? '', 10)

function hash(value) {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 0x01000193)
  return h >>> 0
}

function narrationIdFor(text, key) {
  const slug = key.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  return `${slug}-${hash(`${key}\0${text}`).toString(16).padStart(8, '0')}`
}

const namedVoices = {
  narrator: 'af_heart',
  judge: 'bf_emma',
  pc: 'af_bella',
  dc: 'bf_emma',
}
const voices = ['af_heart', 'af_bella', 'bf_emma', 'af_nicole', 'am_fenrir', 'am_michael']
const voiceFor = (key) => namedVoices[key] ?? voices[hash(key) % voices.length]

function spokenLines(c) {
  const lines = c.hook ? [{ speaker: 'narrator', text: c.hook }] : []
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
  const clips = new Map()
  for (const { speaker, text } of spokenLines(docket)) {
    const id = narrationIdFor(text, speaker)
    const clip = { id, speaker, voice: voiceFor(speaker), text }
    const prior = clips.get(id)
    if (prior && JSON.stringify(prior) !== JSON.stringify(clip)) {
      throw new Error(`Narration id collision: ${id}`)
    }
    clips.set(id, clip)
  }
  return clips
}

const allCases = readdirSync(docketDir)
  .filter((file) => /^dd-\d{4}\.json$/.test(file))
  .map((file) => file.replace(/\.json$/, ''))
  .sort()
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
    engine: 'hexgrad/Kokoro-82M',
    license: 'Apache-2.0',
    sampleRate: 24000,
    clips: [...clips.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, Number.isFinite(limit) ? limit : undefined),
  }
  writeFileSync(join(outputDir, `${caseId}.json`), `${JSON.stringify(job, null, 2)}\n`)
  console.log(`${caseId}: ${job.clips.length} natural-voice clips`)
}
