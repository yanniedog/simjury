import { checkCase, checkQueue, type QualityIssue } from '../caseQuality'
import { scanDocketCaseTokens } from './bannedTokens'
import {
  LINE_FUNCTIONS,
  type DocketCase,
  type Juror,
  type Theme,
} from './caseSchema'

type Direction = 'guilt' | 'innocence'

function opposite(direction: Direction): Direction {
  return direction === 'guilt' ? 'innocence' : 'guilt'
}

/**
 * Design-quality gate v2 — the docket case. Everything the v1 gate enforces
 * (trap, real signal, both sides, solvable, honest stamps, queue uniqueness
 * and verdict variety) plus what the 8–10 minute loop and the deliberation
 * engine add:
 *
 *  - pacing: beat word counts sized for ~25s of narration each, and a total
 *    evidence budget that fits the 4.5–5.5 minute reading phase;
 *  - courtroom structure: speakers resolve to the cast, directions come from
 *    the bench, witness beats declare examination/cross, check-ins land in
 *    beat order;
 *  - a playable jury: contested initial split, the arcs that make a room move
 *    (vibes / holdout / mind-changer), reachable reaction rules ending in a
 *    default, every rule voiced by an authored line, and the burden-drift /
 *    burden-correct pair so the room can err and recover.
 */

/** Narration pacing floors: per-beat spoken words (DAILY-PIVOT.md's 40-70/beat). */
export const BEAT_WORDS_MIN = 40
export const BEAT_WORDS_MAX = 70
/** Total evidence budget (all beat words) for the 4.5–5.5 min reading phase. */
export const CASE_WORDS_MIN = 550
export const CASE_WORDS_MAX = 1050
/** A contested room: initial Guilty seats among the 11 jurors. */
export const JURY_G_MIN = 3
export const JURY_G_MAX = 8
/** Authored-voice floor per juror. */
export const JUROR_LINES_MIN = 6
/** The queue must never run more than this many identical verdicts in a row. */
export const VERDICT_RUN_MAX = 3
/** DAILY-PIVOT.md's 8-10 minute structure calls for 3-4 witnesses. */
export const WITNESS_COUNT_MIN = 3
export const WITNESS_COUNT_MAX = 4
/** The cold open: long enough to be a scene, short enough to stay a hook. */
export const HOOK_WORDS_MIN = 15
export const HOOK_WORDS_MAX = 60
/** Counsel statements: a story told in one breath, not a speech. */
export const STATEMENT_WORDS_MIN = 40
export const STATEMENT_WORDS_MAX = 90
/** The aftermath shown at the reveal. */
export const EPILOGUE_WORDS_MIN = 50
export const EPILOGUE_WORDS_MAX = 130
/**
 * Everything narrated before the jury room (hook + openings + evidence +
 * closings) must still fit the 8-10 minute loop; this caps the total.
 */
export const NARRATED_WORDS_MAX = 1250

export function wordCount(text: string): number {
  const words = text.trim().split(/\s+/)
  return words[0] === '' ? 0 : words.length
}

