import type {
  CastMember,
  DocketBeat,
  DocketCase,
  Juror,
} from './caseSchema'

/**
 * Programmatic fixture builders for the v2 gate and engine tests. These build
 * the smallest case that passes every design check, so a test can break one
 * thing at a time. Player-facing content here is deliberately synthetic filler
 * — the authored spec-by-example case is `docket/dd-0000.json`.
 */

/** Deterministic filler prose with an exact word count. */
export function prose(words: number): string {
  const seed = ['the', 'witness', 'described', 'what', 'the', 'record', 'shows']
  const out: string[] = []
  for (let i = 0; i < words; i++) out.push(seed[i % seed.length])
  return out.join(' ')
}

export function makeCast(): CastMember[] {
  return [
    { id: 'judge', name: 'Judge Ellery', role_label: 'the judge', side: 'court' },
    { id: 'clerk', name: 'the clerk', role_label: 'clerk of the court', side: 'court' },
    { id: 'pros', name: 'Counsel Verany', role_label: 'prosecuting counsel', side: 'prosecution' },
    { id: 'defc', name: 'Counsel Maddox', role_label: 'defence counsel', side: 'defence' },
    { id: 'acc', name: 'Corin Vale', role_label: 'the accused', side: 'defence' },
    { id: 'w1', name: 'Renn Halloway', role_label: 'investigating officer', side: 'prosecution' },
    { id: 'w2', name: 'Dr Sefa Iqbal', role_label: 'defence forensic examiner', side: 'defence' },
    { id: 'w3', name: 'Osei Mwangi', role_label: 'eyewitness', side: 'prosecution' },
  ]
}

export function makeBeat(overrides: Partial<DocketBeat> = {}): DocketBeat {
  return {
    id: 'b0',
    kind: 'witness',
    speaker: 'w1',
    mode: 'examination',
    text: prose(60),
    surface_persuasion: 0.4,
    true_weight: 0.3,
    direction: 'guilt',
    reveal_stamp: 'minor',
    reveal_note: 'context only',
    tags: ['identity'],
    ...overrides,
  }
}

/**
 * Ten beats: a loud early trap (guilt), a quiet decisive signal (innocence),
 * both sides argued, a burden-tagged direction from the bench => solvable
 * Not Guilty.
 */
export function makeBeats(): DocketBeat[] {
  const dialogue = (speaker: string, counsel: string) => {
    const first = prose(30)
    const second = prose(30)
    return {
      text: `${first} ${second}`,
      turns: [
        { speaker: counsel, text: first },
        { speaker, text: second },
      ],
    }
  }

  return [
    makeBeat({ id: 'b1', reveal_stamp: 'misleading', surface_persuasion: 0.85, true_weight: 0.2 }),
    makeBeat({ id: 'b2', mode: 'cross', direction: 'innocence', tags: ['credibility'], ...dialogue('w1', 'defc') }),
    makeBeat({ id: 'b3', tags: ['motive'] }),
    makeBeat({ id: 'b4', kind: 'exhibit', speaker: 'clerk', mode: undefined, direction: 'innocence', reveal_stamp: 'decisive', surface_persuasion: 0.5, true_weight: 0.85, tags: ['digital_forensics'] }),
    makeBeat({ id: 'b5', speaker: 'w2', direction: 'innocence', tags: ['digital_forensics', 'method'] }),
    makeBeat({ id: 'b6', speaker: 'w2', mode: 'cross', tags: ['credibility'], ...dialogue('w2', 'pros') }),
    makeBeat({ id: 'b7', kind: 'exhibit', speaker: 'clerk', mode: undefined, direction: 'innocence', reveal_stamp: 'decisive', surface_persuasion: 0.4, true_weight: 0.7, tags: ['identity', 'digital_forensics'] }),
    makeBeat({ id: 'b7b', kind: 'exhibit', speaker: 'clerk', mode: undefined, direction: 'innocence', reveal_stamp: 'decisive', surface_persuasion: 0.3, true_weight: 0.9, tags: ['digital_forensics'] }),
    makeBeat({ id: 'b8', speaker: 'w3', tags: ['procedure'] }),
    makeBeat({ id: 'b9', speaker: 'w2', direction: 'innocence', tags: ['credibility'] }),
    makeBeat({ id: 'b10', kind: 'direction', speaker: 'judge', mode: undefined, direction: 'innocence', tags: ['burden'] }),
  ]
}

