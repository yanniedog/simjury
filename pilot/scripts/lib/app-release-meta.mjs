/**
 * GitHub release naming for SimJury pilot APK (parity with AR-local).
 *
 * Rolling tag: app-apk-latest — in-app self-update target
 * Versioned tag: app-v{semver} e.g. app-v0.1.1
 */

export const ROLLING_TAG = 'app-apk-latest';
export const APK_ASSET = 'app-preview.apk';
// Same APK wrapped in a .zip: browsers (Chrome Safe Browsing) silently delete
// bare .apk downloads, but not .zip — so this is the reliable first-install asset.
export const ZIP_ASSET = 'app-preview.zip';
export const MANIFEST_ASSET = 'app-apk-latest.json';
export const QR_ASSET = 'app-preview-qr.png';
export const INSTALL_HTML = 'install.html';

/** @param {string} repo owner/name @param {string} tag */
export function apkDownloadUrl(repo, tag) {
  return `https://github.com/${repo}/releases/download/${tag}/${APK_ASSET}`;
}

/** @param {string} repo owner/name @param {string} tag */
export function zipDownloadUrl(repo, tag) {
  return `https://github.com/${repo}/releases/download/${tag}/${ZIP_ASSET}`;
}

/** @param {string} repo @param {string} tag */
export function manifestReleaseUrl(repo, tag) {
  return `https://github.com/${repo}/releases/download/${tag}/${MANIFEST_ASSET}`;
}

/** @param {string} repo @param {string} tag */
export function qrReleaseUrl(repo, tag) {
  return `https://github.com/${repo}/releases/download/${tag}/${QR_ASSET}`;
}

/** @param {string} repo @param {string} tag */
export function installReleaseUrl(repo, tag) {
  return `https://github.com/${repo}/releases/download/${tag}/${INSTALL_HTML}`;
}

/** @param {string} version */
export function versionTag(version) {
  return `app-v${version}`;
}

/** @param {string} version */
export function releaseTitle(version) {
  return `SimJury pilot — ${version} (Android)`;
}
