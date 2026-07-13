import { checkCase, checkQueue, type QualityIssue } from '../caseQuality'
import {
  LINE_FUNCTIONS,
  type DocketCase,
  type Juror,
  type Theme,
} from './caseSchema'

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

/** Narration pacing floors: per-beat spoken words. */
export const BEAT_WORDS_MIN = 25
export const BEAT_WORDS_MAX = 90
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

export function wordCount(text: string): number {
  const words = text.trim().split(/\s+/)
  return words[0] === '' ? 0 : words.length
}

function jurorIssues(j: Juror, beatThemes: Set<Theme>): string[] {
  const issues: string[] = []

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
    r.when.theme === 'any' && r.when.stance === 'any'
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

  // Courtroom structure.
  const cast = new Map(c.cast.map((m) => [m.id, m]))
  const beatIds = new Set(c.beats.map((b) => b.id))
  for (const b of c.beats) {
    const speaker = cast.get(b.speaker)
    if (!speaker) {
      issues.push(`beat ${b.id} speaker '${b.speaker}' is not in the cast`)
      continue
    }
    if (b.kind === 'direction' && speaker.side !== 'court') {
      issues.push(`direction beat ${b.id} must be spoken by the court`)
    }
    if (b.kind === 'witness' && !b.mode) {
      issues.push(`witness beat ${b.id} must declare examination or cross`)
    }
  }
  if (!c.beats.some((b) => b.kind === 'direction')) {
    issues.push('needs at least one direction beat (the judge must speak)')
  }

  const beatThemes = new Set(c.beats.flatMap((b) => b.tags))
  if (beatThemes.size < 3) {
    issues.push('beats must span at least three distinct themes')
  }
  if (!beatThemes.has('burden')) {
    issues.push("at least one beat must carry the 'burden' theme (the engine's burden-correct cite target)")
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

  const hasLine = (fn: (typeof LINE_FUNCTIONS)[number]) =>
    jurors.some((j) => (j.lines[fn]?.length ?? 0) > 0)
  if (!hasLine('burden_drift') || !hasLine('burden_correct')) {
    issues.push('the jury needs both a burden_drift and a burden_correct voice')
  }

  for (const j of jurors) issues.push(...jurorIssues(j, beatThemes))

  return issues
}

/** Design + integrity issues across the whole docket queue. */
export function checkDocketQueue(cases: DocketCase[]): QualityIssue[] {
  // v1 queue rules (per-case design is re-run by checkDocketCase below, so
  // strip checkCase duplicates by running uniqueness/variety on empty-beat
  // shells would be worse — instead run the full v1 queue check and add the
  // v2 per-case issues that checkCase does not know about).
  const issues: QualityIssue[] = checkQueue(cases).filter(
    (i) => i.caseId === '(queue)' || i.message.startsWith('duplicate'),
  )

  for (const c of cases) {
    for (const message of checkDocketCase(c)) {
      issues.push({ caseId: c.id, message })
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
      })
    }
  }

  return issues
}
