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