function jurorIssues(
  j: Juror,
  themeDirections: Map<Theme, Set<Direction>>,
): string[] {
  const issues: string[] = []
  const beatThemes = new Set(themeDirections.keys())

  const lineFunctions = new Set(
    Object.entries(j.lines)
      .filter(([, texts]) => texts && texts.length > 0)
      .map(([fn]) => fn),
  )
  const totalLines = Object.values(j.lines).reduce(
    (n, texts) => n + (texts?.length ?? 0),
    0,
  )
  if (totalLines < JUROR_LINES_MIN) {
    issues.push(`${j.id} needs >= ${JUROR_LINES_MIN} authored lines (has ${totalLines})`)
  }
  for (const required of ['pushback', 'concede', 'final'] as const) {
    if (!lineFunctions.has(required)) {
      issues.push(`${j.id} needs at least one '${required}' line`)
    }
  }

  const rules = j.reaction_rules
  const isDefault = (r: Juror['reaction_rules'][number]) =>
    r.when.theme === 'any' && r.when.stance === 'any' && !r.when.direction
  const defaults = rules.filter(isDefault)
  if (defaults.length !== 1 || !isDefault(rules[rules.length - 1])) {
    issues.push(
      `${j.id} must have exactly one default reaction rule (theme 'any', stance 'any'), ordered last`,
    )
  }
  for (const [i, r] of rules.entries()) {
    if (!lineFunctions.has(r.effect.line)) {
      issues.push(
        `${j.id} rule ${i} voices '${r.effect.line}' but the juror has no such line`,
      )
    }
    if (r.when.theme !== 'any' && !beatThemes.has(r.when.theme)) {
      issues.push(
        `${j.id} rule ${i} matches theme '${r.when.theme}' which no beat carries (unreachable)`,
      )
    } else if (r.when.direction && r.when.stance !== 'any') {
      // 'proves' pushes a beat's own direction; 'unreliable' pushes the
      // opposite (see caseSchema.ts). With stance pinned, the rule can only
      // fire if some beat on this theme actually produces that push — with
      // stance 'any' the player can always pick whichever stance is needed,
      // so only a pinned stance can make a direction unreachable.
      const dirs =
        r.when.theme === 'any'
          ? new Set([...themeDirections.values()].flatMap((s) => [...s]))
          : themeDirections.get(r.when.theme)
      const reachable = [...(dirs ?? [])].some((beatDirection) =>
        r.when.stance === 'proves'
          ? beatDirection === r.when.direction
          : opposite(beatDirection) === r.when.direction,
      )
      if (!reachable) {
        issues.push(
          `${j.id} rule ${i} needs a '${r.when.stance}' argument pushing '${r.when.direction}' on theme ` +
            `'${r.when.theme}', but no beat can produce that push (unreachable)`,
        )
      }
    }
  }

  const weightThemes = Object.keys(j.weights) as Theme[]
  if (!weightThemes.some((t) => beatThemes.has(t))) {
    issues.push(`${j.id} has no weight on any theme the case's beats carry`)
  }

  return issues
}

