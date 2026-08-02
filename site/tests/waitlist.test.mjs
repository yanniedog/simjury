import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  parseWaitlistEmail,
  waitlistEmailKey,
  waitlistUtcDay,
  WAITLIST_CONSENT_TEXT,
  WAITLIST_LIMITS,
} from '../src/live-policy.js'
import worker from '../src/worker.js'
import { sqlQuote, unsubscribeStatement } from '../scripts/waitlist-unsubscribe.mjs'

const SALT = 'test-salt-at-least-16-chars'

/**
 * Stand-in for the D1 binding. Rows are the bound parameter arrays, so the
 * assertions can look at exactly what would be written.
 */
function waitlistEnv(overrides = {}) {
  // Rows are the bound parameter arrays, so assertions see exactly what would
  // be written: [email_key, email, consent_text, consented_at, source_day_hash].
  const rows = []
  const unsubscribed = new Set()
  return {
    rows,
    unsubscribed,
    WAITLIST_SALT: SALT,
    ASSETS: { fetch: () => new Response('static', { status: 200 }) },
    WAITLIST: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              run() {
                if (/^\s*UPDATE waitlist/.test(sql)) {
                  // Re-subscribing clears an unsubscribe and nothing else.
                  const [key, consentText, consentedAt] = args
                  if (!/unsubscribed_at IS NOT NULL/.test(sql)) {
                    throw new Error('re-subscribe must only touch unsubscribed rows')
                  }
                  if (unsubscribed.has(key)) {
                    unsubscribed.delete(key)
                    const row = rows.find((r) => r[0] === key)
                    if (row) { row[2] = consentText; row[3] = consentedAt }
                  }
                  return { success: true }
                }
                // The cap and the insert must be one statement: counting first
                // and inserting after lets concurrent signups all pass.
                if (!/NOT EXISTS \(SELECT 1 FROM waitlist WHERE email_key/.test(sql)) {
                  throw new Error('waitlist insert must be idempotent on email_key')
                }
                if (!/SELECT COUNT\(\*\) FROM waitlist WHERE source_day_hash/.test(sql)) {
                  throw new Error('waitlist insert must apply the per-source cap in the same statement')
                }
                const [key, , , , source, cap] = args
                if (rows.some((row) => row[0] === key)) return { success: true }
                if (source !== null && source !== undefined) {
                  const seen = rows.filter((row) => row[4] === source).length
                  if (seen >= cap) return { success: true }
                }
                rows.push(args)
                return { success: true }
              },
            }
          },
        }
      },
    },
    ...overrides,
  }
}

function signup(body, init = {}) {
  return new Request('https://simjury.com/api/waitlist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.7',
      ...(init.headers ?? {}),
    },
    body: JSON.stringify(body),
  })
}

function formPost(body, init = {}) {
  return new Request('https://simjury.com/api/waitlist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'CF-Connecting-IP': '203.0.113.7',
      ...(init.headers ?? {}),
    },
    body,
  })
}

test('accepts a consented address and stores what was agreed', async () => {
  const env = waitlistEnv()
  const response = await worker.fetch(signup({ email: ' Juror@Example.COM ', consent: true }), env)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.equal(env.rows.length, 1)

  const [key, email, consentText, consentedAt, source] = env.rows[0]
  assert.equal(key, 'juror@example.com', 'the key is case-insensitive')
  assert.equal(email, 'Juror@example.com', 'the local-part keeps its case; the domain is lowered')
  assert.equal(consentText, WAITLIST_CONSENT_TEXT)
  assert.ok(!Number.isNaN(Date.parse(consentedAt)), 'the consent timestamp is recorded')
  assert.match(source, /^[0-9a-f]{64}$/, 'the source is a keyed digest, never a raw address')
})

test('the source fingerprint is keyed, not a reversible hash of the IP', async () => {
  // A plain SHA-256 of an IPv4 address is not anonymous: 2^32 values can be
  // hashed exhaustively and looked up. Only the key prevents that, so changing
  // the key alone must change the digest.
  const first = waitlistEnv()
  const second = waitlistEnv({ WAITLIST_SALT: `${SALT}-other` })
  await worker.fetch(signup({ email: 'juror@example.com', consent: true }), first)
  await worker.fetch(signup({ email: 'juror@example.com', consent: true }), second)
  assert.notEqual(first.rows[0][4], second.rows[0][4])

  const unsalted = waitlistEnv({ WAITLIST_SALT: undefined })
  await worker.fetch(signup({ email: 'juror@example.com', consent: true }), unsalted)
  assert.equal(unsalted.rows[0][4], null, 'with no key configured, nothing is stored')
})

