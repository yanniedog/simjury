import type { DocketCase } from './caseSchema'

/** Stable storage identity that changes whenever the authored case changes. */
export function caseStorageId(trial: DocketCase): string {
  let hash = 0x811c9dc5
  const content = JSON.stringify(trial)
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${trial.id}@${(hash >>> 0).toString(16).padStart(8, '0')}`
}
