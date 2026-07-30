export const LIVE_ROUTE_PATTERNS = ['/api/live/*', '/discord/interactions']

/** The only non-live path the Worker may answer. Everything else is static. */
export const WAITLIST_ROUTE = '/api/waitlist'

export const WAITLIST_LIMITS = Object.freeze({
  emailCharacters: 254, // RFC 5321 maximum length of a forward path
  signupsPerIpPerDay: 5,
})

/**
 * Consent recorded verbatim beside every address. The landing page renders this
 * exact string, so what someone agreed to can always be reproduced from the
 * row itself rather than from whatever the page happens to say later.
 */
export const WAITLIST_CONSENT_TEXT =
  'I want email updates about The Daily Docket. I can unsubscribe at any time.'

export const FREE_BETA_LIMITS = Object.freeze({
  admissionsPerUtcDay: 1_000,
  concurrentRooms: 64,
  seatsPerRoom: 12,
  messagesPerSeat: 40,
  // A sitting has three stages, so a seat needs only a handful of genuine
  // transitions. The allowance is generous enough for a reread or a reconnect
  // and small enough that free frames cannot be farmed.
  stageChangesPerSeat: 12,
  messageCharacters: 500,
  frameCharacters: 1_024,
  historyEvents: 120,
  displayNameCharacters: 32,
  roomTtlSeconds: 2 * 60 * 60,
})

export function isLiveRoute(pathname) {
  return pathname === '/discord/interactions'
    || pathname === '/api/live'
    || pathname.startsWith('/api/live/')
}

export function isWaitlistRoute(pathname) {
  return pathname === WAITLIST_ROUTE
}

export function liveJuryEnabled(env) {
  return env.LIVE_JURY_ENABLED === 'true'
}

/**
 * Validate and normalise a submitted address.
 *
 * Deliberately conservative: one `@`, a dot-bearing domain, no whitespace, no
 * angle brackets or commas that would let a display name or a second recipient
 * ride along. Anything unusual is refused rather than stored and puzzled over
 * later — a waitlist address that cannot be mailed is worthless anyway.
 *
 * Returns the lowercased address, or null.
 */
export function parseWaitlistEmail(value) {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (email.length < 6 || email.length > WAITLIST_LIMITS.emailCharacters) return null
  // Domain may carry several labels (example.co.uk); the TLD must be letters.
  if (!/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/.test(email)) return null
  if (email.includes('..')) return null
  return email
}

/**
 * Bucket a signup by UTC day so a repeat submission is an idempotent update
 * rather than a duplicate row.
 */
export function waitlistUtcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10)
}

export function parseOpaqueId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : null
}

export function decodeOpaqueId(segment) {
  try {
    return parseOpaqueId(decodeURIComponent(segment))
  } catch {
    return null
  }
}

export function parseSeatId(value) {
  return typeof value === 'string' && /^(?:[1-9]|1[0-2])$/.test(value) ? value : null
}

export function parseCapability(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{43}$/.test(value) ? value : null
}

export function parseCaseId(value) {
  return typeof value === 'string' && /^dd-[a-z0-9-]{1,60}$/.test(value) ? value : null
}

export function parseDerivationRevision(value) {
  return parseOpaqueId(value)
}

export function parseDisplayName(value) {
  if (typeof value !== 'string'
    || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/i.test(value)) return null
  const clean = value.trim().replace(/\s+/g, ' ')
  return clean && clean.length <= FREE_BETA_LIMITS.displayNameCharacters ? clean : null
}

export function roomRoute(pathname) {
  const match = pathname.match(/^\/api\/live\/rooms\/([^/]+)$/)
  if (!match) return null
  return decodeOpaqueId(match[1])
}

export function roomSocketRoute(pathname) {
  const match = pathname.match(/^\/api\/live\/rooms\/([^/]+)\/socket$/)
  return match ? decodeOpaqueId(match[1]) : null
}

export function socketCredentialsFromProtocols(value) {
  if (typeof value !== 'string') return null
  const protocols = value.split(',').map((part) => part.trim())
  const seatToken = protocols.length === 3 && protocols[0] === 'simjury-v2'
    ? parseCapability(protocols[1])
    : null
  const derivationRevision = parseDerivationRevision(protocols[2])
  return seatToken && derivationRevision ? { seatToken, derivationRevision } : null
}

function safeText(value) {
  if (typeof value !== 'string'
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/i.test(value)) {
    return null
  }
  const clean = value.trim().replace(/[ \t]+/g, ' ')
  return clean && clean.length <= FREE_BETA_LIMITS.messageCharacters ? clean : null
}

/**
 * Where a juror has reached in the sitting. Jurors in a shared room arrive at
 * the jury room minutes apart, and nothing used to tell the others whether to
 * wait or start, so a room announces its progress.
 */
export const SITTING_STAGES = Object.freeze(['trial', 'juryroom', 'verdict'])

export function parseLiveEvent(value) {
  if (typeof value !== 'string' || value.length > FREE_BETA_LIMITS.frameCharacters) return null
  try {
    const event = JSON.parse(value)
    if (event?.type === 'message') {
      const text = safeText(event.text)
      return text ? { type: 'message', text } : null
    }
    if (event?.type === 'stage') {
      return SITTING_STAGES.includes(event.stage)
        ? { type: 'stage', stage: event.stage }
        : null
    }
    if (event?.type === 'position' && ['G', 'NG', 'U'].includes(event.position)) {
      const reason = event.reason === undefined ? undefined : safeText(event.reason)
      return event.reason === undefined || reason
        ? { type: 'position', position: event.position, ...(reason ? { reason } : {}) }
        : null
    }
  } catch {
    return null
  }
  return null
}

export function bearerCapability(request) {
  const match = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)
  return match ? match[1] : null
}

export function roomExpiryCutoff(now = Date.now()) {
  return now - FREE_BETA_LIMITS.roomTtlSeconds * 1_000
}

export function admissionDecision({ admissions, activeRooms, duplicateRoomId, roomExists, roomId }) {
  if (duplicateRoomId) return duplicateRoomId === roomId ? 'duplicate' : 'mismatch'
  if (admissions >= FREE_BETA_LIMITS.admissionsPerUtcDay) return 'capped'
  if (!roomExists && activeRooms >= FREE_BETA_LIMITS.concurrentRooms) return 'capped'
  return 'admit'
}

export function seatMaySend(messages) {
  return Number.isInteger(messages) && messages >= 0
    && messages < FREE_BETA_LIMITS.messagesPerSeat
}

/**
 * May this seat announce another stage change for free?
 *
 * Stage pings are exempt from the message budget so that moving through the
 * sitting cannot exhaust it. Left unbounded that is an amplification channel:
 * every frame stores an event and broadcasts to every peer at no cost. A seat
 * that has spent its stage allowance falls back to the ordinary budget, so the
 * exemption stays a convenience rather than a free channel.
 */
export function seatMayAnnounceStage(stageChanges) {
  return Number.isInteger(stageChanges) && stageChanges >= 0
    && stageChanges < FREE_BETA_LIMITS.stageChangesPerSeat
}

export function unavailable(reason = 'LIVE_JURY_DISABLED', status = 503) {
  return Response.json({
    ok: false,
    code: reason,
    message: 'Live juries are unavailable. Solo deliberation remains available.',
    solo_path: '/today/',
  }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