const JUROR_SHAPE: ReadonlyArray<{
  arc: Juror['arc']
  position: Juror['initial']['position']
  extra?: Partial<Record<'holdout' | 'burden_drift' | 'burden_correct', string[]>>
  /**
   * A juror whose authored burden_drift/burden_correct text should actually
   * be reachable through a reaction rule (not just sitting unused in `lines`).
   */
  extraRule?: 'burden_drift' | 'burden_correct'
}> = [
  { arc: 'vibes', position: 'G' },
  { arc: 'steady', position: 'G' },
  { arc: 'principled_holdout', position: 'NG', extra: { holdout: ['I stay where the doubt is.'] } },
  {
    arc: 'steady',
    position: 'G',
    extra: { burden_correct: ['It is not for the defence to prove anything.'] },
    extraRule: 'burden_correct',
  },
  { arc: 'foreperson', position: 'G' },
  { arc: 'drifter', position: 'G' },
  { arc: 'mind_changer', position: 'G' },
  { arc: 'steady', position: 'NG' },
  {
    arc: 'burden_drifter',
    position: 'G',
    extra: { burden_drift: ['If it was not them, let them show us where they were.'] },
    extraRule: 'burden_drift',
  },
  { arc: 'drifter', position: 'U' },
  { arc: 'steady', position: 'NG' },
]

export function makeJuror(n: number, overrides: Partial<Juror> = {}): Juror {
  const shape = JUROR_SHAPE[n - 1]
  return {
    id: `J-${String(n).padStart(2, '0')}`,
    seat: n + 1,
    label: `Juror ${n + 1}`,
    persona: 'a test juror',
    register: 'plain',
    arc: shape.arc,
    initial: { position: shape.position, confidence: 60 },
    weights: { identity: 1, digital_forensics: 1 },
    lines: {
      agree: ['That settles it for me.', 'That is how I read it too.'],
      pushback: ['I do not accept that.', 'That is not what it shows.'],
      concede: ['I will grant that much.'],
      final: ['My mind is made up.'],
      ...shape.extra,
    },
    reaction_rules: [
      {
        when: { theme: 'digital_forensics', stance: 'proves' },
        effect: { delta: 1, confidence: 10, line: 'agree' },
      },
      // Wires the burden_drift/burden_correct text above (when present) into
      // an actually-reachable rule: theme 'burden' is always present (a case
      // must carry a burden-tagged direction beat), and stance 'any' means
      // any argument on that beat fires it.
      ...(shape.extraRule
        ? [
            {
              when: { theme: 'burden' as const, stance: 'any' as const },
              effect: {
                delta: shape.extraRule === 'burden_drift' ? -1 : 1,
                confidence: shape.extraRule === 'burden_drift' ? -10 : 10,
                line: shape.extraRule,
              },
            },
          ]
        : []),
      {
        when: { theme: 'any', stance: 'any' },
        effect: { delta: 0, confidence: 0, line: 'pushback' },
      },
    ],
    ...overrides,
  }
}

export function makeJurors(): Juror[] {
  return Array.from({ length: 11 }, (_, i) => makeJuror(i + 1))
}

export function makeDocketCase(overrides: Partial<DocketCase> = {}): DocketCase {
  return {
    id: 'dd-0001',
    publish_date: '2026-08-01',
    label: 'fiction',
    title: 'A well-designed docket case',
    setting: 'a mid-size logistics firm, the present day',
    charge: 'obtaining funds by deception',
    elements: ['funds were obtained', 'the accused acted dishonestly'],
    hook: prose(20),
    accused: {
      cast_id: 'acc',
      human: prose(20),
      if_guilty: prose(10),
    },
    statements: {
      opening: {
        prosecution: { speaker: 'pros', text: prose(60) },
        defence: { speaker: 'defc', text: prose(60) },
      },
      closing: {
        prosecution: { speaker: 'pros', text: prose(60) },
        defence: { speaker: 'defc', text: prose(60) },
      },
    },
    epilogue: prose(60),
    cast: makeCast(),
    beats: makeBeats(),
    checkins: ['b3', 'b6', 'b10'],
    verdict_truth: 'Not Guilty',
    twist: 'the loud evidence was hollow; the quiet exhibit was the answer',
    difficulty_target: 0.5,
    jury: { jurors: makeJurors() },
    gen_meta: { model: 'm', prompt_version: 'p', reviewer: 'r', batch_pr: 'b' },
    ...overrides,
  }
}
