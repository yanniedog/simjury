import { z } from 'zod'
import { beatSchema } from '../caseSchema'

/**
 * Schema v2 — the Daily Docket case (`dd-*`), per DAILY-PIVOT.md.
 *
 * Extends the v1 daily case from a 3-minute beat list into the 8–10 minute
 * courtroom loop: beats carry a speaker (cast member) and closed-enum theme
 * tags; the case carries a cast, conviction check-in points, and a full
 * 11-juror jury block that drives the interactive deliberation engine.
 *
 * The `label` pin is inherited unchanged from v1: every docket case is
 * fiction, built from real trial *patterns*, never real events — a safety
 * invariant, not a formality. No real names of people, companies, brands, or
 * places anywhere in player-visible text.
 */

/** Closed theme enum (v3 §11.3 at daily scale). Tags beats; keys juror weights. */
export const THEMES = [
  'identity',
  'alibi',
  'digital_forensics',
  'motive',
  'opportunity',
  'method',
  'timeline',
  'credibility',
  'procedure',
  'burden',
] as const
export const themeSchema = z.enum(THEMES)
export type Theme = z.infer<typeof themeSchema>

/** The closed set of line functions a juror can voice (v3 §7.7, reduced). */
export const LINE_FUNCTIONS = [
  'agree',
  'pushback',
  'concede',
  'burden_drift',
  'burden_correct',
  'holdout',
  'final',
] as const
export const lineFunctionSchema = z.enum(LINE_FUNCTIONS)
export type LineFunction = z.infer<typeof lineFunctionSchema>

/** Juror behavioural arcs (v3 §8.6.7, reduced to the daily-lite set). */
export const ARCS = [
  'vibes',
  'steady',
  'principled_holdout',
  'mind_changer',
  'drifter',
  'burden_drifter',
  'foreperson',
] as const

/**
 * A counsel statement — opening or closing. `speaker` must resolve to a cast
 * member on the matching side (the quality gate enforces it), so narration
 * gives each advocate a consistent voice.
 */
export const statementSchema = z.object({
  speaker: z.string().min(1),
  text: z.string().min(1),
})
export type Statement = z.infer<typeof statementSchema>

export const castMemberSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/, 'cast id must be a lowercase slug'),
  /** Invented name — never a real person, company, or brand. */
  name: z.string().min(1),
  role_label: z.string().min(1),
  side: z.enum(['prosecution', 'defence', 'court']),
})
export type CastMember = z.infer<typeof castMemberSchema>

export const mediaAssetSchema = z.object({
  src: z.string().startsWith('/today/media/'),
  alt: z.string().min(1),
  caption: z.string().regex(
    /^Fictional (court sketch|character portrait|reconstruction)\b/,
    'caption must begin with an approved fictional-media label',
  ),
  kind: z.enum(['court_sketch', 'portrait', 'evidence']),
})
export type MediaAsset = z.infer<typeof mediaAssetSchema>

/**
 * A v2 beat: the v1 hidden-weight beat plus who speaks it and which themes it
 * touches. `mode` distinguishes examination from cross for witness beats.
 */
export const docketBeatSchema = beatSchema.extend({
  speaker: z.string().min(1),
  mode: z.enum(['examination', 'cross']).optional(),
  tags: z.array(themeSchema).min(1).max(3),
})
export type DocketBeat = z.infer<typeof docketBeatSchema>

export const positionSchema = z.enum(['G', 'NG', 'U'])
export type Position = z.infer<typeof positionSchema>

/**
 * A player argument's stance toward a beat: it proves what it says, or it
 * cannot be trusted. Rules may match either, or wildcard with 'any'.
 */
export const stanceSchema = z.enum(['proves', 'unreliable'])
export type Stance = z.infer<typeof stanceSchema>

export const reactionRuleSchema = z.object({
  when: z.object({
    theme: z.union([themeSchema, z.literal('any')]),
    stance: z.union([stanceSchema, z.literal('any')]),
    /**
     * Which way the argument pushes ('proves' pushes the beat's direction,
     * 'unreliable' pushes the opposite). Constrain it when the rule's line
     * only reads sensibly agreeing with one side; omitted = any. The juror's
     * voiced line must agree with the argument being made.
     */
    direction: z.enum(['guilt', 'innocence']).optional(),
  }),
  effect: z.object({
    /** Position steps toward the argument's direction (see engine). */
    delta: z.number().int().min(-2).max(2),
    confidence: z.number().int().min(-20).max(20),
    /** Which line function the juror voices when this rule fires. */
    line: lineFunctionSchema,
  }),
})
export type ReactionRule = z.infer<typeof reactionRuleSchema>