test('enforces the per-IP daily cap it declares', async () => {
  const env = waitlistEnv()
  for (let i = 0; i < WAITLIST_LIMITS.signupsPerIpPerDay + 3; i += 1) {
    const response = await worker.fetch(
      signup({ email: `juror${i}@example.com`, consent: true }),
      env,
    )
    // A capped request answers exactly like an accepted one, so a flooder
    // cannot detect where the limit sits.
    assert.equal(response.status, 200)
  }
  assert.equal(env.rows.length, WAITLIST_LIMITS.signupsPerIpPerDay)
})

test('one client hitting the cap does not block another', async () => {
  const env = waitlistEnv()
  for (let i = 0; i < WAITLIST_LIMITS.signupsPerIpPerDay; i += 1) {
    await worker.fetch(signup({ email: `juror${i}@example.com`, consent: true }), env)
  }
  await worker.fetch(
    signup(
      { email: 'elsewhere@example.com', consent: true },
      { headers: { 'CF-Connecting-IP': '198.51.100.9' } },
    ),
    env,
  )
  assert.equal(env.rows.length, WAITLIST_LIMITS.signupsPerIpPerDay + 1)
})

test('accepts the native form post a browser sends when the script never loads', async () => {
  const env = waitlistEnv()
  const response = await worker.fetch(formPost('email=juror%40example.com&consent=on'), env)

  assert.equal(response.status, 200)
  assert.equal(env.rows.length, 1, 'the form action must work without JavaScript')
})

test('a native form post with the consent box unticked is refused', async () => {
  const env = waitlistEnv()
  const response = await worker.fetch(formPost('email=juror%40example.com'), env)

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { ok: false, error: 'CONSENT_REQUIRED' })
  assert.equal(env.rows.length, 0)
})

test('refuses an address with no consent', async () => {
  const env = waitlistEnv()
  const response = await worker.fetch(signup({ email: 'juror@example.com' }), env)

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { ok: false, error: 'CONSENT_REQUIRED' })
  assert.equal(env.rows.length, 0)
})

test('refuses malformed addresses', async () => {
  const env = waitlistEnv()
  for (const email of [
    'not-an-email', 'no@domain', 'two@@at.com', 'sp ace@example.com',
    'a@b.c', '', null, 42, `${'x'.repeat(250)}@example.com`,
    'juror@example.com, other@example.com',
    '"Display Name" <juror@example.com>',
    'juror@example..com',
  ]) {
    const response = await worker.fetch(signup({ email, consent: true }), env)
    assert.equal(response.status, 400, `should refuse ${JSON.stringify(email)}`)
    assert.deepEqual(await response.json(), { ok: false, error: 'INVALID_EMAIL' })
  }
  assert.equal(env.rows.length, 0)
})

test('does not reveal whether an address is already on the list', async () => {
  const env = waitlistEnv()
  const first = await worker.fetch(signup({ email: 'juror@example.com', consent: true }), env)
  const second = await worker.fetch(signup({ email: 'JUROR@Example.com', consent: true }), env)

  assert.equal(first.status, second.status)
  assert.deepEqual(await first.json(), await second.json())
  assert.equal(env.rows.length, 1, 'a repeat signup is idempotent whatever the case')
})

test('rejects methods other than POST without touching the database', async () => {
  const env = waitlistEnv()
  const response = await worker.fetch(
    new Request('https://simjury.com/api/waitlist', { method: 'GET' }),
    env,
  )
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('Allow'), 'POST')
  assert.equal(env.rows.length, 0)
})

test('reports unavailable rather than failing when D1 is unbound', async () => {
  const env = waitlistEnv({ WAITLIST: undefined })
  const response = await worker.fetch(signup({ email: 'juror@example.com', consent: true }), env)
  assert.equal(response.status, 503)
})

test('does not require the live-jury flag', async () => {
  // The docket must keep collecting addresses with live jury switched off.
  const env = waitlistEnv({ LIVE_JURY_ENABLED: 'false' })
  const response = await worker.fetch(signup({ email: 'juror@example.com', consent: true }), env)
  assert.equal(response.status, 200)
})

