import type { Juror, Theme } from '../lib/v2/caseSchema'

/**
 * Juror personality, derived — never re-authored.
 *
 * Every case in the docket already carries the raw material for a distinct
 * person: a behavioural `arc`, a speech `register`, a per-theme `weights` map
 * recording what that juror cares about, and an `initial` position with a
 * confidence. Until now only `arc` and `weights` reached the room, so eleven
 * richly authored jurors behaved like one juror with eleven names.
 *
 * This module turns that authored data into a stable trait profile the
 * persuasion model and the player-facing dossier both read. It is a pure,
 * deterministic projection of the case file:
 *
 *   - no schema change, so the whole shipped docket gains personality at once;
 *   - no RNG, so a juror is the same person on every replay of a sitting;
 *   - no new player-facing prose, so the fiction and no-real-names invariants
 *     are untouched — the authored `persona` line remains the only free text.
 *
 * Traits are 0..1 and rounded to two places so they read cleanly in a dossier
 * and compare stably in tests.
 */

export interface JurorTraits {
  /** How readily this juror moves with a good argument or the room's drift. */
  agreeableness: number
  /** How hard they interrogate where a claim comes from before accepting it. */
  skepticism: number
  /** How much weight they give the bench's directions over the room's mood. */
  deference: number
  /** How badly they want the room finished — impatience with re-litigation. */
  closure: number
  /** How sharply they push back when pressed personally rather than argued to. */
  reactance: number
  /** How firmly they already hold their opening view (authored confidence). */
  conviction: number
}

export type PersuasionStyle =
  | 'wants_a_source'
  | 'follows_the_bench'
  | 'moves_with_the_room'
  | 'holds_the_line'
  | 'wants_it_finished'

export interface JurorProfile {
  id: string
  seat: number
  label: string
  /** The authored persona sentence — the only free text in a profile. */
  persona: string
  register: Juror['register']
  arc: Juror['arc']
  traits: JurorTraits
  /** Themes this juror weighs most heavily (authored weight ≥ 2). */
  caresAbout: Theme[]
  /** Themes they give some weight (authored weight 1). */
  notices: Theme[]
  /** Themes they actively discount (authored weight ≤ −1). */
  wary: Theme[]
  /** The single theme that most moves them, if any. */
  focus: Theme | null
  /** One-word handle for how to reach this juror, for the dossier headline. */
  style: PersuasionStyle
}

/**
 * Arc baselines. These encode the authored intent of each arc in the schema:
 * a `principled_holdout` is not merely stubborn, they are stubborn *because*
 * they want the claim sourced, and a `drifter` is agreeable *because* they are
 * not interrogating anything.
 */
const ARC_BASELINE: Record<Juror['arc'], JurorTraits> = {
  vibes: { agreeableness: 0.75, skepticism: 0.2, deference: 0.45, closure: 0.6, reactance: 0.25, conviction: 0 },
  steady: { agreeableness: 0.45, skepticism: 0.6, deference: 0.6, closure: 0.4, reactance: 0.35, conviction: 0 },
  principled_holdout: { agreeableness: 0.12, skepticism: 0.85, deference: 0.5, closure: 0.15, reactance: 0.8, conviction: 0 },
  mind_changer: { agreeableness: 0.7, skepticism: 0.55, deference: 0.55, closure: 0.45, reactance: 0.2, conviction: 0 },
  drifter: { agreeableness: 0.85, skepticism: 0.15, deference: 0.35, closure: 0.75, reactance: 0.15, conviction: 0 },
  burden_drifter: { agreeableness: 0.5, skepticism: 0.35, deference: 0.75, closure: 0.55, reactance: 0.4, conviction: 0 },
  foreperson: { agreeableness: 0.4, skepticism: 0.65, deference: 0.8, closure: 0.6, reactance: 0.3, conviction: 0 },
}

/** How a juror speaks is also how they take being argued with. */
const REGISTER_SHIFT: Record<Juror['register'], Partial<JurorTraits>> = {
  plain: {},
  formal: { skepticism: 0.1, deference: 0.1, reactance: -0.05 },
  blunt: { agreeableness: -0.1, closure: 0.1, reactance: 0.15 },
  hesitant: { agreeableness: 0.15, closure: -0.1, reactance: -0.15 },
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const round2 = (value: number) => Math.round(value * 100) / 100

function themesByWeight(
  juror: Juror,
  keep: (weight: number) => boolean,
): Theme[] {
  return (Object.entries(juror.weights) as [Theme, number][])
    .filter(([, weight]) => keep(weight))
    // Sort by strength, then id, so a dossier lists the same themes in the
    // same order on every render.
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]))
    .map(([theme]) => theme)
}

function styleFor(traits: JurorTraits): PersuasionStyle {
  // Ordered by how much each trait dominates its own baseline range, so the
  // headline names the lever that actually works on this juror.
  const ranked: [PersuasionStyle, number][] = [
    ['holds_the_line', traits.reactance * 0.6 + (1 - traits.agreeableness) * 0.4],
    ['wants_a_source', traits.skepticism],
    ['follows_the_bench', traits.deference],
    ['wants_it_finished', traits.closure],
    ['moves_with_the_room', traits.agreeableness],
  ]
  ranked.sort((a, b) => b[1] - a[1])
  return ranked[0][0]
}

export function jurorProfile(juror: Juror): JurorProfile {
  const base = ARC_BASELINE[juror.arc]
  const shift = REGISTER_SHIFT[juror.register]
  const conviction = clamp01(juror.initial.confidence / 100)
  const undecided = juror.initial.position === 'U'

  const traits: JurorTraits = {
    // A juror who already holds a firm view is harder to move and quicker to
    // bristle; an undecided juror is still genuinely listening.
    agreeableness: round2(clamp01(
      (base.agreeableness + (shift.agreeableness ?? 0)) * (1 - 0.35 * conviction)
      + (undecided ? 0.1 : 0),
    )),
    skepticism: round2(clamp01(base.skepticism + (shift.skepticism ?? 0))),
    deference: round2(clamp01(base.deference + (shift.deference ?? 0))),
    closure: round2(clamp01(
      base.closure + (shift.closure ?? 0) - (undecided ? 0.1 : 0),
    )),
    reactance: round2(clamp01(
      base.reactance + (shift.reactance ?? 0) + 0.2 * conviction,
    )),
    conviction: round2(conviction),
  }

  const caresAbout = themesByWeight(juror, (weight) => weight >= 2)
  const notices = themesByWeight(juror, (weight) => weight === 1)

  return {
    id: juror.id,
    seat: juror.seat,
    label: juror.label,
    persona: juror.persona,
    register: juror.register,
    arc: juror.arc,
    traits,
    caresAbout,
    notices,
    wary: themesByWeight(juror, (weight) => weight <= -1),
    focus: caresAbout[0] ?? notices[0] ?? null,
    style: styleFor(traits),
  }
}

export function jurorProfiles(jurors: readonly Juror[]): JurorProfile[] {
  return jurors.map(jurorProfile)
}

export function profileIndex(
  jurors: readonly Juror[],
): Map<string, JurorProfile> {
  return new Map(jurors.map((juror) => [juror.id, jurorProfile(juror)]))
}
