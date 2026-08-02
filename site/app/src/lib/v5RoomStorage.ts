import { restoreV5Session, type V5RoomSession } from '../engine/v5RoomSession'

const PREFIX = 'simjury-v5-room:v1:'

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadV5Room(day: number, caseRevision: string): V5RoomSession | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(PREFIX + day)
    return raw ? restoreV5Session(JSON.parse(raw), caseRevision) : null
  } catch {
    return null
  }
}

export function saveV5Room(day: number, session: V5RoomSession): void {
  try {
    storage()?.setItem(PREFIX + day, JSON.stringify(session))
  } catch {
    // A blocked store must not prevent the current in-memory sitting.
  }
}

export function clearV5Room(day: number): void {
  try {
    storage()?.removeItem(PREFIX + day)
  } catch {
    // A blocked store has nothing useful to clear.
  }
}
