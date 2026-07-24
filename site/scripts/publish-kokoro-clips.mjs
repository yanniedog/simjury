#!/usr/bin/env node
/**
 * Publish Kokoro MP3s to sharded GitHub Releases without burning the Actions
 * GITHUB_TOKEN REST budget (1k req/hour/repo).
 *
 * Strategy:
 *  - Content-addressed clip ids mean an existing asset name is already correct;
 *    never blind --clobber every MP3.
 *  - Upload only missing individual MP3s so <audio> playback keeps working
 *    (Release assets lack CORS; CSP connect-src is 'self', so browser zip
 *    fetch is not viable on the static host).
 *  - Maintain one clips.zip per shard (merge + single clobber) for durable
 *    bulk storage and cheap full-shard replacement.
 *  - Honor rate-limit reset instead of fixed short sleeps.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const NARRATION_SHARDS = 32
const CLIPS_ZIP = 'clips.zip'
const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}
const clipsRoot = resolve(valueAfter('--clips') ?? 'narration-clips')
const repo = process.env.GH_REPO || process.env.GITHUB_REPOSITORY
if (!repo) {
  console.error('publish-kokoro-clips: GH_REPO or GITHUB_REPOSITORY is required')
  process.exit(1)
}
if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
  console.error('publish-kokoro-clips: GH_TOKEN or GITHUB_TOKEN is required')
  process.exit(1)
}

function sleep(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000))
  const result = spawnSync('sleep', [String(seconds)], { stdio: 'ignore' })
  if (result.status !== 0) {
    // Windows fallback when running the publisher locally.
    spawnSync(process.execPath, ['-e', `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${ms})`], {
      stdio: 'ignore',
    })
  }
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  })
  return result
}

function rateLimitResetMs(stderr = '', stdout = '') {
  const blob = `${stderr}\n${stdout}`
  const resetUnix = blob.match(/X-RateLimit-Reset:\s*(\d+)/i)?.[1]
    ?? blob.match(/"reset"\s*:\s*(\d+)/)?.[1]
  if (resetUnix) {
    const ms = Number(resetUnix) * 1000 - Date.now() + 5_000
    return Math.max(ms, 15_000)
  }
  const retryAfter = blob.match(/Retry-After:\s*(\d+)/i)?.[1]
  if (retryAfter) return Math.max(Number(retryAfter) * 1000, 15_000)
  const api = run('gh', ['api', 'rate_limit', '--jq', '.resources.core.reset'])
  if (api.status === 0) {
    const ms = Number(api.stdout.trim()) * 1000 - Date.now() + 5_000
    if (Number.isFinite(ms)) return Math.max(ms, 15_000)
  }
  return 120_000
}

function isRateLimited(result) {
  const blob = `${result.stderr ?? ''}\n${result.stdout ?? ''}`
  return (
    result.status !== 0 &&
    (/rate limit/i.test(blob) || /HTTP\s*403/.test(blob) || /API rate limit/i.test(blob))
  )
}

function gh(ghArgs, options = {}) {
  for (let attempt = 1; ; attempt++) {
    const result = run('gh', ghArgs, options)
    if (result.status === 0) return result
    if (isRateLimited(result)) {
      const waitMs = rateLimitResetMs(result.stderr, result.stdout)
      console.warn(
        `publish-kokoro-clips: rate limited (attempt ${attempt}); sleeping ${Math.ceil(waitMs / 1000)}s`,
      )
      sleep(waitMs)
      continue
    }
    if (attempt >= 5) {
      console.error(result.stderr || result.stdout || `gh ${ghArgs.join(' ')} failed`)
      process.exit(result.status ?? 1)
    }
    const backoff = Math.min(attempt * 30_000, 180_000)
    console.warn(`publish-kokoro-clips: gh failed (attempt ${attempt}); retry in ${backoff / 1000}s`)
    sleep(backoff)
  }
}

function listAssetNames(tag) {
  const result = gh([
    'api',
    `repos/${repo}/releases/tags/${tag}`,
    '--jq',
    '.assets[].name',
  ])
  return new Set(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  )
}

function downloadAsset(tag, name, dest) {
  const result = gh(
    ['release', 'download', tag, '--repo', repo, '--pattern', name, '--dir', dest, '--clobber'],
    { stdio: 'pipe' },
  )
  return result
}

function uploadFiles(tag, files, { clobber = false } = {}) {
  if (files.length === 0) return
  const args = ['release', 'upload', tag, ...files, '--repo', repo]
  if (clobber) args.push('--clobber')
  gh(args, { stdio: 'inherit' })
}

function zipDir(sourceDir, zipPath) {
  rmSync(zipPath, { force: true })
  const result = run('zip', ['-qr', zipPath, '.'], { cwd: sourceDir })
  if (result.status !== 0) {
    console.error(result.stderr || 'zip failed')
    process.exit(result.status ?? 1)
  }
}

function unzipTo(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true })
  const result = run('unzip', ['-qo', zipPath, '-d', destDir])
  if (result.status !== 0) {
    console.error(result.stderr || 'unzip failed')
    process.exit(result.status ?? 1)
  }
}

let uploadedMp3 = 0
let skippedMp3 = 0
let zipsUpdated = 0

for (let shard = 0; shard < NARRATION_SHARDS; shard++) {
  const shardDir = join(clipsRoot, String(shard))
  if (!existsSync(shardDir)) continue
  const newMp3s = readdirSync(shardDir)
    .filter((name) => name.endsWith('.mp3'))
    .map((name) => join(shardDir, name))
    .filter((path) => statSync(path).isFile())
  if (newMp3s.length === 0) continue

  const tag = `narration-kokoro-${shard}`
  const existing = listAssetNames(tag)
  const missing = newMp3s.filter((path) => !existing.has(basename(path)))
  skippedMp3 += newMp3s.length - missing.length

  const work = mkdtempSync(join(tmpdir(), `kokoro-shard-${shard}-`))
  try {
    const packDir = join(work, 'pack')
    mkdirSync(packDir, { recursive: true })
    if (existing.has(CLIPS_ZIP)) {
      downloadAsset(tag, CLIPS_ZIP, work)
      const zipPath = join(work, CLIPS_ZIP)
      if (existsSync(zipPath)) unzipTo(zipPath, packDir)
    }
    for (const path of newMp3s) {
      cpSync(path, join(packDir, basename(path)))
    }
    const packed = readdirSync(packDir).filter((name) => name.endsWith('.mp3'))
    if (packed.length === 0) {
      console.log(`shard ${shard}: no clips to pack`)
      continue
    }
    const outZip = join(work, CLIPS_ZIP)
    zipDir(packDir, outZip)
    uploadFiles(tag, [outZip], { clobber: true })
    zipsUpdated += 1
    console.log(`shard ${shard}: updated ${CLIPS_ZIP} (${packed.length} clips)`)

    if (missing.length) {
      // Upload in modest batches so a mid-batch rate limit can resume cleanly.
      const batchSize = 25
      for (let i = 0; i < missing.length; i += batchSize) {
        const batch = missing.slice(i, i + batchSize)
        uploadFiles(tag, batch, { clobber: false })
        uploadedMp3 += batch.length
        console.log(
          `shard ${shard}: uploaded ${batch.length} new MP3s (${i + batch.length}/${missing.length})`,
        )
      }
    } else {
      console.log(`shard ${shard}: all ${newMp3s.length} generated MP3s already published`)
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

console.log(
  `publish-kokoro-clips: done; uploaded=${uploadedMp3} skipped_existing=${skippedMp3} zips=${zipsUpdated}`,
)
