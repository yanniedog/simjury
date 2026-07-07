#!/usr/bin/env node
/** Bump versionName patch in pilot/app/build.gradle.kts */
import { bumpPatchVersion, readPilotVersions, writePilotVersions } from './lib/pilot-version.mjs';

const { versionName, versionCode } = readPilotVersions();
const next = bumpPatchVersion(versionName);
writePilotVersions({ versionName: next, versionCode });
console.log(`bump-pilot-patch-version: ${versionName} → ${next}`);
