#!/usr/bin/env node
/**
 * Unsubscribe one address from the waitlist.
 *
 * `wrangler d1 execute` takes only `--command` or `--file`; it has no way to
 * bind a parameter. Building the statement by hand is therefore the operator's
 * problem, and an address may legally contain an apostrophe
 * (`o'connor@example.com`), which ends the SQL string early. This does the
 * quoting once, correctly, so nobody has to remember the rule at the moment
 * they are trying to honour someone's unsubscribe request.
 *
 * Usage:
 *   node scripts/waitlist-unsubscribe.mjs them@example.com [--dry-run]
 */
import { spawnSync } from 'node:child_process';
import { parseWaitlistEmail, waitlistEmailKey } from '../src/live-policy.js';

/**
 * Quote a value as a SQLite string literal.
 *
 * SQLite escapes a single quote by doubling it — there is no backslash escape,
 * so doubling is the whole rule.
 */
export function sqlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function unsubscribeStatement(email) {
  const key = waitlistEmailKey(parseWaitlistEmail(email));
  if (!key) throw new Error(`Not a valid address: ${email}`);
  return `UPDATE waitlist SET unsubscribed_at = datetime('now') WHERE email_key = ${sqlQuote(key)}`;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const email = args.find((arg) => !arg.startsWith('--'));
  if (!email) {
    console.error('Usage: node scripts/waitlist-unsubscribe.mjs <email> [--dry-run]');
    process.exit(2);
  }

  let statement;
  try {
    statement = unsubscribeStatement(email);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }

  if (dryRun) {
    console.log(statement);
    return;
  }

  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'simjury-waitlist', '--remote', '--command', statement],
    { encoding: 'utf8', stdio: 'inherit', shell: process.platform === 'win32' },
  );
  process.exit(result.status ?? 1);
}

if (process.argv[1] && process.argv[1].endsWith('waitlist-unsubscribe.mjs')) main();
