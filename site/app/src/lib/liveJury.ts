import type { DocketCase } from './v2/caseSchema'
import { stableContentHash } from './v2/caseRevision'

export interface LiveInvite {
  roomId: string
  inviteToken: string
  caseId: string
}

export interface LiveJurySession extends LiveInvite {
  derivationRevision: string | null
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

export const LIVE_JURY_REVISION_MESSAGE =
  'This room was opened under a different version of the case. Start a new room or continue solo; its authored replies cannot safely change mid-room.'

export class LiveJuryRevisionError extends Error {
  constructor() {
    super(LIVE_JURY_REVISION_MESSAGE)
    this.name = 'LiveJuryRevisionError'
  }
}

const OPAQUE = /^[a-zA-Z0-9_-]{1,80}$/
const CAPABILITY = /^[a-zA-Z0-9_-]{43}$/
const CASE_ID = /^dd-[a-z0-9-]{1,60}$/
/** Bump whenever client-side authored-reply derivation changes. */
const DERIVATION_ALGORITHM = 'hybrid-v1'

export function liveJuryDerivationRevision(trial: DocketCase): string {
  return `${DERIVATION_ALGORITHM}-${stableContentHash(trial)}`
}

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

/**
 * Parse an invitation the player pasted in.
 *
 * Clicking a link only works when the app is not already open; anyone who
 * already has today's docket on screen had no way to accept an invitation at
 * all. This accepts a full URL, a bare `#live-jury=` fragment, or the raw
 * triple, so pasting from any chat app works.
 */
export function liveInviteFromText(value: string): LiveInvite | null {
  const text = value.trim()
  if (!text) return null
  const fragment = text.slice(text.indexOf('#live-jury='))
  const direct = text.includes('#live-jury=')
    ? liveInviteFromHash(fragment)
    : null
  if (direct) return direct
  return liveInviteFromHash(`#live-jury=${text.replace(/^#?/, '')}`)
}

/**
 * Code points a display name may not contain: the C0/C1 control characters and
 * the bidirectional overrides, which would let a name reorder the text around
 * it in another juror's transcript. Expressed as ranges rather than a regular
 * expression so the control characters never appear literally in source.
 */
const FORBIDDEN_NAME_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x1f],
  [0x7f, 0x7f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
]

/** Mirrors the Worker's `parseDisplayName`, so the UI rejects what it would. */
export function sanitizeDisplayName(value: string): string | null {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (FORBIDDEN_NAME_RANGES.some(([lo, hi]) => code >= lo && code <= hi)) {
      return null
    }
  }
  const clean = value.trim().replace(/\s+/g, ' ')
  return clean && clean.length <= 32 ? clean : null
}


export interface LiveSeat {
  seatId: number
  displayName: string
}

export interface LiveRoomStatus {
  caseId: string
  seats: LiveSeat[]
  capacity: number
}

function seatsFrom(value: unknown): LiveSeat[] {
  if (!Array.isArray(value)) return []
  return value
    .map((row) => row as { seat_id?: unknown; display_name?: unknown })
    .filter(
      (row) =>
        Number.isInteger(row.seat_id)
        && (row.seat_id as number) >= 1
        && (row.seat_id as number) <= 12
        && typeof row.display_name === 'string'
        && row.display_name.trim().length > 0,
    )
    .map((row) => ({
      seatId: row.seat_id as number,
      displayName: (row.display_name as string).slice(0, 32),
    }))
    .sort((a, b) => a.seatId - b.seatId)
}

/**
 * Who is in the room, before any socket is open. The Worker has always
 * returned the roster from this endpoint; the client used to discard it, so a
 * host had no way to see whether anyone had accepted their invitation.
 */
export async function liveJuryRoomStatus(
  roomId: string,
  inviteToken: string,
): Promise<LiveRoomStatus> {
  const status = await api<{
    case_id: string
    seats?: unknown
    capacity?: unknown
  }>(`/api/live/rooms/${encodeURIComponent(roomId)}`, {
    headers: { Authorization: `Bearer ${inviteToken}` },
  })
  return {
    caseId: status.case_id,
    seats: seatsFrom(status.seats),
    capacity:
      Number.isInteger(status.capacity) && (status.capacity as number) > 0
        ? (status.capacity as number)
        : 12,
  }
}

