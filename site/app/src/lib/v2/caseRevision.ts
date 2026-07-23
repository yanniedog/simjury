import type { DocketCase } from './caseSchema'

/** Stable storage identity that changes whenever the authored case changes. */
export function caseStorageId(trial: DocketCase): string {
  let hash = 0x811c9dc5
  for (const char of JSON.stringify(trial)) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${trial.id}@${(hash >>> 0).toString(16).padStart(8, '0')}`
}