test('address parsing normalises the domain and keeps the local-part', () => {
  assert.equal(parseWaitlistEmail('  Juror@Example.COM '), 'Juror@example.com')
  assert.equal(parseWaitlistEmail('juror+docket@example.co.uk'), 'juror+docket@example.co.uk')
  assert.equal(parseWaitlistEmail('juror@example.com\n'), 'juror@example.com')
  assert.equal(parseWaitlistEmail(undefined), null)
  assert.equal(waitlistEmailKey('Juror@Example.com'), 'juror@example.com')
  assert.equal(waitlistUtcDay(Date.UTC(2026, 6, 30, 23, 59)), '2026-07-30')
})

test('the consent text on the landing page matches what is stored', () => {
  const landing = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  assert.ok(
    landing.includes(WAITLIST_CONSENT_TEXT),
    'the page must show the exact wording recorded against the address',
  )
})

test('the documented unsubscribe escapes the address instead of interpolating it', () => {
  // `wrangler d1 execute` has no --param, so an earlier version of this doc
  // documented a flag that does not exist and a ?1 nothing ever bound. The
  // quoting lives in a script now, and this asserts the rule it implements:
  // SQLite escapes a single quote by doubling it.
  assert.equal(sqlQuote("o'connor@example.com"), "'o''connor@example.com'")
  assert.equal(sqlQuote('plain@example.com'), "'plain@example.com'")

  const statement = unsubscribeStatement("O'Connor@Example.COM")
  assert.match(statement, /WHERE email_key = 'o''connor@example\.com'$/)
  assert.ok(!statement.includes('?1'), 'no unbound placeholder survives')

  assert.throws(() => unsubscribeStatement('not-an-email'), /Not a valid address/)

  const doc = readFileSync(new URL('../../docs/WAITLIST.md', import.meta.url), 'utf8')
  assert.ok(
    doc.includes('waitlist:unsubscribe'),
    'the doc must point at the script that does the quoting',
  )
  assert.ok(!doc.includes('--param'), 'wrangler has no --param flag')
})

test('a malformed body is refused rather than throwing', async () => {
  // Both parsers can fail on input a client never intended to send: JSON that
  // does not parse, and a form body the runtime cannot read. Each returns null,
  // which must surface as an ordinary refusal, not a 500.
  const env = waitlistEnv()

  const badJson = await worker.fetch(new Request('https://simjury.com/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7' },
    body: '{"email": "juror@example.com", consent',
  }), env)
  assert.equal(badJson.status, 400)
  assert.deepEqual(await badJson.json(), { ok: false, error: 'INVALID_EMAIL' })

  const emptyBody = await worker.fetch(new Request('https://simjury.com/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '',
  }), env)
  assert.equal(emptyBody.status, 400)

  const notAnObject = await worker.fetch(signup('juror@example.com'), env)
  assert.equal(notAnObject.status, 400)

  assert.equal(env.rows.length, 0, 'nothing is written for any malformed body')
})

test('an oversized body is rejected before it is parsed', async () => {
  const env = waitlistEnv()
  const response = await worker.fetch(new Request('https://simjury.com/api/waitlist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': '9000',
      'CF-Connecting-IP': '203.0.113.7',
    },
    body: JSON.stringify({ email: `${'x'.repeat(4000)}@example.com`, consent: true }),
  }), env)
  assert.equal(response.status, 400)
  assert.equal(env.rows.length, 0)
})

test('concurrent signups from one client cannot exceed the cap', async () => {
  // The earlier version counted rows in one round trip and inserted in another,
  // so requests issued together each saw a count below the limit and every one
  // of them landed. Firing them concurrently is the only way to catch that; a
  // sequential loop passes either way.
  const env = waitlistEnv()
  const burst = Array.from(
    { length: WAITLIST_LIMITS.signupsPerIpPerDay * 4 },
    (_, i) => worker.fetch(signup({ email: `flood${i}@example.com`, consent: true }), env),
  )
  const responses = await Promise.all(burst)

  for (const response of responses) assert.equal(response.status, 200)
  assert.equal(
    env.rows.length,
    WAITLIST_LIMITS.signupsPerIpPerDay,
    'the cap holds under concurrency, not just in sequence',
  )
})

