import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hostLiveJury,
  joinLiveJury,
  liveInviteFromHash,
  liveInviteUrl,
} from './liveJury'

const TOKEN = 'a'.repeat(43)
const HOST = 'h'.repeat(43)

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
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        room_id: 'room_12',
        case_id: 'dd-0039',
        seat_id: 1,
        seat_token: 's'.repeat(43),
      })))
    vi.stubGlobal('fetch', fetchMock)
    await expect(hostLiveJury('dd-0039', 'Alex')).resolves.toMatchObject({
      roomId: 'room_12',
      caseId: 'dd-0039',
      seatId: 1,
      displayName: 'Alex',
      hostToken: HOST,
    })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/live/rooms/room_12')
  })

  it('closes an abandoned room when the host join fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        room_id: 'room_12',
        invite_token: TOKEN,
        host_token: HOST,
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'join failed' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(hostLiveJury('dd-0039', 'Alex')).rejects.toThrow('join failed')
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
    )).rejects.toThrow('different Daily Docket case')
  })
})
