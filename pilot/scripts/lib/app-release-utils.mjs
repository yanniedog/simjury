/**
 * GitHub release helpers for SimJury pilot APK publish.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import QRCode from 'qrcode';
import {
  APK_ASSET,
  INSTALL_HTML,
  MANIFEST_ASSET,
  QR_ASSET,
  ROLLING_TAG,
  ZIP_ASSET,
  installReleaseUrl,
  manifestReleaseUrl,
  qrReleaseUrl,
  zipDownloadUrl,
} from './app-release-meta.mjs';
import { ensureRelease } from './ensure-release.mjs';

export * from './app-release-meta.mjs';

const INSTALL_README = `SimJury — install steps
1. Extract this zip (tap it in your Files app -> Extract).
2. Tap ${APK_ASSET} to install.
3. If prompted, allow install from this app, and if Play Protect warns,
   tap "More details -> Install anyway" (the app is signed and safe).
After this first install, SimJury updates itself in-app — no browser needed again.
`;

/** Standard CRC-32 (IEEE 802.3), pure JS so it has no Node-version dependency. */
let CRC_TABLE;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date/time fields for a ZIP entry. @param {Date} d */
function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/**
 * Build a minimal STORE-method ZIP (no compression — the APK is already
 * compressed) with pure Node built-ins, so CI needs no extra dependency.
 * @param {{name: string, data: Buffer}[]} entries
 * @returns {Buffer}
 */
function buildStoreZip(entries) {
  const { time, date } = dosDateTime(new Date());
  const fileParts = [];
  const centralParts = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data) >>> 0;
    const size = data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed to extract
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: 0 = store
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18); // compressed size
    local.writeUInt32LE(size, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    fileParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory header signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + size;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length
  return Buffer.concat([...fileParts, centralBuf, eocd]);
}

/**
 * Write app-preview.zip (APK + install README) into outDir.
 * @param {string} outDir @param {Buffer} apkData raw APK bytes @returns {string} zip path
 */
export function writeInstallZip(outDir, apkData) {
  mkdirSync(outDir, { recursive: true });
  const zip = buildStoreZip([
    { name: basename(APK_ASSET), data: apkData },
    { name: 'INSTALL-README.txt', data: Buffer.from(INSTALL_README, 'utf8') },
  ]);
  const zipPath = join(outDir, ZIP_ASSET);
  writeFileSync(zipPath, zip);
  return zipPath;
}

/**
 * @param {string} outDir
 * @param {string} downloadUrl
 * @param {string} repo
 * @param {string} tag
 */
export async function generateInstallAssets(outDir, downloadUrl, repo, tag) {
  mkdirSync(outDir, { recursive: true });
  // Point the QR + primary download at the .zip: Chrome silently deletes bare
  // .apk downloads, but not .zip. downloadUrl (the raw .apk) stays as an advanced
  // fallback.
  const zipUrl = zipDownloadUrl(repo, tag);
  const qrPath = join(outDir, QR_ASSET);
  const qrOptions = { width: 512, margin: 2, errorCorrectionLevel: 'M' };
  await QRCode.toFile(qrPath, zipUrl, { type: 'png', ...qrOptions });
  // Inline data URI so install.html is self-contained (release assets are not
  // served relative to each other, so a same-folder <img src> would 404).
  const qrDataUrl = await QRCode.toDataURL(zipUrl, qrOptions);

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
  <p>Scan the QR with your phone camera, or tap the button below to download.</p>
  <img src="${qrDataUrl}" alt="QR code linking to the SimJury install download" width="512" height="512" />
  <p><a class="btn" href="${zipUrl}">Download SimJury (.zip)</a></p>

  <div class="note">
    <strong>Download the .zip, not a bare .apk.</strong> Chrome silently deletes
    <code>.apk</code> downloads (they vanish from your list with no prompt) — but it
    leaves <code>.zip</code> alone. The zip just contains the app; you extract it and
    tap the APK inside. The app is signed and safe.
  </div>

  <h2>Install steps</h2>
  <ol>
    <li>Tap <strong>Download SimJury (.zip)</strong> above — it saves normally and won't disappear.</li>
    <li>Open <strong>Files app &rarr; Downloads</strong>, tap the <strong>.zip</strong>, and
      <strong>Extract</strong> it.</li>
    <li>Tap the extracted <strong>${APK_ASSET}</strong> to install.</li>
    <li>If prompted, allow installs from this app:
      <strong>Settings &rarr; Install unknown apps &rarr; (Files) &rarr; Allow.</strong></li>
    <li>If <strong>Play Protect</strong> shows <em>"Blocked by Play Protect"</em>,
      tap <strong>More details &rarr; Install anyway</strong>.</li>
    <li>If install fails with <em>"App not installed"</em> or a signature mismatch,
      <strong>uninstall any existing SimJury first</strong>, then reinstall — release
      builds are signed with a different key than earlier preview builds.</li>
  </ol>

  <p style="font-size:0.9em">After this first install, SimJury updates itself in-app — no browser needed again.<br>
    Advanced: <a href="${downloadUrl}">direct .apk download</a> (Chrome may silently delete it).</p>

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
  const view = () => {
    const result = spawnSync('gh', ['release', 'view', tag, '--repo', repo], {
      encoding: 'utf8',
      env: { ...process.env, GH_TOKEN: ghToken },
      timeout: 30_000,
    });
    return result.status === 0;
  };
  return ensureRelease({
    view,
    create: () => {
      const createArgs = ['release', 'create', tag, '--title', title, '--notes', notes, '--latest=false'];
      if (targetRef?.trim()) createArgs.push('--target', targetRef.trim());
      gh(ghToken, repo, createArgs);
    },
    update: () => gh(ghToken, repo, ['release', 'edit', tag, '--title', title, '--notes', notes]),
  });
}
