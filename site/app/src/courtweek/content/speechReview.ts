export type ActorRole =
  | 'judge' | 'clerk' | 'court-officer' | 'counsel' | 'accused'
  | 'witness' | 'juror' | 'recorded-participant' | 'narrator' | 'recording' | 'document'

type ActorRecord = { id: string; label: string; role: ActorRole; aliases: readonly string[] }

export const COURT_WEEK_ACTORS = [
  { id: 'judge', label: 'Judge Sel Aven', role: 'judge', aliases: ['Judge', 'the Judge'] },
  { id: 'clerk', label: 'Clerk', role: 'clerk', aliases: ['the Clerk'] },
  { id: 'court-officer', label: 'Court officer', role: 'court-officer', aliases: ['the court officer'] },
  { id: 'crown-counsel', label: 'Crown counsel Asha Renn', role: 'counsel', aliases: ['Crown', 'Renn', 'the Crown'] },
  { id: 'defence-counsel', label: 'Defence counsel Corin Dax', role: 'counsel', aliases: ['Defence', 'Dax', 'the defence'] },
  { id: 'accused', label: 'Mara Venn', role: 'accused', aliases: ['Venn', 'the accused'] },
  { id: 'ilan-saye', label: 'Ilan Saye', role: 'recorded-participant', aliases: ['Saye'] },
  { id: 'nella-orr', label: 'Nella Orr', role: 'witness', aliases: ['Orr'] },
  { id: 'peli-dorn', label: 'Peli Dorn', role: 'witness', aliases: ['Dorn'] },
  { id: 'tovan-mir', label: 'Tovan Mir', role: 'witness', aliases: ['Mir'] },
  { id: 'jaro-pell', label: 'Jaro Pell', role: 'witness', aliases: ['Pell'] },
  { id: 'eren-vos', label: 'Dr Eren Vos', role: 'witness', aliases: ['Vos'] },
  { id: 'oren-vale', label: 'Oren Vale', role: 'witness', aliases: ['Vale'] },
  { id: 'tali-rusk', label: 'Tali Rusk', role: 'witness', aliases: ['Rusk'] },
  { id: 'sera-quill', label: 'Sera Quill', role: 'witness', aliases: ['Quill'] },
  { id: 'edda-rook', label: 'Edda Rook', role: 'juror', aliases: ['Edda', 'Foreperson Edda Rook'] },
  { id: 'niko-hale', label: 'Niko Hale', role: 'juror', aliases: ['Niko'] },
  { id: 'lina-fei', label: 'Lina Fei', role: 'juror', aliases: ['Lina'] },
  { id: 'ari-tem', label: 'Ari Tem', role: 'juror', aliases: ['Ari'] },
  { id: 'sola-iven', label: 'Sola Iven', role: 'juror', aliases: ['Sola'] },
  { id: 'bram-tey', label: 'Bram Tey', role: 'juror', aliases: ['Bram'] },
  { id: 'kessa-noor', label: 'Kessa Noor', role: 'juror', aliases: ['Kessa'] },
  { id: 'daro-sen', label: 'Daro Sen', role: 'juror', aliases: ['Daro'] },
  { id: 'yara-merrow', label: 'Yara Merrow', role: 'juror', aliases: ['Yara'] },
  { id: 'toma-reed', label: 'Toma Reed', role: 'juror', aliases: ['Toma'] },
  { id: 'omri-cade', label: 'Omri Cade', role: 'juror', aliases: ['Omri'] },
  { id: 'narrator', label: 'Narrator', role: 'narrator', aliases: [] },
  { id: 'recorded-channel', label: 'Recorded channel', role: 'recording', aliases: ['Channel'] },
  { id: 'neutral-case-note', label: 'Judge’s neutral case note', role: 'document', aliases: [] },
] as const satisfies readonly ActorRecord[]

export type ActorId = typeof COURT_WEEK_ACTORS[number]['id']
export type SpeechMode =
  | 'live-proceeding' | 'reported-testimony' | 'recording-playback' | 'advocacy'
  | 'judicial-direction' | 'written-document' | 'narrator-summary' | 'system-template'
export type LegalAction =
  | 'none' | 'charge-read' | 'plea-question' | 'plea-answer'
  | 'witness-question' | 'witness-answer' | 'objection' | 'submission'
  | 'foundation' | 'tender' | 'admission' | 'ruling' | 'direction'
  | 'limitation-direction' | 'exhibit-playback' | 'jury-note'
  | 'ballot-administration' | 'verdict-question' | 'verdict-return' | 'narration'

export interface SpokenTurn {
  id: string
  actorId: ActorId
  text: string
  speechMode: SpeechMode
  legalAction: LegalAction
}

export interface SpeechAttribution {
  marker: string
  actorId: ActorId
  kind: 'live' | 'reported' | 'recorded' | 'written' | 'narrated'
}

export interface ReviewedSpeechCue {
  id: string
  sourceText: string
  turns: readonly SpokenTurn[]
  attributions?: readonly SpeechAttribution[]
}

