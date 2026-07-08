#!/usr/bin/env node
/**
 * Self-test for PR bot gate exemption policy.
 * Run: npm run pr:gate-exempt-policy:verify
 */
import {
  gateExemptReasonFromPrMeta,
  isAutoReleaseBumpTitle,
  isBotPrAuthor,
  isChorePrTitle,
} from './lib/pr-gate-exempt.mjs';
import {
  isAutoReleaseCommitOnly,
} from './lib/pr-pilot-auto-release-commit.mjs';

const failures = [];

function check(name, got, want) {
  if (got !== want) failures.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

check('bot login suffix', isBotPrAuthor('github-actions[bot]'), true);
check('human user', isBotPrAuthor({ login: 'yanniedog', type: 'User' }), false);
check('chore colon', isChorePrTitle('chore: update docs'), true);
check('chore scope', isChorePrTitle('chore(ci): bump'), true);
check('feat not chore', isChorePrTitle('feat(mod): replay fix'), false);
check('fix not chore', isChorePrTitle('fix: split hud'), false);

check(
  'human fix requires bots',
  gateExemptReasonFromPrMeta({ title: 'fix: replay split', authorLogin: 'yanniedog', authorType: 'User' }),
  null,
);
check(
  'human chore skips',
  gateExemptReasonFromPrMeta({ title: 'chore: docs', authorLogin: 'yanniedog', authorType: 'User' }),
  'chore',
);
check(
  'bot-authored skips any title',
  gateExemptReasonFromPrMeta({ title: 'feat: automated', authorLogin: 'github-actions[bot]', authorType: 'Bot' }),
  'bot-authored',
);
check(
  'pilot auto-release bump skips bots',
  gateExemptReasonFromPrMeta({
    title: 'chore(pilot): auto-release bump v0.1.3',
    authorLogin: 'github-actions[bot]',
    authorType: 'Bot',
  }),
  'bot-authored',
);
check(
  'pilot auto-release title skips',
  gateExemptReasonFromPrMeta({
    title: 'chore(pilot): auto-release bump v0.1.3',
    authorLogin: 'yanniedog',
    authorType: 'User',
  }),
  'pilot-auto-release',
);
check('auto-release title prefix', isAutoReleaseBumpTitle('chore(pilot): auto-release bump v0.1.3'), true);
check('auto-release files only', isAutoReleaseCommitOnly(['pilot/app/build.gradle.kts']), true);
check('auto-release rejects mixed files', isAutoReleaseCommitOnly(['pilot/app/build.gradle.kts', 'README.md']), false);

if (failures.length) {
  console.error('FAIL verify-pr-gate-exempt-policy:');
  for (const f of failures) console.error('  -', f);
  process.exit(1);
}
console.log('PASS verify-pr-gate-exempt-policy');