test('the cap and the insert are decided in a single statement', async () => {
  // Guard the shape, not just the outcome: a future refactor that splits the
  // count back out would reintroduce the race while the totals still looked right.
  const statements = []
  const env = waitlistEnv({
    WAITLIST: {
      prepare(sql) {
        statements.push(sql)
        return { bind: () => ({ run: () => ({ success: true }), first: () => ({ count: 0 }) }) }
      },
    },
  })
  await worker.fetch(signup({ email: 'juror@example.com', consent: true }), env)
  const conditional = statements.filter((sql) => /INSERT INTO waitlist/.test(sql))
  assert.equal(conditional.length, 1, 'one insert, so there is no window between count and write')
  assert.match(conditional[0], /COUNT\(\*\) FROM waitlist WHERE source_day_hash/)
})

test('an address with shell metacharacters never reaches a command line', () => {
  // `npx` is a .cmd on Windows and needs shell:true, and with a shell Node joins
  // argv into a cmd.exe line without escaping. A local part may legally contain
  // & | ^ and %, all of which parseWaitlistEmail accepts, so passing the address
  // as an argument would let a stored signup run commands on the operator's
  // machine the moment someone honoured their unsubscribe request.
  const source = readFileSync(
    new URL('../scripts/waitlist-unsubscribe.mjs', import.meta.url),
    'utf8',
  )
  assert.ok(
    !/'--command',\s*statement/.test(source),
    'the statement must not be passed as a command-line argument',
  )
  assert.match(source, /'--file', file/, 'it is written to a file this script created')

  // The dangerous characters still parse as valid addresses, which is why the
  // argv route had to go rather than be filtered.
  for (const email of ['a&b@example.com', 'a|b@example.com', 'a^b@example.com', 'a%b@example.com']) {
    assert.equal(parseWaitlistEmail(email), email)
    assert.match(unsubscribeStatement(email), /^UPDATE waitlist SET/)
  }
})

test('signing up again after unsubscribing puts you back on the list', async () => {
  // The insert cannot touch an existing row, so without the follow-up update a
  // returning person was told "You are on the list" while every export kept
  // leaving them out — the page said one thing and the data said another.
  const env = waitlistEnv()
  await worker.fetch(signup({ email: 'juror@example.com', consent: true }), env)
  env.unsubscribed.add('juror@example.com')
  env.rows[0][2] = 'the wording they agreed to last time'
  const before = env.rows[0][3]

  const again = await worker.fetch(signup({ email: 'juror@example.com', consent: true }), env)

  assert.equal(again.status, 200)
  assert.equal(env.unsubscribed.has('juror@example.com'), false, 'the unsubscribe is cleared')
  assert.equal(env.rows.length, 1, 'and no duplicate row appears')

  // Not `notEqual` on the timestamp: both writes can land in the same
  // millisecond on a fast runner, and re-dating to the same instant is still
  // correct. Assert the record was rewritten and never moves backwards.
  assert.equal(env.rows[0][2], WAITLIST_CONSENT_TEXT, 'the current wording is recorded')
  assert.ok(env.rows[0][3] >= before, 'consent is re-dated, never backdated')
  assert.ok(!Number.isNaN(Date.parse(env.rows[0][3])), 'and it is a real timestamp')
})

test('a still-subscribed address is not disturbed by signing up again', async () => {
  const env = waitlistEnv()
  await worker.fetch(signup({ email: 'juror@example.com', consent: true }), env)
  const original = [...env.rows[0]]

  await worker.fetch(signup({ email: 'juror@example.com', consent: true }), env)

  assert.equal(env.rows.length, 1)
  assert.deepEqual(env.rows[0], original, 'the original consent record is left alone')
})

test('addresses that cannot be delivered are refused', () => {
  // These all passed the earlier broad character classes and would have been
  // stored and reported as successful, polluting the exported list.
  for (const email of [
    '.leading@example.com',
    'trailing.@example.com',
    'two..dots@example.com',
    `${'x'.repeat(65)}@example.com`,
    'juror@under_score.com',
    'juror@-leading.com',
    'juror@trailing-.com',
    'juror@example.c',
    `juror${String.fromCharCode(0)}@example.com`,
    `juror${String.fromCharCode(9)}@example.com`,
    'juror@example',
  ]) {
    assert.equal(parseWaitlistEmail(email), null, `should refuse ${JSON.stringify(email)}`)
  }

  // Still accepts what real addresses look like.
  for (const email of [
    'juror+docket@example.co.uk',
    "o'connor@example.com",
    'first.last@sub.example.com',
    'a-b@ex-ample.com',
    'juror%tag@example.com',
  ]) {
    assert.equal(parseWaitlistEmail(email), email, `should accept ${email}`)
  }
})
