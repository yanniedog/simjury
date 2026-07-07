#!/usr/bin/env node
/**
 * Monotonic versionCode for GHA preview APK builds.
 * Reads build_number from rolling app-apk-latest manifest when present.
 *
 * Usage: node pilot/scripts/bump-android-version-code.mjs [--repo owner/name]
 */
import { readPilotVersions, writePilotVersions } from './lib/pilot-version.mjs';

const TAG = 'app-apk-latest';
const MANIFEST_ASSET = 'app-apk-latest.json';

const repoArgIdx = process.argv.indexOf('--repo');
const repo =
  (repoArgIdx >= 0 ? process.argv[repoArgIdx + 1] : process.env.GITHUB_REPOSITORY)?.trim() ||
  'yanniedog/simjury';

async function fetchRemoteBuildNumber() {
  const url = `https://github.com/${repo}/releases/download/${TAG}/${MANIFEST_ASSET}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    console.log(`bump-android-version-code: no manifest at ${url} (HTTP ${res.status})`);
    return null;
  }
  const manifest = await res.json();
  const n = parseInt(String(manifest.build_number ?? ''), 10);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const { versionName, versionCode: current } = readPilotVersions();
  const remote = await fetchRemoteBuildNumber();
  const runFloor = Number(process.env.GITHUB_RUN_NUMBER ?? 0) || 0;
  const next = remote != null ? Math.max(remote + 1, current, runFloor) : Math.max(current, runFloor);
  if (next === current) {
    console.log(`bump-android-version-code: versionCode stays ${current}`);
    return;
  }
  writePilotVersions({ versionName, versionCode: next });
  console.log(`bump-android-version-code: versionCode ${current} → ${next}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
