export interface LiveInvite {
  roomId: string
  inviteToken: string
}

export interface LiveJurySession extends LiveInvite {
  caseId: string
  displayName: string
  seatId: number
  seatToken: string
  hostToken?: string
}

export interface LiveJuryHealth {
  live_jury_enabled: boolean
  ready: boolean
}

const OPAQUE = /^[a-zA-Z0-9_-]{1,80}$/
const CAPABILITY = /^[a-zA-Z0-9_-]{43}$/

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(body?.message ?? 'The live jury could not be reached.')
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

function participantKey(roomId: string): string {
  const key = `simjury.live.participant.${roomId}`
  const prior = sessionStorage.getItem(key)
  if (prior && OPAQUE.test(prior)) return prior
  const created = crypto.randomUUID().replace(/-/g, '')
  sessionStorage.setItem(key, created)
  return created
}

export function liveInviteFromHash(hash: string): LiveInvite | null {
  const match = hash.match(/^#live-jury=([a-zA-Z0-9_-]{1,80})\.([a-zA-Z0-9_-]{43})$/)
  return match ? { roomId: match[1], inviteToken: match[2] } : null
}

export function liveInviteUrl(
  invite: LiveInvite,
  base = `${window.location.origin}/today/`,
): string {
  return `${base.replace(/#.*$/, '')}#live-jury=${invite.roomId}.${invite.inviteToken}`
}

export function loadLiveJurySession(caseId: string): LiveJurySession | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(`simjury.live.session.${caseId}`) ?? 'null',
    ) as LiveJurySession | null
    return value
      && value.caseId === caseId
      && OPAQUE.test(value.roomId)
      && CAPABILITY.test(value.inviteToken)
      && CAPABILITY.test(value.seatToken)
      && (!value.hostToken || CAPABILITY.test(value.hostToken))
      && Number.isInteger(value.seatId)
      && value.seatId >= 1
      && value.seatId <= 12
      ? value
      : null
  } catch {
    return null
  }
}

export function saveLiveJurySession(session: LiveJurySession): void {
  sessionStorage.setItem(
    `simjury.live.session.${session.caseId}`,
    JSON.stringify(session),
  )
}

export function clearLiveJurySession(caseId: string): void {
  sessionStorage.removeItem(`simjury.live.session.${caseId}`)
}

export function liveJuryHealth(): Promise<LiveJuryHealth> {
  return api('/api/live/healthz')
}

async function join(
  invite: LiveInvite,
  displayName: string,
): Promise<Omit<LiveJurySession, 'displayName' | 'inviteToken'>> {
  const joined = await api<{
    room_id: string
    case_id: string
    seat_id: number
    seat_token: string
  }>(`/api/live/rooms/${encodeURIComponent(invite.roomId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invite_token: invite.inviteToken,
      participant_key: participantKey(invite.roomId),
      display_name: displayName,
    }),
  })
  return {
    roomId: joined.room_id,
    caseId: joined.case_id,
    seatId: joined.seat_id,
    seatToken: joined.seat_token,
  }
}

export async function hostLiveJury(
  caseId: string,
  displayName: string,
): Promise<LiveJurySession> {
  const created = await api<{
    room_id: string
    invite_token: string
    host_token: string
  }>('/api/live/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_id: caseId }),
  })
  const invite = { roomId: created.room_id, inviteToken: created.invite_token }
  const joined = await join(invite, displayName)
  return {
    ...invite,
    ...joined,
    caseId: joined.caseId,
    displayName,
    hostToken: created.host_token,
  }
}

export async function joinLiveJury(
  invite: LiveInvite,
  expectedCaseId: string,
  displayName: string,
): Promise<LiveJurySession> {
  const status = await api<{ case_id: string }>(
    `/api/live/rooms/${encodeURIComponent(invite.roomId)}`,
    { headers: { Authorization: `Bearer ${invite.inviteToken}` } },
  )
  if (status.case_id !== expectedCaseId) {
    throw new Error('This invitation is for a different Daily Docket case.')
  }
  const joined = await join(invite, displayName)
  return { ...invite, ...joined, caseId: joined.caseId, displayName }
}

export async function closeLiveJury(session: LiveJurySession): Promise<void> {
  if (!session.hostToken) return
  await api(`/api/live/rooms/${encodeURIComponent(session.roomId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.hostToken}` },
  })
}
