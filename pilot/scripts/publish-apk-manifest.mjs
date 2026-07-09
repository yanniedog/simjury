#!/usr/bin/env node
/**
 * Publish Android preview APK to GitHub Releases (AR-local parity):
 * - Rolling tag app-apk-latest (manifest + in-app self-update)
 * - Versioned tag app-v{semver}
 *
 * Usage: GH_TOKEN=… node pilot/scripts/publish-apk-manifest.mjs --apk <path> [--repo owner/name]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APK_ASSET,
  MANIFEST_ASSET,
  ROLLING_TAG,
  apkDownloadUrl,
  ensureGitHubRelease,
  generateInstallAssets,
  gh,
  manifestReleaseUrl,
  releaseTitle,
  versionTag,
  writeInstallZip,
  zipDownloadUrl,
} from './lib/app-release-utils.mjs';
import { readPilotVersions } from './lib/pilot-version.mjs';

const pilotDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const repoArgIdx = process.argv.indexOf('--repo');
const repo =
  (repoArgIdx >= 0 ? process.argv[repoArgIdx + 1] : process.env.GITHUB_REPOSITORY)?.trim() ||
  'yanniedog/simjury';

const apkArgIdx = process.argv.indexOf('--apk');
const localApkPath = apkArgIdx >= 0 ? process.argv[apkArgIdx + 1]?.trim() : '';
const ghToken = process.env.GH_TOKEN?.trim();

function sha256File(path) {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

function ensureRollingReleaseExists() {
  const title = 'SimJury pilot (rolling preview APK)';
  const notes =
    'Rolling preview APK for in-app self-update. Updated by **pilot-android-apk** on GitHub Actions.';
  ensureGitHubRelease(ghToken, repo, ROLLING_TAG, title, notes);
}

async function publishVersionedRelease({ apkBuf, version, buildNumber, outDir }) {
  const tag = versionTag(version);
  const title = releaseTitle(version);
  const notes = [
    `## ${version} (build ${buildNumber})`,
    '',
    'Preview APK published by **pilot-android-apk** (GitHub Actions).',
    '',
    'Scan **app-preview-qr.png** or open **install.html** on this release.',
  ].join('\n');

  const versionOutDir = join(outDir, 'versioned');
  mkdirSync(versionOutDir, { recursive: true });
  const apkPath = join(versionOutDir, APK_ASSET);
  writeFileSync(apkPath, apkBuf);
  const zipPath = writeInstallZip(versionOutDir, apkBuf);

  const downloadUrl = apkDownloadUrl(repo, tag);
  const { qrPath, installPath } = await generateInstallAssets(versionOutDir, downloadUrl, repo, tag);

  const targetRef = process.env.GITHUB_SHA?.trim() || '';
  ensureGitHubRelease(ghToken, repo, tag, title, notes, targetRef);
  gh(ghToken, repo, ['release', 'upload', tag, apkPath, zipPath, qrPath, installPath, '--clobber']);
  console.log(`Versioned release ${tag}: https://github.com/${repo}/releases/tag/${tag}`);
}

async function main() {
  if (!ghToken) {
    console.error('GH_TOKEN is not set');
    process.exit(1);
  }
  if (!localApkPath) {
    console.error('usage: node pilot/scripts/publish-apk-manifest.mjs --apk <path> [--repo owner/name]');
    process.exit(1);
  }

  const apkBuf = readFileSync(localApkPath);
  const { versionName: version, versionCode: buildNumber } = readPilotVersions();

  const outDir = join(pilotDir, 'build/apk-publish');
  mkdirSync(outDir, { recursive: true });
  const apkPath = join(outDir, APK_ASSET);
  writeFileSync(apkPath, apkBuf);
  const zipPath = writeInstallZip(outDir, apkBuf);

  const sha256 = sha256File(apkPath);
  const downloadUrl = apkDownloadUrl(repo, ROLLING_TAG);
  const manifest = {
    schema_version: 1,
    version,
    build_number: String(buildNumber),
    download_url: downloadUrl,
    sha256,
    bytes: apkBuf.length,
    published_at: new Date().toISOString(),
    repo,
    tag: ROLLING_TAG,
    profile: 'preview',
    build_source: 'gha',
  };

  const manifestPath = join(outDir, MANIFEST_ASSET);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  const { qrPath, installPath, qrUrl, installUrl } = await generateInstallAssets(
    outDir,
    downloadUrl,
    repo,
    ROLLING_TAG,
  );

  console.log(`Publishing ${ROLLING_TAG} to ${repo} (v${version} build ${buildNumber}, ${apkBuf.length} bytes)…`);
  ensureRollingReleaseExists();
  const rollingNotes = [
  `Rolling preview APK — **v${version}** (build ${buildNumber}).`,
  '',
  `Manifest: ${manifestReleaseUrl(repo, ROLLING_TAG)}`,
  ].join('\n');
  ensureGitHubRelease(ghToken, repo, ROLLING_TAG, 'SimJury pilot (rolling preview APK)', rollingNotes);

  gh(ghToken, repo, [
    'release',
    'upload',
    ROLLING_TAG,
    apkPath,
    zipPath,
    manifestPath,
    qrPath,
    installPath,
    '--clobber',
  ]);

  console.log(`Published ${downloadUrl}`);
  console.log(`Manifest: ${manifestReleaseUrl(repo, ROLLING_TAG)}`);
  console.log(`QR PNG: ${qrUrl}`);
  console.log(`Install page: ${installUrl}`);

  await publishVersionedRelease({ apkBuf, version, buildNumber, outDir });

  const summaryPath = process.env.GITHUB_STEP_SUMMARY?.trim();
  if (summaryPath) {
    writeFileSync(
      summaryPath,
      [
        '### SimJury preview APK',
        '',
        `Version **${version}** (build ${buildNumber})`,
        '',
        `| Asset | URL |`,
        `|---|---|`,
        `| ZIP (recommended install) | ${zipDownloadUrl(repo, ROLLING_TAG)} |`,
        `| APK (rolling) | ${downloadUrl} |`,
        `| Manifest | ${manifestReleaseUrl(repo, ROLLING_TAG)} |`,
        `| Install page | ${installUrl} |`,
        '',
      ].join('\n'),
      { flag: 'a' },
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