/** Design issues for a single docket case (empty array = good). */
export function checkDocketCase(c: DocketCase): string[] {
  // The v1 puzzle-design core applies unchanged to v2 beats.
  const issues: string[] = [...checkCase(c)]

  // Pacing.
  let totalWords = 0
  for (const b of c.beats) {
    const words = wordCount(b.text)
    totalWords += words
    if (words < BEAT_WORDS_MIN || words > BEAT_WORDS_MAX) {
      issues.push(
        `beat ${b.id} has ${words} words; narration pacing needs ${BEAT_WORDS_MIN}-${BEAT_WORDS_MAX}`,
      )
    }
  }
  if (totalWords < CASE_WORDS_MIN || totalWords > CASE_WORDS_MAX) {
    issues.push(
      `evidence totals ${totalWords} words; the reading phase needs ${CASE_WORDS_MIN}-${CASE_WORDS_MAX}`,
    )
  }

  // The engagement layer: the hook, the advocates' duel, the human on trial,
  // and the aftermath. These are what make a player care about the people in
  // the case, so they are budgeted and cast-checked like everything else.
  const hookWords = wordCount(c.hook)
  if (hookWords < HOOK_WORDS_MIN || hookWords > HOOK_WORDS_MAX) {
    issues.push(
      `hook has ${hookWords} words; the cold open needs ${HOOK_WORDS_MIN}-${HOOK_WORDS_MAX}`,
    )
  }
  const statements = [
    ['opening.prosecution', c.statements.opening.prosecution, 'prosecution'],
    ['opening.defence', c.statements.opening.defence, 'defence'],
    ['closing.prosecution', c.statements.closing.prosecution, 'prosecution'],
    ['closing.defence', c.statements.closing.defence, 'defence'],
  ] as const
  let statementWords = 0
  const castById = new Map(c.cast.map((m) => [m.id, m]))
  for (const [label, statement, side] of statements) {
    const words = wordCount(statement.text)
    statementWords += words
    if (words < STATEMENT_WORDS_MIN || words > STATEMENT_WORDS_MAX) {
      issues.push(
        `statement ${label} has ${words} words; needs ${STATEMENT_WORDS_MIN}-${STATEMENT_WORDS_MAX}`,
      )
    }
    const speaker = castById.get(statement.speaker)
    if (!speaker) {
      issues.push(`statement ${label} speaker '${statement.speaker}' is not in the cast`)
    } else if (speaker.side !== side) {
      issues.push(
        `statement ${label} must be spoken by ${side} counsel (got '${statement.speaker}', side '${speaker.side}')`,
      )
    }
  }
  const narratedWords = totalWords + hookWords + statementWords
  if (narratedWords > NARRATED_WORDS_MAX) {
    issues.push(
      `hook + statements + evidence total ${narratedWords} narrated words; the 8-10 minute loop caps at ${NARRATED_WORDS_MAX}`,
    )
  }
  const epilogueWords = wordCount(c.epilogue)
  if (epilogueWords < EPILOGUE_WORDS_MIN || epilogueWords > EPILOGUE_WORDS_MAX) {
    issues.push(
      `epilogue has ${epilogueWords} words; the aftermath needs ${EPILOGUE_WORDS_MIN}-${EPILOGUE_WORDS_MAX}`,
    )
  }
  const accused = castById.get(c.accused.cast_id)
  if (!accused) {
    issues.push(`accused cast_id '${c.accused.cast_id}' is not in the cast`)
  } else if (accused.side !== 'defence') {
    issues.push(`accused '${c.accused.cast_id}' must be a defence-side cast member`)
  }

  // Courtroom structure. A duplicate cast/beat id would otherwise silently
  // shadow an earlier entry in these maps (the schema also rejects this — see
  // caseSchema.ts's superRefine — but the gate checks it independently since
  // it can be called on data that never went through schema.parse).
  const castIds = c.cast.map((m) => m.id)
  if (new Set(castIds).size !== castIds.length) {
    issues.push('cast ids must be unique')
  }
  const rawBeatIds = c.beats.map((b) => b.id)
  if (new Set(rawBeatIds).size !== rawBeatIds.length) {
    issues.push('beat ids must be unique')
  }

  const cast = castById
  const beatIds = new Set(rawBeatIds)
  const witnessSpeakers = new Set<string>()
  for (const b of c.beats) {
    const speaker = cast.get(b.speaker)
    if (!speaker) {
      issues.push(`beat ${b.id} speaker '${b.speaker}' is not in the cast`)
      continue
    }
    if (b.kind === 'direction' && speaker.side !== 'court') {
      issues.push(`direction beat ${b.id} must be spoken by the court`)
    }
    if (b.kind === 'witness') {
      if (!b.mode) {
        issues.push(`witness beat ${b.id} must declare examination or cross`)
      }
      witnessSpeakers.add(b.speaker)
    }
    if (b.turns) {
      const speakers = new Set(b.turns.map((turn) => turn.speaker))
      if (speakers.size < 2) issues.push(`beat ${b.id} dialogue needs at least two speakers`)
      b.turns.forEach((turn, i) => {
        if (!cast.has(turn.speaker)) issues.push(`beat ${b.id} turn speaker '${turn.speaker}' is not in the cast`)
        if (i > 0 && turn.speaker === b.turns?.[i - 1].speaker) {
          issues.push(`beat ${b.id} dialogue must alternate speakers`)
        }
        if (!b.text.includes(turn.text)) issues.push(`beat ${b.id} dialogue text must come from the beat transcript`)
      })
      if (b.mode === 'cross') {
        const witnessSide = cast.get(b.speaker)?.side
        const opposingSide = witnessSide === 'prosecution' ? 'defence' : 'prosecution'
        const otherSpeakers = [...speakers].filter((id) => id !== b.speaker)
        const opposingCounsel = otherSpeakers.length === 1 && cast.get(otherSpeakers[0])
        if (!opposingCounsel || opposingCounsel.side !== opposingSide || !/counsel/i.test(opposingCounsel.role_label)) {
          issues.push(`beat ${b.id} cross dialogue must alternate the witness with opposing counsel`)
        }
      }
    }
  }
  if (!c.beats.some((b) => b.kind === 'direction')) {
    issues.push('needs at least one direction beat (the judge must speak)')
  }
  if (
    witnessSpeakers.size < WITNESS_COUNT_MIN ||
    witnessSpeakers.size > WITNESS_COUNT_MAX
  ) {
    issues.push(
      `case must have ${WITNESS_COUNT_MIN}-${WITNESS_COUNT_MAX} witnesses (has ${witnessSpeakers.size})`,
    )
  }

  const themeDirections = new Map<Theme, Set<Direction>>()
  for (const b of c.beats) {
    for (const tag of b.tags) {
      const dirs = themeDirections.get(tag) ?? new Set<Direction>()
      dirs.add(b.direction)
      themeDirections.set(tag, dirs)
    }
  }
  const beatThemes = new Set(themeDirections.keys())
  if (beatThemes.size < 3) {
    issues.push('beats must span at least three distinct themes')
  }
  const burdenDirectionBeat = c.beats.some(
    (b) => b.tags.includes('burden') && b.kind === 'direction',
  )
  if (!burdenDirectionBeat) {
    issues.push(
      "a 'burden'-tagged beat must be a direction beat (the judge's instruction the burden-correct line cites)",
    )
  }

  // Check-ins resolve, are unique, and appear in beat order.
  const order = new Map(c.beats.map((b, i) => [b.id, i]))
  let prev = -1
  const seen = new Set<string>()
  for (const id of c.checkins) {
    if (!beatIds.has(id)) {
      issues.push(`check-in '${id}' does not match any beat`)
      continue
    }
    if (seen.has(id)) issues.push(`check-in '${id}' repeats`)
    seen.add(id)
    const at = order.get(id) ?? -1
    if (at <= prev) issues.push(`check-in '${id}' is out of beat order`)
    prev = at
  }

  // Every trap must be scoreable: analyzeDocketPlay can only mark a
  // misleading beat as bait if a check-in closes its segment, so a trap
  // after the final check-in would silently drop out of the reveal's
  // trap counts. (A trap ON the final check-in beat is fine — the
  // check-in closes its own segment.)
  const lastCheckinAt =
    c.checkins.length > 0
      ? Math.max(...c.checkins.map((id) => order.get(id) ?? -1))
      : -1
  for (const [i, b] of c.beats.entries()) {
    if (b.reveal_stamp === 'misleading' && i > lastCheckinAt) {
      issues.push(
        `misleading beat ${b.id} falls after the final check-in — it can never be scored as bait`,
      )
    }
  }

  // The jury.
  const jurors = c.jury.jurors
  const ids = new Set(jurors.map((j) => j.id))
  const seats = new Set(jurors.map((j) => j.seat))
  if (ids.size !== jurors.length) issues.push('juror ids must be unique')
  if (seats.size !== jurors.length || [...seats].some((s) => s < 2 || s > 12)) {
    issues.push('jurors must fill seats 2-12 exactly once')
  }

  const g = jurors.filter((j) => j.initial.position === 'G').length
  const ng = jurors.filter((j) => j.initial.position === 'NG').length
  if (g < JURY_G_MIN || g > JURY_G_MAX || ng === 0) {
    issues.push(
      `initial split must be contested: ${JURY_G_MIN}-${JURY_G_MAX} G with at least one NG (has ${g} G / ${ng} NG)`,
    )
  }

  const arcs = new Set(jurors.map((j) => j.arc))
  for (const required of ['vibes', 'principled_holdout', 'mind_changer'] as const) {
    if (!arcs.has(required)) {
      issues.push(`the jury needs a '${required}' arc for the room to move`)
    }
  }

  // A line function only matters if some juror's *reaction rules* actually
  // voice it — authored text nobody's rule ever selects can never be heard
  // (the per-rule "no such line" check below catches the opposite mistake:
  // a rule voicing a line the juror never wrote).
  const hasReachableLine = (fn: (typeof LINE_FUNCTIONS)[number]) =>
    jurors.some((j) => j.reaction_rules.some((r) => r.effect.line === fn))
  if (!hasReachableLine('burden_drift') || !hasReachableLine('burden_correct')) {
    issues.push(
      'the jury needs a reaction rule that voices both burden_drift and burden_correct',
    )
  }

  for (const j of jurors) issues.push(...jurorIssues(j, themeDirections))

  issues.push(...scanDocketCaseTokens(c))

  return issues
}

