import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hostLiveJury,
  joinLiveJury,
  liveJuryDerivationRevision,
  liveInviteFromHash,
  liveInviteUrl,
  loadLiveJurySession,
  verifyLiveJurySession,
} from './liveJury'
import { makeDocketCase } from './v2/fixtures'

const TOKEN = 'a'.repeat(43)
const HOST = 'h'.repeat(43)
const REVISION = 'hybrid-v1-1234abcd'

describe('live jury browser client', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
  })

  it('keeps invite capabilities and case id in the URL fragment', () => {
    const invite = { roomId: 'room_12', inviteToken: TOKEN, caseId: 'dd-0039' }
    expect(liveInviteUrl(invite, 'https://simjury.com/today/'))
      .toBe(`https://simjury.com/today/#live-jury=room_12.${TOKEN}.dd-0039`)
    expect(liveInviteFromHash(`#live-jury=room_12.${TOKEN}.dd-0039`)).toEqual(invite)
    expect(liveInviteFromHash(`#live-jury=room_12.${TOKEN}`)).toBeNull()
    expect(liveInviteFromHash(`#live-jury=room/12.${TOKEN}.dd-0039`)).toBeNull()
  })

  it('creates, joins, and maps wire fields without exposing them to callers', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        room_id: 'room_12',
        invite_token: TOKEN,
        host_token: HOST,
        derivation_revision: REVISION,
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        room_id: 'room_12',
        case_id: 'dd-0039',
        derivation_revision: REVISION,
        seat_id: 1,
        seat_token: 's'.repeat(43),
      })))
    vi.stubGlobal('fetch', fetchMock)
    await expect(hostLiveJury('dd-0039', 'Alex', REVISION)).resolves.toMatchObject({
      roomId: 'room_12',
      caseId: 'dd-0039',
      derivationRevision: REVISION,
      seatId: 1,
      displayName: 'Alex',
      hostToken: HOST,
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      case_id: 'dd-0039',
      derivation_revision: REVISION,
    })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/live/rooms/room_12')
  })

  it('closes an abandoned room when the host join fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        room_id: 'room_12',
        invite_token: TOKEN,
        host_token: HOST,
        derivation_revision: REVISION,
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'join failed' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(hostLiveJury('dd-0039', 'Alex', REVISION)).rejects.toThrow('join failed')
    expect(fetchMock.mock.calls[2][0]).toBe('/api/live/rooms/room_12')
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      method: 'DELETE',
      headers: { Authorization: `Bearer ${HOST}` },
    })
  })

  it('refuses an invitation for a different case', async () => {
    await expect(joinLiveJury(
      { roomId: 'room_12', inviteToken: TOKEN, caseId: 'dd-0037' },
      'dd-0039',
      'Sam',
      REVISION,
    )).rejects.toThrow('different Daily Docket case')
  })

  it('fails visibly before joining a legacy or differently revised room', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ case_id: 'dd-0039' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        case_id: 'dd-0039',
        derivation_revision: 'hybrid-v1-deadbeef',
      })))
    vi.stubGlobal('fetch', fetchMock)
    for (const roomId of ['legacy_room', 'revised_room']) {
      await expect(joinLiveJury(
        { roomId, inviteToken: TOKEN, caseId: 'dd-0039' },
        'dd-0039',
        'Sam',
        REVISION,
      )).rejects.toThrow('different version of the case')
    }
    expect(fetchMock).toHaveBeenCalledTimes(2)

    sessionStorage.setItem('simjury.live.session.dd-0039', JSON.stringify({
      roomId: 'room_12',
      inviteToken: TOKEN,
      caseId: 'dd-0039',
      displayName: 'Alex',
      seatId: 1,
      seatToken: 's'.repeat(43),
    }))
    const legacy = loadLiveJurySession('dd-0039')!
    expect(legacy.derivationRevision).toBeNull()
    await expect(verifyLiveJurySession(legacy, REVISION))
      .rejects.toThrow('continue solo')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('pins both authored case content and the derivation algorithm', () => {
    const trial = makeDocketCase()
    const revised = structuredClone(trial)
    revised.jury.jurors[0].persona += ' Revised.'
    expect(liveJuryDerivationRevision(trial)).toMatch(/^hybrid-v1-[0-9a-f]{8}$/)
    expect(liveJuryDerivationRevision(revised))
      .not.toBe(liveJuryDerivationRevision(trial))
  })
})
