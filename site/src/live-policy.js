export const LIVE_ROUTE_PATTERNS = ['/api/live/*', '/discord/interactions']

export const FREE_BETA_LIMITS = Object.freeze({
  admissionsPerUtcDay: 1_000,
  concurrentRooms: 64,
  messagesPerSeat: 40,
  messageCharacters: 500,
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