export const jurorSchema = z.object({
  id: z.string().regex(/^J-\d{2}$/, 'juror id must look like J-01'),
  /** Bench seat 2–12; seat 1 is the player. */
  seat: z.number().int().min(2).max(12),
  label: z.string().min(1),
  persona: z.string().min(1),
  register: z.enum(['plain', 'formal', 'blunt', 'hesitant']),
  arc: z.enum(ARCS),
  initial: z.object({
    position: positionSchema,
    confidence: z.number().int().min(0).max(100),
  }),
  /**
   * How receptive the juror is to arguments per theme (−2..+2). Positive
   * amplifies a matching argument; zero or negative dampens or resists it.
   */
  weights: z.record(themeSchema, z.number().int().min(-2).max(2)),
  /** Authored voice, keyed by function. Ordered rules pick from these. */
  lines: z.record(lineFunctionSchema, z.array(z.string().min(1)).min(1)),
  /**
   * Ordered, first match wins; the last rule must be the default
   * (`theme: 'any', stance: 'any'`) so every argument gets a response.
   */
  reaction_rules: z.array(reactionRuleSchema).min(2),
})
export type Juror = z.infer<typeof jurorSchema>

export const docketCaseSchema = z
  .object({
    id: z.string().regex(/^dd-\d{4}$/, 'id must look like dd-0001'),
    publish_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'publish_date must be YYYY-MM-DD'),
    label: z.literal('fiction'),
    title: z.string().min(1),
    /** Contemporary setting sketch (replaces v1 `era`) — always the present day. */
    setting: z.string().min(1),
    charge: z.string().min(1),
    elements: z.array(z.string().min(1)).min(2).max(4),
    /**
     * The cold open — 1–3 present-tense sentences read before anything legal
     * appears. Its job is to make the player care in the first ten seconds.
     */
    hook: z.string().min(1),
    /**
     * The human on trial. Shown at the intro and again at the verdict lock so
     * the decision is about a person, never just a charge. `cast_id` must
     * resolve to a defence-side cast member; `human` is life texture (who they
     * are outside this room); `if_guilty` is the concrete cost of conviction.
     */
    accused: z.object({
      cast_id: z.string().min(1),
      human: z.string().min(1),
      if_guilty: z.string().min(1),
    }),
    /** Responsive weekly art: human context plus selected, clearly labelled evidence. */
    media: z
      .object({
        cover: mediaAssetSchema,
        accused: mediaAssetSchema,
        beats: z.record(z.string(), mediaAssetSchema),
      })
      .optional(),
    /** The duel: both advocates' openings and closings, narrated in voice. */
    statements: z.object({
      opening: z.object({
        prosecution: statementSchema,
        defence: statementSchema,
      }),
      closing: z.object({
        prosecution: statementSchema,
        defence: statementSchema,
      }),
    }),
    /**
     * What happened to these people after the verdict — shown at the reveal.
     * Consequence is what makes the verdict feel heavy; never omit the humans.
     */
    epilogue: z.string().min(1),
    cast: z.array(castMemberSchema).min(3).max(9),
    beats: z.array(docketBeatSchema).min(10).max(14),
    /** Beat ids after which the conviction check-in appears (in beat order). */
    checkins: z.array(z.string().min(1)).min(3).max(5),
    verdict_truth: z.enum(['Guilty', 'Not Guilty']),
    twist: z.string().min(1),
    difficulty_target: z.number().min(0).max(1),
    jury: z.object({
      jurors: z.array(jurorSchema).length(11),
    }),
    gen_meta: z.object({
      model: z.string(),
      prompt_version: z.string(),
      reviewer: z.string(),
      batch_pr: z.string(),
    }),
  })
  .superRefine((c, ctx) => {
    // Cast and beat ids are used as map keys downstream (speaker resolution,
    // check-in ordering) — a duplicate would silently shadow an earlier entry
    // instead of failing loudly, so reject it here at the schema boundary.
    const castIds = new Set<string>()
    c.cast.forEach((m, i) => {
      if (castIds.has(m.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate cast id: ${m.id}`,
          path: ['cast', i, 'id'],
        })
      }
      castIds.add(m.id)
    })

    const beatIds = new Set<string>()
    c.beats.forEach((b, i) => {
      if (beatIds.has(b.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate beat id: ${b.id}`,
          path: ['beats', i, 'id'],
        })
      }
      beatIds.add(b.id)
    })
    for (const beatId of Object.keys(c.media?.beats ?? {})) {
      if (!beatIds.has(beatId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `media references unknown beat: ${beatId}`,
          path: ['media', 'beats', beatId],
        })
      }
    }
  })
export type DocketCase = z.infer<typeof docketCaseSchema>