const actorsById = new Map<ActorId, typeof COURT_WEEK_ACTORS[number]>(
  COURT_WEEK_ACTORS.map((actor) => [actor.id, actor]),
)
const referenceToActor = new Map<string, ActorId>()
for (const actor of COURT_WEEK_ACTORS) {
  for (const reference of [actor.label, ...actor.aliases]) {
    const normalized = reference.toLocaleLowerCase('en-AU')
    const owner = referenceToActor.get(normalized)
    if (owner && owner !== actor.id) throw new Error(`Actor reference ${reference} is ambiguous`)
    referenceToActor.set(normalized, actor.id)
  }
}

const authority: Readonly<Partial<Record<LegalAction, readonly ActorRole[]>>> = {
  'charge-read': ['clerk'], 'plea-question': ['clerk'], 'plea-answer': ['accused'],
  'witness-question': ['counsel'], 'witness-answer': ['witness'], objection: ['counsel'],
  submission: ['counsel'], foundation: ['witness'], tender: ['counsel'], admission: ['judge'],
  ruling: ['judge'], direction: ['judge'], 'limitation-direction': ['judge'],
  'exhibit-playback': ['recording'], 'jury-note': ['juror'],
  'ballot-administration': ['juror', 'court-officer'], 'verdict-question': ['clerk'],
  'verdict-return': ['juror'], narration: ['narrator', 'document'],
}
const modeAuthority: Readonly<Partial<Record<SpeechMode, readonly ActorRole[]>>> = {
  advocacy: ['counsel'], 'judicial-direction': ['judge'],
  'reported-testimony': ['witness'], 'narrator-summary': ['narrator', 'document'],
  'system-template': ['narrator', 'document'],
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

const actorReferences = [...referenceToActor.keys()]
  .sort((left, right) => right.length - left.length).map(escapePattern).join('|')
const labelPattern = /(?:^|\s)([\p{Lu}][\p{L}’'-]*(?:\s+[\p{Lu}][\p{L}’'-]*){0,3}):/gu
const speechVerbPattern = new RegExp(
  `\\b(${actorReferences}|Someone|Another voice)\\s+` +
  '(answers?|adds?|asks?|replies?|objects?|rules?|says?|stops?|tells?|told me)\\b:?',
  'giu',
)

export interface PotentialAttribution { marker: string; actorId?: ActorId }

export function findPotentialAttributions(text: string): PotentialAttribution[] {
  const findings = new Map<string, PotentialAttribution>()
  for (const match of text.matchAll(labelPattern)) {
    const marker = `${match[1]}:`
    findings.set(marker.toLocaleLowerCase('en-AU'), {
      marker, actorId: referenceToActor.get(match[1].toLocaleLowerCase('en-AU')),
    })
  }
  for (const match of text.matchAll(speechVerbPattern)) {
    const marker = match[0].trim()
    findings.set(marker.toLocaleLowerCase('en-AU'), {
      marker, actorId: referenceToActor.get(match[1].toLocaleLowerCase('en-AU')),
    })
  }
  return [...findings.values()]
}

export function assertLegalActionAuthority(turn: SpokenTurn): void {
  const actor = actorsById.get(turn.actorId)
  if (!actor) throw new Error(`${turn.id}: unknown actor ${turn.actorId}`)
  const allowed = authority[turn.legalAction]
  if (allowed && !allowed.includes(actor.role)) {
    throw new Error(`${turn.id}: ${actor.label} cannot perform ${turn.legalAction}`)
  }
  const allowedModes = modeAuthority[turn.speechMode]
  if (allowedModes && !allowedModes.includes(actor.role)) {
    throw new Error(`${turn.id}: ${actor.label} cannot use ${turn.speechMode}`)
  }
}

export function assertReviewedSpeechCue(cue: ReviewedSpeechCue): void {
  if (cue.turns.length === 0) throw new Error(`${cue.id}: reviewed cue needs an explicit turn`)
  const ids = cue.turns.map(({ id }) => id)
  if (new Set(ids).size !== ids.length) throw new Error(`${cue.id}: turn ids must be unique`)
  for (const turn of cue.turns) {
    if (!turn.text.trim()) throw new Error(`${turn.id}: spoken text is empty`)
    assertLegalActionAuthority(turn)
  }

  const findings = findPotentialAttributions(cue.sourceText)
  const attributionEntries = cue.attributions ?? []
  const declarations = new Map(attributionEntries.map((entry) => [
    entry.marker.toLocaleLowerCase('en-AU'), entry,
  ]))
  if (declarations.size !== attributionEntries.length) {
    throw new Error(`${cue.id}: attribution markers must be unique`)
  }
  for (const finding of findings) {
    if (!finding.actorId) throw new Error(`${cue.id}: unknown attributed speaker in "${finding.marker}"`)
    const declared = declarations.get(finding.marker.toLocaleLowerCase('en-AU'))
    if (!declared) throw new Error(`${cue.id}: undeclared attributed speech "${finding.marker}"`)
    if (declared.actorId !== finding.actorId) {
      throw new Error(`${cue.id}: attributed speaker mismatch for "${finding.marker}"`)
    }
    if (declared.kind === 'live' && !cue.turns.some(({ actorId }) => actorId === declared.actorId)) {
      throw new Error(`${cue.id}: live attribution "${finding.marker}" has no matching turn`)
    }
  }
  for (const marker of declarations.keys()) {
    if (!findings.some((finding) => finding.marker.toLocaleLowerCase('en-AU') === marker)) {
      throw new Error(`${cue.id}: stale attribution declaration "${marker}"`)
    }
  }
}
