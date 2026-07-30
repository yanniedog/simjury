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

const SALT = 'test-salt-at-least-16-chars'

/**
 * Stand-in for the D1 binding. Rows are the bound parameter arrays, so the
 * assertions can look at exactly what would be written.
 */
function waitlistEnv(overrides = {}) {
  const rows = []
  return {
    rows,
    WAITLIST_SALT: SALT,
    ASSETS: { fetch: () => new Response('static', { status: 200 }) },
    WAITLIST: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              first() {
                if (!/COUNT\(\*\)/.test(sql)) throw new Error(`unexpected first(): ${sql}`)
                const [fingerprint] = args
                return { count: rows.filter((row) => row[4] === fingerprint).length }
              },
              run() {
                // ON CONFLICT DO NOTHING keyed on the case-insensitive column:
                // a repeat address must not become a second row.
                if (!sql.includes('ON CONFLICT(email_key) DO NOTHING')) {
                  throw new Error('waitlist insert must be idempotent on email_key')
                }
                if (!rows.some((row) => row[0] === args[0])) rows.push(args)
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

test('the documented unsubscribe command is parameterised', () => {
  // An address may contain an apostrophe (o'connor@example.com); pasting one
  // into a quoted SQL literal breaks the statement at best.
  const doc = readFileSync(new URL('../../docs/WAITLIST.md', import.meta.url), 'utf8')
  const unsubscribe = doc.slice(doc.indexOf('UPDATE waitlist'))
  assert.ok(
    /--param|\?1/.test(unsubscribe.slice(0, 400)),
    'docs/WAITLIST.md must bind the address rather than interpolate it',
  )
})
