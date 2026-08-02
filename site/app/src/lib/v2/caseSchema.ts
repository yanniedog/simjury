import { z } from 'zod'
import { beatSchema } from '../caseSchema'
import {
  estimateV4Duration,
  V4_DURATION_MINUTES_MAX,
  V4_DURATION_MINUTES_MIN,
  V4_EVIDENCE_WORDS_MIN,
  V4_SCENE_WORDS_MIN,
  V4_STATEMENT_WORDS_MIN,
} from './duration'
import { CONTENT_ADVISORIES, OFFENCE_CODES } from './offenceProfiles'

function isRealCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]
}

export const docketCaseIdSchema = z
  .string()
  .regex(/^(dd-\d{4}|dd-intro)$/, 'id must identify a docket case')
export const docketCaseRevisionSchema = z
  .string()
  .regex(
    /^(dd-\d{4}|dd-intro)@[0-9a-f]{8}$/,
    'case revision must be a docket case storage id',
  )

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
  'knowledge',
  'intent',
  'causation',
  'duress',
  'command',
  'coercion',
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

export const dialogueTurnSchema = z.object({
  speaker: z.string().min(1),
  text: z.string().min(1),
})

export const OBJECTION_GROUNDS = [
  'leading',
  'hearsay',
  'relevance',
  'speculation',
  'argumentative',
] as const
export const objectionGroundSchema = z.enum(OBJECTION_GROUNDS)

/** The authored ruling's effect on the whole beat presented to the jury. */
export const admissibilityEffectSchema = z.discriminatedUnion('effect', [
  z.object({ effect: z.literal('exclude_beat') }).strict(),
  z
    .object({
      effect: z.literal('limited_purpose'),
      purpose: z.string().trim().min(1),
    })
    .strict(),
])
export type AdmissibilityEffect = z.infer<typeof admissibilityEffectSchema>

const interjectionPlacement = {
  id: z
    .string()
    .regex(/^[a-z][a-z0-9_-]*$/, 'interjection id must be a lowercase slug'),
  /** 0 = before the first turn; N = immediately after authored turn N. */
  after_turn: z.number().int().min(0),
  speaker: z.string().min(1),
  text: z.string().trim().min(1),
}

export const docketInterjectionSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...interjectionPlacement,
      type: z.literal('objection'),
      ground: objectionGroundSchema,
    })
    .strict(),
  z
    .object({
      ...interjectionPlacement,
      type: z.literal('sustained'),
      resolves: z.string().min(1),
      admissibility: admissibilityEffectSchema,
    })
    .strict(),
  z
    .object({
      ...interjectionPlacement,
      type: z.literal('overruled'),
      resolves: z.string().min(1),
    })
    .strict(),
  z
    .object({
      ...interjectionPlacement,
      type: z.literal('ruling'),
      ground: objectionGroundSchema,
      admissibility: admissibilityEffectSchema,
    })
    .strict(),
  z
    .object({
      ...interjectionPlacement,
      type: z.literal('admonition'),
    })
    .strict(),
])
export type DocketInterjection = z.infer<typeof docketInterjectionSchema>

/**
 * A v2 beat: the v1 hidden-weight beat plus who speaks it and which themes it
 * touches. `mode` distinguishes examination from cross for witness beats.
 */
export const docketBeatSchema = beatSchema.extend({
  speaker: z.string().min(1),
  mode: z.enum(['examination', 'cross']).optional(),
  turns: z.array(dialogueTurnSchema).min(2).optional(),
  tags: z.array(themeSchema).min(1).max(3),
})
export type DocketBeat = z.infer<typeof docketBeatSchema>

/**
 * V4 trial beats contain only material the jury may see before returning a
 * result. Editorial assessment lives in the separately loaded analysis file.
 */
export const docketBeatV4Schema = docketBeatSchema
  .omit({
    true_weight: true,
    reveal_stamp: true,
    reveal_note: true,
  })
  .extend({
    /** Same-anchor entries play in array order. V3 deliberately has no field. */
    interjections: z.array(docketInterjectionSchema).max(8).optional(),
  })
  .strict()
export type DocketBeatV4 = z.infer<typeof docketBeatV4Schema>

export const positionSchema = z.enum(['G', 'NG', 'U'])
export type Position = z.infer<typeof positionSchema>

/**
 * A player argument's stance toward a beat: it proves what it says, it cannot
 * be trusted, or it is a neutral probe that only matches `any`-stance rules.
 * Rules may match either authored stance, or wildcard with 'any'.
 */
export const stanceSchema = z.enum(['proves', 'unreliable', 'probe'])
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
  /**
   * Authored gender for narration voice selection. Must match the juror's
   * courtroom portrait (speech follows the image, not name heuristics).
   */
  gender: z.enum(['female', 'male']),
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