/** Pre-written invitation text, so a host does not have to compose one. */
export function liveInviteMessage(url: string, caseTitle?: string): string {
  const subject = caseTitle ? `today’s case, “${caseTitle}”` : 'today’s case'
  return [
    `I’ve got a seat for you on the jury for ${subject} on SimJury.`,
    'We watch the same trial, then deliberate together and return a verdict.',
    'About 20 minutes. Your seat link:',
    url,
  ].join('\n')
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
    ) as (Omit<LiveJurySession, 'derivationRevision'> & {
      derivationRevision?: unknown
    }) | null
    const valid = value
      && value.caseId === caseId
      && OPAQUE.test(value.roomId)
      && CAPABILITY.test(value.inviteToken)
      && CAPABILITY.test(value.seatToken)
      && (!value.hostToken || CAPABILITY.test(value.hostToken))
      && CASE_ID.test(value.caseId)
      && Number.isInteger(value.seatId)
      && value.seatId >= 1
      && value.seatId <= 12
    if (!valid) return null
    return {
      ...value,
      derivationRevision: typeof value.derivationRevision === 'string'
        && OPAQUE.test(value.derivationRevision)
        ? value.derivationRevision
        : null,
    }
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
function requireMatchingRevision(
  roomRevision: unknown,
  expectedRevision: string,
): void {
  if (
    sessionRevision(roomRevision) !== expectedRevision
  ) throw new LiveJuryRevisionError()
}

function sessionRevision(value: unknown): string | null {
  return typeof value === 'string' && OPAQUE.test(value) ? value : null
}

export async function verifyLiveJurySession(
  session: LiveJurySession,
  expectedRevision: string,
): Promise<boolean> {
  requireMatchingRevision(session.derivationRevision, expectedRevision)
  try {
    const status = await api<{ case_id: string, derivation_revision?: unknown }>(
      `/api/live/rooms/${encodeURIComponent(session.roomId)}`,
      { headers: { Authorization: `Bearer ${session.inviteToken}` } },
    )
    requireMatchingRevision(status.derivation_revision, expectedRevision)
    return status.case_id === session.caseId
  } catch (error) {
    if (error instanceof LiveJuryApiError && error.status === 404) return false
    throw error
  }
}

async function join(
  invite: LiveInvite,
  displayName: string,
  derivationRevision: string,
): Promise<Omit<LiveJurySession, 'displayName' | 'inviteToken' | 'hostToken'>> {
  const joined = await api<{
    room_id: string
    case_id: string
    derivation_revision?: unknown
    seat_id: number
    seat_token: string
  }>(`/api/live/rooms/${encodeURIComponent(invite.roomId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invite_token: invite.inviteToken,
      participant_key: participantKey(invite.roomId),
      display_name: displayName,
      derivation_revision: derivationRevision,
    }),
  })
  requireMatchingRevision(joined.derivation_revision, derivationRevision)
  return {
    roomId: joined.room_id,
    caseId: joined.case_id,
    derivationRevision,
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
  derivationRevision: string,
): Promise<LiveJurySession> {
  if (!CASE_ID.test(caseId) || !OPAQUE.test(derivationRevision)) {
    throw new Error('This sitting cannot host a live jury.')
  }
  const created = await api<{
    room_id: string
    invite_token: string
    host_token: string
    case_id?: string
    derivation_revision?: unknown
  }>('/api/live/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      case_id: caseId,
      derivation_revision: derivationRevision,
    }),
  })
  const invite: LiveInvite = {
    roomId: created.room_id,
    inviteToken: created.invite_token,
    caseId: created.case_id ?? caseId,
  }
  try {
    requireMatchingRevision(created.derivation_revision, derivationRevision)
    const joined = await join(invite, displayName, derivationRevision)
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
  derivationRevision: string,
): Promise<LiveJurySession> {
  if (invite.caseId !== expectedCaseId) {
    throw new Error('This invitation is for a different Daily Docket case.')
  }
  const status = await api<{ case_id: string, derivation_revision?: unknown }>(
    `/api/live/rooms/${encodeURIComponent(invite.roomId)}`,
    { headers: { Authorization: `Bearer ${invite.inviteToken}` } },
  )
  if (status.case_id !== expectedCaseId) {
    throw new Error('This invitation is for a different Daily Docket case.')
  }
  requireMatchingRevision(status.derivation_revision, derivationRevision)
  const joined = await join(invite, displayName, derivationRevision)
  return { ...invite, ...joined, caseId: joined.caseId, displayName }
}

export async function closeLiveJury(session: LiveJurySession): Promise<void> {
  if (!session.hostToken) return
  await deleteRoom(session.roomId, session.hostToken)
}

export function isRoomGoneError(error: unknown): boolean {
  return error instanceof LiveJuryApiError && error.status === 404
}

export function isLiveJuryRevisionError(
  error: unknown,
): error is LiveJuryRevisionError {
  return error instanceof LiveJuryRevisionError
}
