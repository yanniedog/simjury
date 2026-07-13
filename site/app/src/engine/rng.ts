/**
 * Deterministic seeded PRNG for the deliberation engine. The room must be
 * replayable: the same case, verdict, and action sequence always produces the
 * identical event log (the v3 §9 I-8 determinism requirement), while different
 * player choices consume the stream differently and diverge naturally.
 */

/** FNV-1a 32-bit hash of a string, for turning seeds into integers. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export type Rng = () => number

/** mulberry32 — small, fast, and good enough for room theatre. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function rngFor(seedText: string): Rng {
  return mulberry32(hashSeed(seedText))
}

/** Pick one element deterministically. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length]
}