/** Design + integrity issues across the whole docket queue. */
export function checkDocketQueue(cases: DocketCase[]): QualityIssue[] {
  // v1 queue-level rules only (duplicate id/date/title, verdict variety) —
  // per-case design issues are re-run by checkDocketCase below, so we select
  // by QualityIssue.kind rather than matching on message text, which would
  // silently break if v1's wording ever changed.
  const issues: QualityIssue[] = checkQueue(cases).filter(
    (i) => i.kind !== 'design',
  )

  for (const c of cases) {
    for (const message of checkDocketCase(c)) {
      issues.push({ caseId: c.id, message, kind: 'design' })
    }
  }

  // Anti-meta: never more than VERDICT_RUN_MAX identical verdicts in a row.
  const byDate = [...cases].sort((a, b) =>
    a.publish_date.localeCompare(b.publish_date),
  )
  let run = 0
  let last: DocketCase['verdict_truth'] | null = null
  for (const c of byDate) {
    run = c.verdict_truth === last ? run + 1 : 1
    last = c.verdict_truth
    if (run === VERDICT_RUN_MAX + 1) {
      issues.push({
        caseId: c.id,
        message: `more than ${VERDICT_RUN_MAX} '${c.verdict_truth}' verdicts in a row — vary the queue`,
        kind: 'variety',
      })
    }
  }

  return issues
}