const docketCaseV3ObjectSchema = z.object({
    id: docketCaseIdSchema,
    publish_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'publish_date must be YYYY-MM-DD')
      .refine(isRealCalendarDate, 'publish_date must be a real calendar date'),
    label: z.literal('fiction'),
    title: z.string().min(1),
    /** Optional during the grave-crime docket migration; required by the final quality gate. */
    offence_code: z.enum(OFFENCE_CODES).optional(),
    content_advisories: z.array(z.enum(CONTENT_ADVISORIES)).min(1).optional(),
    detail_level: z.literal('non_graphic').optional(),
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
        /** Individual courtroom sketches keyed by cast or juror id. */
        portraits: z.record(z.string(), mediaAssetSchema).optional(),
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
    /** Every docket case — including the guided intro — keeps 10–14 narrated beats. */
    beats: z.array(docketBeatSchema).min(10).max(14),
    /**
     * Legacy mid-trial check-in beat ids. Optional/empty for new cases — the
     * player UI no longer records progressive conviction.
     */
    checkins: z.array(z.string().min(1)).max(5),
    reference_verdict: z.enum(['Guilty', 'Not Guilty']),
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
      language_reviewer: z.string().optional(),
      sensitivity_reviewer: z.string().optional(),
    }),
  })

const docketCaseV4ObjectSchema = docketCaseV3ObjectSchema
  .omit({
    accused: true,
    beats: true,
    epilogue: true,
    reference_verdict: true,
    twist: true,
    gen_meta: true,
  })
  .extend({
    offence_code: z.enum(OFFENCE_CODES),
    content_advisories: z.array(z.enum(CONTENT_ADVISORIES)).min(1),
    detail_level: z.literal('non_graphic'),
    accused: z
      .object({
        cast_id: z.string().min(1),
        human: z.string().min(1),
      })
      .strict(),
    beats: z.array(docketBeatV4Schema).min(10).max(14),
    gen_meta: z
      .object({
        model: z.string(),
        prompt_version: z.literal('dd-2026-v4'),
        reviewer: z.string(),
        batch_pr: z.string(),
        language_reviewer: z.string().min(1),
        sensitivity_reviewer: z.string().min(1),
      })
      .strict(),
  })
  .strict()

type ReferenceKeys = 'cast' | 'beats' | 'media' | 'jury'
type DocketReferenceFields =
  | Pick<z.infer<typeof docketCaseV3ObjectSchema>, ReferenceKeys>
  | Pick<z.infer<typeof docketCaseV4ObjectSchema>, ReferenceKeys>

function refineDocketReferences(
  c: DocketReferenceFields,
  ctx: z.RefinementCtx,
): void {
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
    const characterIds = new Set([
      ...c.cast.map((member) => member.id),
      ...c.jury.jurors.map((juror) => juror.id),
    ])
    for (const portraitId of Object.keys(c.media?.portraits ?? {})) {
      if (!characterIds.has(portraitId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `media portrait references unknown character: ${portraitId}`,
          path: ['media', 'portraits', portraitId],
        })
      }
    }
}

/** Legacy V3 parser retained while the seven cases migrate independently. */
export const docketCaseSchema = docketCaseV3ObjectSchema.superRefine(
  refineDocketReferences,
)
export type DocketCase = z.infer<typeof docketCaseSchema>

/**
 * V4 trial data. This strict schema intentionally rejects every historical
 * answer-key field and pre-verdict punishment consequence.
 */
