#!/usr/bin/env node
/**
 * When the last open PR to main is squash-merged, bump pilot versionName and push to main.
 * Dispatches pilot-android-apk (GITHUB_TOKEN push does not re-trigger workflows).
 *
 * Parity with AR-local mobile-auto-release-on-drain.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bumpPatchVersion, readPilotVersions } from './lib/pilot-version.mjs';

const pilotDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(pilotDir, '..');
const dryRun = process.argv.includes('--dry-run');

const repoArgIdx = process.argv.indexOf('--repo');
const repo =
  (repoArgIdx >= 0 ? process.argv[repoArgIdx + 1] : process.env.GITHUB_REPOSITORY)?.trim() ||
  'yanniedog/simjury';

const ghToken = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
const mergeSha = process.env.MERGE_SHA?.trim() || '';

export const AUTO_BUMP_PREFIX = 'chore(pilot): auto-release bump v';
const POLL_ATTEMPTS = 6;
const POLL_SECONDS = 20;
const SPAWN_TIMEOUT_MS = 60_000;

function gh(args) {
  const env = ghToken ? { ...process.env, GH_TOKEN: ghToken } : process.env;
  const res = spawnSync('gh', args, {
    encoding: 'utf8',
    cwd: repoRoot,
    env,
    timeout: SPAWN_TIMEOUT_MS,
  });
  if (res.status !== 0) {
    throw new Error(`gh ${args.join(' ')} failed: ${(res.stderr || res.stdout || '').trim()}`);
  }
  return (res.stdout || '').trim();
}

function ghTry(args) {
  const env = ghToken ? { ...process.env, GH_TOKEN: ghToken } : process.env;
  const res = spawnSync('gh', args, { encoding: 'utf8', cwd: repoRoot, env, timeout: SPAWN_TIMEOUT_MS });
  if (res.error) throw new Error(`gh ${args.join(' ')} failed: ${res.error.message}`);
  return { ok: res.status === 0, stdout: (res.stdout || '').trim() };
}

function git(args) {
  const res = spawnSync('git', args, { encoding: 'utf8', cwd: repoRoot, timeout: SPAWN_TIMEOUT_MS });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(res.stderr || res.stdout || '').trim()}`);
  }
  return (res.stdout || '').trim();
}

function syncMain() {
  git(['fetch', 'origin', 'main', '--quiet']);
  git(['checkout', '-B', 'main', 'origin/main']);
}

function countOpenPrsToMain() {
  const raw = gh(['pr', 'list', '--state', 'open', '--base', 'main', '--json', 'number', '--repo', repo]);
  const rows = JSON.parse(raw || '[]');
  return Array.isArray(rows) ? rows.length : 0;
}

async function waitForQueueDrain() {
  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt++) {
    const open = countOpenPrsToMain();
    if (open === 0) {
      syncMain();
      return 0;
    }
    if (open > 1) {
      console.log(`pilot-auto-release-on-drain: ${open} open PR(s) — skip (not queue drain)`);
      return open;
    }
    console.log(`pilot-auto-release-on-drain: poll ${attempt}/${POLL_ATTEMPTS} (${open} open PR)`);
    if (attempt === POLL_ATTEMPTS) return open;
    await delay(POLL_SECONDS * 1000);
  }
  return countOpenPrsToMain();
}

function apkReleaseExists(version) {
  return ghTry(['release', 'view', `app-v${version}`, '--repo', repo]).ok;
}

function apkBuildInFlight() {
  const out = ghTry([
    'run', 'list', '--workflow', 'pilot-android-apk.yml',
    '--json', 'status', '-L', '20', '--repo', repo,
  ]).stdout;
  let rows = [];
  try {
    rows = JSON.parse(out || '[]');
  } catch {
    return false;
  }
  return Array.isArray(rows) && rows.some((r) => r.status === 'queued' || r.status === 'in_progress');
}

function dispatchApkBuild(version) {
  if (dryRun) {
    console.log(`pilot-auto-release-on-drain: dry-run — would dispatch pilot-android-apk for v${version}`);
    return;
  }
  gh(['workflow', 'run', 'pilot-android-apk.yml', '--ref', 'main', '--repo', repo]);
  console.log(`pilot-auto-release-on-drain: dispatched pilot-android-apk for v${version}`);
}

function ensureApkForMainHead() {
  const { versionName: version } = readPilotVersions();
  if (apkReleaseExists(version)) {
    console.log(`pilot-auto-release-on-drain: app-v${version} already published`);
    return false;
  }
  if (apkBuildInFlight()) {
    console.log('pilot-auto-release-on-drain: pilot-android-apk already in flight');
    return false;
  }
  dispatchApkBuild(version);
  return true;
}

function alreadyAutoBumpedOnHead() {
  const msg = git(['log', '-1', '--format=%s', 'origin/main']);
  return msg.startsWith(AUTO_BUMP_PREFIX);
}

async function main() {
  if (!ghToken && !dryRun) {
    console.error('pilot-auto-release-on-drain: GH_TOKEN is not set');
    process.exit(1);
  }

  syncMain();

  const remaining = dryRun ? 0 : await waitForQueueDrain();
  if (remaining !== 0) process.exit(0);

  if (alreadyAutoBumpedOnHead()) {
    console.log('pilot-auto-release-on-drain: main already at auto-release bump — ensure APK');
    ensureApkForMainHead();
    process.exit(0);
  }

  const { versionName: current } = readPilotVersions();
  const next = bumpPatchVersion(current);
  console.log(`pilot-auto-release-on-drain: queue drained — bump ${current} → ${next}`);

  if (dryRun) process.exit(0);

  const bump = spawnSync('node', ['pilot/scripts/bump-pilot-patch-version.mjs'], {
    encoding: 'utf8',
    cwd: repoRoot,
  });
  if (bump.status !== 0) {
    throw new Error((bump.stderr || bump.stdout || 'bump-pilot-patch-version failed').trim());
  }

  git(['config', 'user.name', 'github-actions[bot]']);
  git(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  git(['add', 'pilot/app/build.gradle.kts']);

  const prHint = mergeSha ? ` (after ${mergeSha.slice(0, 7)})` : '';
  const message = `${AUTO_BUMP_PREFIX}${next}${prHint}`;
  git(['commit', '-m', message]);

  const push = spawnSync('git', ['push', 'origin', 'main'], {
    encoding: 'utf8',
    cwd: repoRoot,
    timeout: SPAWN_TIMEOUT_MS,
  });
  if (push.status !== 0) {
    throw new Error(`push to main failed: ${(push.stderr || push.stdout || '').trim()}`);
  }
  console.log(`pilot-auto-release-on-drain: pushed v${next} to main`);
  ensureApkForMainHead();
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
