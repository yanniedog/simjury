/**
 * Read/write versionName + versionCode in pilot/app/build.gradle.kts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pilotDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const gradlePath = join(pilotDir, 'app/build.gradle.kts');

export function readPilotVersions() {
  const gradle = readFileSync(gradlePath, 'utf8');
  const nameMatch = gradle.match(/versionName\s*=\s*"([^"]+)"/);
  const codeMatch = gradle.match(/versionCode\s*=\s*(\d+)/);
  return {
    versionName: nameMatch?.[1] ?? '0.1.0',
    versionCode: Number(codeMatch?.[1] ?? 1) || 1,
  };
}

export function writePilotVersions({ versionName, versionCode }) {
  let gradle = readFileSync(gradlePath, 'utf8');
  gradle = gradle.replace(/versionName\s*=\s*"[^"]*"/, `versionName = "${versionName}"`);
  gradle = gradle.replace(/versionCode\s*=\s*\d+/, `versionCode = ${versionCode}`);
  writeFileSync(gradlePath, gradle, 'utf8');
}

/** @param {string} version e.g. 0.1.0 */
export function bumpPatchVersion(version) {
  const parts = version.split('.').map((p) => parseInt(p, 10));
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.join('.');
}
