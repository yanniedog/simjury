#!/usr/bin/env node
/**
 * When the last open PR to main is squash-merged, bump pilot versionName and push directly to main.
 * Fallback: open a gate-exempt bump PR when protected main rejects the push.
 *
 * Parity with AR-local mobile-auto-release-on-drain.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pushHeadToMain } from '../../scripts/pilot-auto-release-commit.mjs';
import { AUTO_RELEASE_BUMP_PREFIX } from '../../scripts/lib/pr-pilot-auto-release-commit.mjs';
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

export const AUTO_BUMP_PREFIX = AUTO_RELEASE_BUMP_PREFIX;
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
  if (res.error) {
    throw new Error(`gh ${args.join(' ')} failed to execute: ${res.error.message}`);
  }
  return { ok: res.status === 0, stdout: (res.stdout || '').trim(), stderr: (res.stderr || '').trim() };
}

function git(args) {
  const res = spawnSync('git', args, {
    encoding: 'utf8',
    cwd: repoRoot,
    timeout: SPAWN_TIMEOUT_MS,
  });
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

export async function waitForQueueDrain({
  countOpen = countOpenPrsToMain,
  sleep = delay,
  syncAfterDrain = syncMain,
} = {}) {
  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt++) {
    const open = countOpen();
    if (open === 0) {
      syncAfterDrain();
      return 0;
    }
    if (open > 1) {
      console.log(
        `pilot-auto-release-on-drain: ${open} open PR(s) to main — skip release (not queue drain)`,
      );
      return open;
    }
    console.log(
      `pilot-auto-release-on-drain: ${open} open PR(s) — poll ${attempt}/${POLL_ATTEMPTS} (possible simultaneous merge)`,
    );
    if (attempt === POLL_ATTEMPTS) {
      console.log('pilot-auto-release-on-drain: queue not drained after polling — skip release');
      return open;
    }
    await sleep(POLL_SECONDS * 1000);
  }
  return countOpen();
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
  console.log(`pilot-auto-release-on-drain: dispatched pilot-android-apk for v${version} on main`);
}

export function ensureApkForMainHead({
  readVersion = () => readPilotVersions().versionName,
  releaseExists = apkReleaseExists,
  buildInFlight = apkBuildInFlight,
  dispatch = dispatchApkBuild,
} = {}) {
  const version = readVersion();
  if (releaseExists(version)) {
    console.log(`pilot-auto-release-on-drain: app-v${version} already published — no APK dispatch`);
    return false;
  }
  if (buildInFlight()) {
    console.log('pilot-auto-release-on-drain: pilot-android-apk already queued/in-progress — no APK dispatch');
    return false;
  }
  dispatch(version);
  return true;
}

function readHeadCommitMessage() {
  return git(['log', '-1', '--format=%s', 'origin/main']);
}

function readHeadCommitSha() {
  return git(['rev-parse', 'origin/main']);
}

function alreadyAutoBumpedOnHead() {
  return readHeadCommitMessage().startsWith(AUTO_BUMP_PREFIX);
}

function listOpenAutoBumpPrs(nextVersion) {
  const raw = gh([
    'pr', 'list', '--state', 'open', '--base', 'main', '--json', 'number,title,url', '--repo', repo,
  ]);
  const rows = JSON.parse(raw || '[]');
  if (!Array.isArray(rows)) return [];
  const titlePrefix = `${AUTO_BUMP_PREFIX}${nextVersion}`;
  return rows.filter((row) => row.title?.startsWith(titlePrefix));
}

function bumpBranchName(nextVersion) {
  return `chore/pilot-auto-release-v${nextVersion}`;
}

function enableAutoMerge(prNumber) {
  gh(['pr', 'merge', String(prNumber), '--squash', '--auto', '--repo', repo]);
}

function publishViaPullRequest(next, message) {
  const branchName = bumpBranchName(next);
  const existing = listOpenAutoBumpPrs(next);
  if (existing.length > 0) {
    const pr = existing[0];
    console.log(`pilot-auto-release-on-drain: open bump PR #${pr.number} (${pr.url}) — ensure auto-merge`);
    enableAutoMerge(pr.number);
    return pr.number;
  }

  git(['checkout', '-B', branchName]);
  git(['push', '-u', 'origin', branchName, '--force-with-lease']);

  const prHint = mergeSha ? `\n- Trigger merge: \`${mergeSha.slice(0, 7)}\`` : '';
  const body = [
    'Automated patch version bump after the PR queue to `main` drained.',
    '',
    `- Version: **${next}**${prHint}`,
    '',
    'Gate-exempt auto-release PR (bot gates skipped). Auto-merge enabled; **pilot-android-apk** builds when this lands on `main`.',
    '',
    'Prefer direct push to `main` via `pilot-auto-release-on-queue-drain` — fallback when ruleset bypass is not configured.',
  ].join('\n');

  const prUrl = gh([
    'pr', 'create', '--base', 'main', '--head', branchName, '--title', message, '--body', body, '--repo', repo,
  ]);
  const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
  if (!prNumber) throw new Error(`pilot-auto-release-on-drain: could not parse PR number from ${prUrl}`);

  enableAutoMerge(prNumber);
  console.log(`pilot-auto-release-on-drain: opened fallback PR #${prNumber} with auto-merge (${prUrl})`);
  return Number(prNumber);
}

function publishDirectToMain(next, message) {
  if (dryRun) {
    console.log(`pilot-auto-release-on-drain: dry-run — would push ${message} to main`);
    return 'dry-run';
  }

  const push = pushHeadToMain();
  if (push.ok) {
    console.log(`pilot-auto-release-on-drain: pushed v${next} to main`);
    ensureApkForMainHead();
    return 'direct';
  }

  if (push.protected) {
    console.warn('pilot-auto-release-on-drain: direct push blocked — falling back to gate-exempt bump PR');
    return publishViaPullRequest(next, message);
  }

  throw new Error(push.error || 'pilot-auto-release-on-drain: push to main failed');
}

async function main() {
  if (!ghToken && !dryRun) {
    console.error('pilot-auto-release-on-drain: GH_TOKEN is not set');
    process.exit(1);
  }

  syncMain();

  const remaining = dryRun ? 0 : await waitForQueueDrain();
  if (dryRun) console.log('pilot-auto-release-on-drain: dry-run — skipping open PR count (assume drained)');
  if (remaining !== 0) process.exit(0);

  if (alreadyAutoBumpedOnHead()) {
    console.log(`pilot-auto-release-on-drain: origin/main already at auto-release bump (${readHeadCommitSha()}) — skip`);
    ensureApkForMainHead();
    process.exit(0);
  }

  const { versionName: current } = readPilotVersions();
  const next = bumpPatchVersion(current);
  console.log(`pilot-auto-release-on-drain: queue drained — bump ${current} → ${next}`);

  const pending = listOpenAutoBumpPrs(next);
  if (pending.length > 0) {
    console.log(`pilot-auto-release-on-drain: bump PR already open for v${next} (#${pending[0].number}) — skip`);
    enableAutoMerge(pending[0].number);
    process.exit(0);
  }

  if (dryRun) {
    console.log(`pilot-auto-release-on-drain: dry-run — would bump and push v${next} to main`);
    process.exit(0);
  }

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

  publishDirectToMain(next, message);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
