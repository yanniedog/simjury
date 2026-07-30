export const LIVE_ROUTE_PATTERNS = ['/api/live/*', '/discord/interactions']

export const FREE_BETA_LIMITS = Object.freeze({
  admissionsPerUtcDay: 1_000,
  concurrentRooms: 64,
  seatsPerRoom: 12,
  messagesPerSeat: 40,
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

export function liveJuryEnabled(env) {
  return env.LIVE_JURY_ENABLED === 'true'
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
