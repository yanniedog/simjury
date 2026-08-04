import { createCipheriv, createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { elevenMinutesCourtWeek } from '../src/courtweek/content'
import { courtWeekBootstrap } from '../src/courtweek/sealed/bootstrap'
import { BUILD_UNLOCK_FRAGMENTS } from '../src/courtweek/sealed/buildKeys'
import { BOOTSTRAP_KEY_FRAGMENT } from '../src/courtweek/sealed/keyBootstrap'
import { createCourtDayPacks } from '../src/courtweek/sealed/packPlan'
import type { CourtDayPack, SealedPackEnvelope } from '../src/courtweek/sealed/types'
import {
  assertRuntimeMediaCoverage,
  courtWeekRuntimeMediaManifestSchema,
  type CourtWeekRuntimeMediaManifest,
} from '../src/courtweek/media/manifest'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = join(appRoot, 'public', 'court-week', 'packs')
const pinnedMediaPath = join(appRoot, 'media', 'court-week-media-manifest.pinned.json')

function deriveKey(ordinal: number): Buffer {
  const fragment = BUILD_UNLOCK_FRAGMENTS[ordinal - 1]
  if (!fragment) throw new Error(`Missing build-time unlock fragment for day ${ordinal}`)
  const identity = Buffer.from(`${courtWeekBootstrap.id}\0${courtWeekBootstrap.revision}\0${ordinal}`)
  return createHash('sha256')
    .update(Buffer.concat([
      Buffer.from(BOOTSTRAP_KEY_FRAGMENT, 'hex'),
      Buffer.from(fragment, 'hex'),
      identity,
    ]))
    .digest()
}

function sealPack(pack: CourtDayPack): string {
  const plaintext = Buffer.from(JSON.stringify(pack))
  const plaintextHash = createHash('sha256').update(plaintext).digest()
  const iv = createHash('sha256')
    .update('simjury-court-day-iv\0')
    .update(String(pack.ordinal))
    .update('\0')
    .update(plaintextHash)
    .digest()
    .subarray(0, 12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(pack.ordinal), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
  const envelope: SealedPackEnvelope = {
    schema: 'simjury.sealed-court-day/v1',
    caseId: courtWeekBootstrap.id,
    revision: courtWeekBootstrap.revision,
    ordinal: pack.ordinal,
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  }
  return JSON.stringify(envelope)
}

rmSync(outputRoot, { recursive: true, force: true })
mkdirSync(outputRoot, { recursive: true })

const requirePinnedMedia = process.env.COURT_WEEK_REQUIRE_PINNED_MEDIA === '1'
let pinnedMedia: CourtWeekRuntimeMediaManifest | undefined
if (existsSync(pinnedMediaPath)) {
  pinnedMedia = courtWeekRuntimeMediaManifestSchema.parse(
    JSON.parse(readFileSync(pinnedMediaPath, 'utf8')),
  )
  assertRuntimeMediaCoverage(elevenMinutesCourtWeek, pinnedMedia)
} else if (requirePinnedMedia) {
  throw new Error(
    'Production Court Week packs require media/court-week-media-manifest.pinned.json ' +
    '(validated authored narration). Set COURT_WEEK_REQUIRE_PINNED_MEDIA=1 only when that file is present.',
  )
}
const packs = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap, pinnedMedia)
for (const pack of packs) {
  const schedule = courtWeekBootstrap.sessions[pack.ordinal - 1]
  if (!schedule) throw new Error(`Missing schedule for day ${pack.ordinal}`)
  const sealed = sealPack(pack)
  if (sealed !== sealPack(pack)) throw new Error(`Day ${pack.ordinal} encryption is not deterministic`)
  writeFileSync(join(outputRoot, schedule.locator), `${sealed}\n`)
}

console.log(`Built ${courtWeekBootstrap.sessions.length} deterministic sealed Court Week packs${pinnedMedia ? ' with pinned cue-range audio' : ' with device-audio fallback'}.'`)
