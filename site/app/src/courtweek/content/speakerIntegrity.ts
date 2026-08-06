import type { CourtSession, SceneCue } from '../model/schema'
import { splitCueTurns } from './cueTurns'

/**
 * Content-curator sign-off for every cue in which more than one person speaks.
 * A changed label, actor order, or newly merged exchange must be reviewed here
 * before the Court Week source can load or produce media jobs.
 */
export const REVIEWED_MULTI_SPEAKER_TURNS: ReadonlyMap<string, readonly string[]> = new Map([
  ['mon-plea', ['Clerk', 'Mara Venn', 'Judge Sel Aven']],
  ['mon-orr-cross-1', ['Defence counsel Corin Dax', 'Nella Orr', 'Defence counsel Corin Dax', 'Nella Orr']],
  ['mon-orr-cross-2', ['Defence counsel Corin Dax', 'Nella Orr', 'Defence counsel Corin Dax', 'Nella Orr']],
  ['tue-def-objection', ['Crown counsel Asha Renn', 'Defence counsel Corin Dax', 'Crown counsel Asha Renn', 'Judge Sel Aven']],
  ['tue-recording-play', ['Ilan Saye', 'Peli Dorn', 'Mara Venn', 'Ilan Saye', 'Recorded channel', 'Mara Venn', 'Ilan Saye', 'Recorded channel']],
  ['tue-dorn-cross-1', ['Defence counsel Corin Dax', 'Peli Dorn', 'Defence counsel Corin Dax', 'Peli Dorn', 'Defence counsel Corin Dax', 'Peli Dorn', 'Defence counsel Corin Dax', 'Peli Dorn']],
  ['tue-dorn-re-1', ['Crown counsel Asha Renn', 'Peli Dorn', 'Crown counsel Asha Renn', 'Peli Dorn', 'Judge Sel Aven']],
  ['tue-mir-cross-1', ['Defence counsel Corin Dax', 'Tovan Mir', 'Defence counsel Corin Dax', 'Tovan Mir', 'Defence counsel Corin Dax', 'Tovan Mir', 'Defence counsel Corin Dax', 'Tovan Mir']],
  ['wed-pell-cross-1', ['Defence counsel Corin Dax', 'Jaro Pell', 'Defence counsel Corin Dax', 'Jaro Pell', 'Defence counsel Corin Dax', 'Jaro Pell', 'Defence counsel Corin Dax', 'Jaro Pell']],
  ['wed-pell-re-1', ['Crown counsel Asha Renn', 'Jaro Pell', 'Crown counsel Asha Renn', 'Jaro Pell']],
  ['wed-vos-cross-1', ['Defence counsel Corin Dax', 'Dr Eren Vos', 'Defence counsel Corin Dax', 'Dr Eren Vos', 'Defence counsel Corin Dax', 'Dr Eren Vos']],
  ['wed-vos-re-1', ['Crown counsel Asha Renn', 'Dr Eren Vos']],
  ['wed-def-objection', ['Crown counsel Asha Renn', 'Defence counsel Corin Dax', 'Crown counsel Asha Renn', 'Judge Sel Aven']],
  ['wed-vale-chief-1', ['Oren Vale', 'Crown counsel Asha Renn', 'Defence counsel Corin Dax', 'Judge Sel Aven']],
  ['wed-vale-cross-1', ['Defence counsel Corin Dax', 'Oren Vale', 'Defence counsel Corin Dax', 'Oren Vale', 'Defence counsel Corin Dax', 'Oren Vale']],
  ['wed-blurt', ['Defence counsel Corin Dax', 'Oren Vale', 'Defence counsel Corin Dax']],
  ['wed-record-admitted', ['Crown counsel Asha Renn', 'Defence counsel Corin Dax', 'Judge Sel Aven']],
  ['thu-rusk-cross-1', ['Crown counsel Asha Renn', 'Tali Rusk', 'Crown counsel Asha Renn', 'Tali Rusk', 'Crown counsel Asha Renn', 'Tali Rusk']],
  ['thu-crown-objection', ['Defence counsel Corin Dax', 'Crown counsel Asha Renn', 'Judge Sel Aven']],
  ['thu-rusk-re-1', ['Defence counsel Corin Dax', 'Tali Rusk']],
  ['thu-quill-cross-1', ['Crown counsel Asha Renn', 'Sera Quill', 'Crown counsel Asha Renn', 'Sera Quill', 'Crown counsel Asha Renn', 'Sera Quill', 'Crown counsel Asha Renn', 'Sera Quill']],
  ['thu-quill-re-1', ['Defence counsel Corin Dax', 'Sera Quill', 'Defence counsel Corin Dax', 'Sera Quill']],
  ['fri-adjourn', ['Narrator', 'Judge Sel Aven']],
  ['sat-concerns-1', ['Ari Tem', 'Sola Iven']],
  ['sat-concerns-2', ['Bram Tey', 'Kessa Noor']],
  ['sat-concerns-3', ['Daro Sen', 'Yara Merrow']],
  ['sat-improper-1', ['Bram Tey', 'Kessa Noor']],
  ['sat-improper-2', ['Sola Iven', 'Foreperson Edda Rook']],
  ['sun-verdict-return', ['Narrator', 'Clerk']],
])

const IDENTITY_LEAKS = /the accused answers|Sola Iven answers|Kessa Noor adds|Yara Merrow asks|Someone says|Another voice asks|Edda stops|The court officer recalls|the clerk asks/iu

function authoredCues(sessions: readonly CourtSession[]): SceneCue[] {
  return sessions.flatMap((session) => session.scenes.flatMap((scene) =>
    scene.cues.reduce<SceneCue[]>((groups, cue) => {
      const sourceCueId = cue.sourceCueId ?? cue.id
      const current = groups.at(-1)
      if (current && current.id === sourceCueId) current.text += ` ${cue.text}`
      else groups.push({ ...cue, id: sourceCueId, sourceCueId: undefined })
      return groups
    }, []),
  ))
}

export function assertReviewedSpeakerIntegrity(sessions: readonly CourtSession[]): void {
  const actual = new Map<string, string[]>()
  const cues = authoredCues(sessions)
  for (const cue of cues) {
    if (IDENTITY_LEAKS.test(cue.text)) {
      throw new Error(`${cue.id}: present-character speech is paraphrased through another voice`)
    }
    const speakers = splitCueTurns(cue).map((turn) => turn.speaker)
    if (speakers.length > 1) actual.set(cue.id, speakers)
  }

  const reviewed = [...REVIEWED_MULTI_SPEAKER_TURNS]
  if (JSON.stringify([...actual]) !== JSON.stringify(reviewed)) {
    const reviewedIds = new Set(REVIEWED_MULTI_SPEAKER_TURNS.keys())
    const added = [...actual.keys()].filter((id) => !reviewedIds.has(id))
    const removed = [...reviewedIds].filter((id) => !actual.has(id))
    const changed = [...actual].flatMap(([id, speakers]) => {
      const expected = REVIEWED_MULTI_SPEAKER_TURNS.get(id)
      return expected && JSON.stringify(speakers) !== JSON.stringify(expected) ? [id] : []
    })
    throw new Error(`Unreviewed speaker turns (added: ${added.join(', ') || 'none'}; removed: ${removed.join(', ') || 'none'}; changed: ${changed.join(', ') || 'none'})`)
  }
}
