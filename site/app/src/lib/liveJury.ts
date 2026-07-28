export interface LiveInvite {
  roomId: string
  inviteToken: string
  caseId: string
}

export interface LiveJurySession extends LiveInvite {
  displayName: string
  seatId: number
  seatToken: string
  hostToken?: string
}

export interface LiveJuryHealth {
  live_jury_enabled: boolean
  ready: boolean
}

export class LiveJuryApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'LiveJuryApiError'
    this.status = status
  }
}

const OPAQUE = /^[a-zA-Z0-9_-]{1,80}$/
const CAPABILITY = /^[a-zA-Z0-9_-]{43}$/
const CASE_ID = /^dd-[a-z0-9-]{1,60}$/

function patternInner(pattern: RegExp): string {
  return pattern.source.replace(/^\^/, '').replace(/\$$/, '')
}

const LIVE_INVITE_HASH = new RegExp(
  `^#live-jury=(${patternInner(OPAQUE)})\\.(${patternInner(CAPABILITY)})\\.(${patternInner(CASE_ID)})$`,
)

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null
    throw new LiveJuryApiError(
      body?.message ?? 'The live jury could not be reached.',
      response.status,
    )
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
  const match = hash.match(LIVE_INVITE_HASH)
  return match
    ? { roomId: match[1], inviteToken: match[2], caseId: match[3] }
    : null
}

export function liveInviteUrl(
  invite: LiveInvite,
  base = `${window.location.origin}/today/`,
): string {
  return `${base.replace(/#.*$/, '')}#live-jury=${invite.roomId}.${invite.inviteToken}.${invite.caseId}`
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
      && CASE_ID.test(value.caseId)
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

/** Returns false when the room is gone; true when confirmed open. Throws on transport errors. */
export async function verifyLiveJurySession(session: LiveJurySession): Promise<boolean> {
  try {
    const status = await api<{ case_id: string }>(
      `/api/live/rooms/${encodeURIComponent(session.roomId)}`,
      { headers: { Authorization: `Bearer ${session.inviteToken}` } },
    )
    return status.case_id === session.caseId
  } catch (error) {
    if (error instanceof LiveJuryApiError && error.status === 404) return false
    throw error
  }
}

async function join(
  invite: LiveInvite,
  displayName: string,
): Promise<Omit<LiveJurySession, 'displayName' | 'inviteToken' | 'hostToken'>> {
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

async function deleteRoom(roomId: string, hostToken: string): Promise<void> {
  await api(`/api/live/rooms/${encodeURIComponent(roomId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${hostToken}` },
  })
}

export async function hostLiveJury(
  caseId: string,
  displayName: string,
): Promise<LiveJurySession> {
  if (!CASE_ID.test(caseId)) {
    throw new Error('This sitting cannot host a live jury.')
  }
  const created = await api<{
    room_id: string
    invite_token: string
    host_token: string
    case_id?: string
  }>('/api/live/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_id: caseId }),
  })
  const invite: LiveInvite = {
    roomId: created.room_id,
    inviteToken: created.invite_token,
    caseId: created.case_id ?? caseId,
  }
  try {
    const joined = await join(invite, displayName)
    return {
      ...invite,
      ...joined,
      caseId: joined.caseId,
      displayName,
      hostToken: created.host_token,
    }
  } catch (error) {
    await deleteRoom(created.room_id, created.host_token).catch(() => undefined)
    throw error
  }
}

export async function joinLiveJury(
  invite: LiveInvite,
  expectedCaseId: string,
  displayName: string,
): Promise<LiveJurySession> {
  if (invite.caseId !== expectedCaseId) {
    throw new Error('This invitation is for a different Daily Docket case.')
  }
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
  await deleteRoom(session.roomId, session.hostToken)
}

export function isRoomGoneError(error: unknown): boolean {
  return error instanceof LiveJuryApiError && error.status === 404
}
