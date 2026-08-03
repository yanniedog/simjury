import { BOOTSTRAP_KEY_FRAGMENT } from './keyBootstrap'
import { courtDayPackSchema, sealedPackEnvelopeSchema } from './packSchema'
import type { CourtDayPack, SealedPackEnvelope } from './types'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function hexBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Invalid sealed-pack key material.')
  }
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16))
}

function base64Bytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = globalThis.atob(value)
  return new Uint8Array(Array.from(binary, (character) => character.charCodeAt(0)))
}

export async function deriveCourtDayKey(
  caseId: string,
  revision: string,
  ordinal: number,
  unlockFragment: string,
): Promise<CryptoKey> {
  const identity = encoder.encode(`${caseId}\0${revision}\0${ordinal}`)
  const left = hexBytes(BOOTSTRAP_KEY_FRAGMENT)
  const right = hexBytes(unlockFragment)
  const material = new Uint8Array(left.length + right.length + identity.length)
  material.set(left)
  material.set(right, left.length)
  material.set(identity, left.length + right.length)
  const digest = await crypto.subtle.digest('SHA-256', material)
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['decrypt'])
}

export async function decryptCourtDayPack(
  envelopeValue: unknown,
  expected: { caseId: 'cw-0001'; revision: string; ordinal: number },
  unlockFragment: string,
): Promise<CourtDayPack> {
  const envelope: SealedPackEnvelope = sealedPackEnvelopeSchema.parse(envelopeValue)
  if (
    envelope.caseId !== expected.caseId ||
    envelope.revision !== expected.revision ||
    envelope.ordinal !== expected.ordinal
  ) {
    throw new Error('The sealed session does not match this Court Week revision.')
  }
  const key = await deriveCourtDayKey(
    expected.caseId,
    expected.revision,
    expected.ordinal,
    unlockFragment,
  )
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64Bytes(envelope.iv) },
      key,
      base64Bytes(envelope.ciphertext),
    )
  } catch {
    throw new Error('The sealed session failed its integrity check.')
  }
  const pack = courtDayPackSchema.parse(JSON.parse(decoder.decode(plaintext)))
  if (
    pack.caseId !== expected.caseId ||
    pack.revision !== expected.revision ||
    pack.ordinal !== expected.ordinal ||
    pack.session.ordinal !== expected.ordinal
  ) {
    throw new Error('The opened session does not match its schedule entry.')
  }
  return pack
}
