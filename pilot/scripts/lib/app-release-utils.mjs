/**
 * GitHub release helpers for SimJury pilot APK publish.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';
import {
  INSTALL_HTML,
  MANIFEST_ASSET,
  QR_ASSET,
  ROLLING_TAG,
  installReleaseUrl,
  manifestReleaseUrl,
  qrReleaseUrl,
} from './app-release-meta.mjs';

export * from './app-release-meta.mjs';

/**
 * @param {string} outDir
 * @param {string} downloadUrl
 * @param {string} repo
 * @param {string} tag
 */
export async function generateInstallAssets(outDir, downloadUrl, repo, tag) {
  mkdirSync(outDir, { recursive: true });
  const qrPath = join(outDir, QR_ASSET);
  const qrOptions = { width: 512, margin: 2, errorCorrectionLevel: 'M' };
  await QRCode.toFile(qrPath, downloadUrl, { type: 'png', ...qrOptions });
  // Inline data URI so install.html is self-contained (release assets are not
  // served relative to each other, so a same-folder <img src> would 404).
  const qrDataUrl = await QRCode.toDataURL(downloadUrl, qrOptions);

  const manifestUrl = manifestReleaseUrl(repo, ROLLING_TAG);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Install SimJury APK</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    img { display: block; width: 16rem; height: 16rem; margin: 1rem auto; }
    a { word-break: break-all; }
    ol { padding-left: 1.25rem; }
    li { margin: 0.4rem 0; }
    .note { background: #fff8e1; border: 1px solid #f0d98c; border-radius: 0.5rem; padding: 0.75rem 1rem; }
    .btn { display: inline-block; background: #1a73e8; color: #fff; text-decoration: none; padding: 0.6rem 1rem; border-radius: 0.5rem; margin: 0.5rem 0; }
    @media (prefers-color-scheme: dark) {
      body { background: #111; color: #eee; }
      .note { background: #2a2410; border-color: #6b5a1e; }
    }
  </style>
</head>
<body>
  <h1>Install SimJury</h1>
  <p>Scan the QR with Android Chrome, or tap the download button below.</p>
  <img src="${qrDataUrl}" alt="QR code linking to the SimJury APK download" width="512" height="512" />
  <p><a class="btn" href="${downloadUrl}">Download SimJury APK</a></p>

  <div class="note">
    <strong>Android will try to block this APK because it isn't from the Play Store.</strong>
    That's expected — the file is safe, but you must confirm each prompt or the download
    silently disappears from your list.
  </div>

  <h2>Install steps</h2>
  <ol>
    <li>Tap <strong>Download</strong> above. If Chrome warns
      <em>"This type of file can harm your device"</em>, tap the menu / arrow and choose
      <strong>Download anyway</strong> — do not dismiss it, or the file is discarded.</li>
    <li>Open the APK from your <strong>Files app &rarr; Downloads</strong>
      (more reliable than Chrome's download list).</li>
    <li>If prompted, allow installs from this app:
      <strong>Settings &rarr; Install unknown apps &rarr; (Chrome or Files) &rarr; Allow.</strong></li>
    <li>If <strong>Play Protect</strong> shows <em>"Blocked by Play Protect"</em>,
      tap <strong>More details &rarr; Install anyway</strong>.</li>
    <li>If install fails with <em>"App not installed"</em> or a signature mismatch,
      <strong>uninstall any existing SimJury first</strong>, then reinstall — release
      builds are signed with a different key than earlier preview builds.</li>
  </ol>

  <p>Still vanishing? In the Play Store: <strong>Profile &rarr; Play Protect &rarr; Settings</strong>,
     turn off scanning, install, then turn it back on.</p>

  <p>Direct link: <a href="${downloadUrl}">${downloadUrl}</a></p>
  <p>Manifest: <a href="${manifestUrl}">${MANIFEST_ASSET}</a></p>
</body>
</html>`;
  const installPath = join(outDir, INSTALL_HTML);
  writeFileSync(installPath, html);
  return { qrPath, installPath, qrUrl: qrReleaseUrl(repo, tag), installUrl: installReleaseUrl(repo, tag) };
}

/**
 * @param {string} ghToken
 * @param {string} repo
 * @param {string[]} args gh subcommand args (after "gh")
 */
export function gh(ghToken, repo, args) {
  const full = args.includes('--repo') ? args : [...args, '--repo', repo];
  return execFileSync('gh', full, {
    encoding: 'utf8',
    env: { ...process.env, GH_TOKEN: ghToken },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  });
}

/**
 * @param {string} ghToken
 * @param {string} repo
 * @param {string} tag
 * @param {string} title
 * @param {string} notes
 * @param {string} [targetRef]
 */
export function ensureGitHubRelease(ghToken, repo, tag, title, notes, targetRef) {
  const view = spawnSync('gh', ['release', 'view', tag, '--repo', repo], {
    encoding: 'utf8',
    env: { ...process.env, GH_TOKEN: ghToken },
    timeout: 30_000,
  });
  if (view.status !== 0) {
    const createArgs = ['release', 'create', tag, '--title', title, '--notes', notes, '--latest=false'];
    if (targetRef?.trim()) createArgs.push('--target', targetRef.trim());
    gh(ghToken, repo, createArgs);
    return 'created';
  }
  gh(ghToken, repo, ['release', 'edit', tag, '--title', title, '--notes', notes]);
  return 'updated';
}
