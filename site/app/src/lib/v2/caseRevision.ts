import type { DocketCase, DocketCaseV4 } from './caseSchema'

export function stableContentHash(value: unknown): string {
  let hash = 0x811c9dc5
  const content = JSON.stringify(value)
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Stable storage identity that changes whenever the authored case changes. */
export function caseStorageId(trial: DocketCase | DocketCaseV4): string {
  return `${trial.id}@${stableContentHash(trial)}`
}