export const docketCaseV4Schema = docketCaseV4ObjectSchema.superRefine(
  (trial, ctx) => {
    refineDocketReferences(trial, ctx)
    const addInterjectionIssue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path })
    const interjectionIds = new Set<string>()
    for (const [beatIndex, beat] of trial.beats.entries()) {
      const objections = new Map<string, { afterTurn: number; index: number }>()
      const resolved = new Set<string>()
      const turnCount = beat.turns?.length ?? 1
      let priorAnchor = -1
      for (const [index, interjection] of (beat.interjections ?? []).entries()) {
        const path = ['beats', beatIndex, 'interjections', index]
        if (interjectionIds.has(interjection.id)) {
          addInterjectionIssue(
            `duplicate interjection id: ${interjection.id}`,
            [...path, 'id'],
          )
        }
        interjectionIds.add(interjection.id)
        if (!trial.cast.some((member) => member.id === interjection.speaker)) {
          addInterjectionIssue(
            `interjection speaker '${interjection.speaker}' is not in the cast`,
            [...path, 'speaker'],
          )
        }
        if (interjection.after_turn > turnCount) {
          addInterjectionIssue(
            `after_turn ${interjection.after_turn} exceeds ${turnCount} authored turn(s)`,
            [...path, 'after_turn'],
          )
        }
        if (interjection.after_turn < priorAnchor) {
          addInterjectionIssue(
            'interjections must follow authored turn order',
            [...path, 'after_turn'],
          )
        }
        priorAnchor = interjection.after_turn

        if (interjection.type === 'objection') {
          objections.set(interjection.id, {
            afterTurn: interjection.after_turn,
            index,
          })
        } else if (
          interjection.type === 'sustained' ||
          interjection.type === 'overruled'
        ) {
          const objection = objections.get(interjection.resolves)
          if (!objection) {
            addInterjectionIssue(
              `resolution must reference a preceding objection in beat ${beat.id}`,
              [...path, 'resolves'],
            )
          } else if (resolved.has(interjection.resolves)) {
            addInterjectionIssue(
              `objection '${interjection.resolves}' is resolved more than once`,
              [...path, 'resolves'],
            )
          } else {
            resolved.add(interjection.resolves)
            if (objection.afterTurn !== interjection.after_turn) {
              addInterjectionIssue(
                `resolution must share objection '${interjection.resolves}' turn anchor`,
                [...path, 'after_turn'],
              )
            }
          }
        }
      }
      for (const [id, objection] of objections) {
        if (!resolved.has(id)) {
          addInterjectionIssue(
            `objection '${id}' has no authored resolution`,
            ['beats', beatIndex, 'interjections', objection.index],
          )
        }
      }
    }
    const estimate = estimateV4Duration(trial)
    if (
      estimate.totalMinutes < V4_DURATION_MINUTES_MIN ||
      estimate.totalMinutes > V4_DURATION_MINUTES_MAX
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `estimated duration ${estimate.totalMinutes.toFixed(2)} minutes; ` +
          `V4 cases must take ${V4_DURATION_MINUTES_MIN}-${V4_DURATION_MINUTES_MAX} minutes`,
        path: ['beats'],
      })
    }
    if (estimate.sceneWords < V4_SCENE_WORDS_MIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `scene, charge, elements, and accused background total ${estimate.sceneWords} words; ` +
          `public-juror context needs at least ${V4_SCENE_WORDS_MIN}`,
        path: ['setting'],
      })
    }
    if (estimate.statementWords < V4_STATEMENT_WORDS_MIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `openings and closings total ${estimate.statementWords} words; ` +
          `balanced rival explanations need at least ${V4_STATEMENT_WORDS_MIN}`,
        path: ['statements'],
      })
    }
    if (estimate.evidenceWords < V4_EVIDENCE_WORDS_MIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `spoken evidence and directions total ${estimate.evidenceWords} words; ` +
          `foundations, limitations, chronology, and legal directions need at least ${V4_EVIDENCE_WORDS_MIN}`,
        path: ['beats'],
      })
    }
  },
)
export type DocketCaseV4 = z.infer<typeof docketCaseV4Schema>

/** Fields that are competent and playable before a verdict in either format. */
export type CourtroomTrial = DocketCase | DocketCaseV4
export type CourtroomBeat = DocketBeat | DocketBeatV4

export const analysisRoleSchema = z.enum([
  'central',
  'counterweight',
  'context',
])
export type AnalysisRole = z.infer<typeof analysisRoleSchema>

const analysisTextSchema = z.string().trim().min(1)
const epilogueAnalysisSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('outcome_neutral'),
    text: analysisTextSchema,
  }),
  z.object({
    mode: z.literal('result_branched'),
    guilty: analysisTextSchema,
    not_guilty: analysisTextSchema,
    hung: analysisTextSchema,
  }),
])

export const docketCaseAnalysisV4Schema = z
  .object({
    schema_version: z.literal(4),
    case_id: docketCaseIdSchema,
    case_revision: docketCaseRevisionSchema,
    reference_verdict: z.enum(['Guilty', 'Not Guilty']),
    reference_reasoning: analysisTextSchema,
    strongest_opposing_interpretation: analysisTextSchema,
    sentencing_context: analysisTextSchema,
    epilogue: epilogueAnalysisSchema,
    beats: z
      .array(
        z
          .object({
            beat_id: z.string().min(1),
            editorial_weight: z.number().min(0).max(1),
            analysis_role: analysisRoleSchema,
            analysis_note: analysisTextSchema,
            admissibility: admissibilityEffectSchema.optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((analysis, ctx) => {
    const seen = new Set<string>()
    analysis.beats.forEach((beat, index) => {
      if (seen.has(beat.beat_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate beat analysis: ${beat.beat_id}`,
          path: ['beats', index, 'beat_id'],
        })
      }
      seen.add(beat.beat_id)
    })
  })
export type DocketCaseAnalysisV4 = z.infer<
  typeof docketCaseAnalysisV4Schema
>

/** Selects the strict parser without weakening either schema during migration. */
export function docketCaseSchemaForPromptVersion(
  value: unknown,
): typeof docketCaseSchema | typeof docketCaseV4Schema {
  const marker = z
    .object({
      gen_meta: z.object({ prompt_version: z.string() }).passthrough(),
    })
    .passthrough()
    .safeParse(value)
  return marker.success && marker.data.gen_meta.prompt_version === 'dd-2026-v4'
    ? docketCaseV4Schema
    : docketCaseSchema
}

export function parseDocketCaseForPromptVersion(
  value: unknown,
): DocketCase | DocketCaseV4 {
  return docketCaseSchemaForPromptVersion(value).parse(value)
}
