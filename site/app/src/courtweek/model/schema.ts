import { z } from 'zod'

export const verdictSchema = z.enum(['murder', 'manslaughter', 'not-guilty', 'unable-to-agree'])
export type Verdict = z.infer<typeof verdictSchema>

export const courtEventSchema = z.enum([
  'arrival', 'empanelment', 'plea', 'oath', 'preliminary-direction',
  'crown-opening', 'defence-opening-reserved', 'defence-opening',
  'witness-chief', 'witness-cross', 'witness-reexamination', 'exhibit-admitted',
  'objection', 'ruling', 'crown-close', 'silence-direction', 'defence-close',
  'crown-closing', 'defence-closing', 'summing-up', 'retire',
  'provisional-vote', 'first-ballot', 'jury-discussion', 'jury-note',
  'judge-response', 'second-ballot', 'perseverance-direction',
  'majority-direction', 'final-ballot', 'verdict-return', 'analysis', 'adjournment',
])
export type CourtEvent = z.infer<typeof courtEventSchema>

export const legalPhaseSchema = z.enum([
  'arrival', 'crown-case', 'defence-case', 'addresses', 'directions',
  'deliberation', 'verdict', 'analysis',
])
export type LegalPhase = z.infer<typeof legalPhaseSchema>

const pointSchema = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })
const regionSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().positive().max(100),
  height: z.number().positive().max(100),
}).refine((region) => region.x + region.width <= 100 && region.y + region.height <= 100)
const captionPositionSchema = z.enum(['top', 'bottom', 'left', 'right'])
const sceneArtPathSchema = z.string().regex(/^scenes\/[a-z0-9-]+\/(?:portrait|tablet|desktop)\.(?:avif|webp)$/u)
const sceneArtSourcesSchema = z.object({
  portrait: z.object({ avif: sceneArtPathSchema, webp: sceneArtPathSchema }).strict(),
  tablet: z.object({ avif: sceneArtPathSchema, webp: sceneArtPathSchema }).strict(),
  desktop: z.object({ avif: sceneArtPathSchema, webp: sceneArtPathSchema }).strict(),
}).strict()
const compositionArtDirectionSchema = z.object({
  focalPoint: pointSchema,
  subjectSafeRegion: regionSchema.nullable(),
  evidenceSafeRegion: regionSchema.nullable(),
  permittedCaptionPositions: z.array(captionPositionSchema).min(1),
  reviewStatus: z.enum(['compatibility-migration', 'crop-reviewed']),
}).strict()
const sceneCompositionArtSchema = z.object({
  portrait: compositionArtDirectionSchema,
  tablet: compositionArtDirectionSchema,
  desktop: compositionArtDirectionSchema,
}).strict()
const runtimeStripSourcesSchema = z.object({
  portrait: z.object({ avif: z.string().url(), webp: z.string().url() }).strict(),
  tablet: z.object({ avif: z.string().url(), webp: z.string().url() }).strict(),
  desktop: z.object({ avif: z.string().url(), webp: z.string().url() }).strict(),
}).strict()

export const visualSchema = z.object({
  fallbackId: z.string().min(1),
  alt: z.string().min(1),
  focalPoint: pointSchema,
  captionPosition: captionPositionSchema,
  subjectSafeRegion: regionSchema.optional(),
  evidenceSafeRegion: regionSchema.optional(),
  permittedCaptionPositions: z.array(captionPositionSchema).min(1).optional(),
  /** Art-directed metadata for each independently composed device rendition. */
  compositionArt: sceneCompositionArtSchema.optional(),
  sources: sceneArtSourcesSchema.optional(),
  runtimeStrip: z.object({
    cell: z.union([z.literal(0), z.literal(1)]),
    sources: runtimeStripSourcesSchema,
  }).strict().optional(),
})
export type SceneVisual = z.infer<typeof visualSchema>

export const audioSourceSchema = z.object({
  opus: z.string().url().optional(),
  aac: z.string().url().optional(),
  mp3: z.string().url().optional(),
  segmentId: z.string().min(1).optional(),
  startSeconds: z.number().min(0).optional(),
  endSeconds: z.number().positive().optional(),
}).refine(
  (value) => Boolean(value.opus || value.aac || value.mp3),
  'at least one audio source is required',
).refine(
  (value) => value.startSeconds === undefined || (
    value.endSeconds !== undefined && value.endSeconds > value.startSeconds
  ),
  'audio cue end must follow its start',
)

export const sceneCueSchema = z.object({
  id: z.string().min(1),
  event: courtEventSchema,
  speaker: z.string().min(1),
  text: z.string().min(1),
  /** Equivalent proposition for users who cannot perceive the visual or audio treatment. */
  accessibleProposition: z.string().min(1),
  tone: z.enum(['neutral', 'formal', 'chief', 'cross', 'ruling', 'deliberation']),
  evidenceIds: z.array(z.string().min(1)).default([]),
  audio: audioSourceSchema.optional(),
  replayable: z.boolean().default(false),
})
export type SceneCue = z.infer<typeof sceneCueSchema>

export const interactionSchema = z.object({
  kind: z.enum(['observe', 'inspect-exhibit', 'choose-focus', 'seal-vote', 'reasoning', 'jury-note', 'second-vote', 'final-vote']),
  prompt: z.string().min(1),
  minimumSeconds: z.number().int().min(15).max(360),
  options: z.array(z.string().min(1)).max(8).optional(),
})

export const sceneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  phase: legalPhaseSchema,
  visual: visualSchema,
  cues: z.array(sceneCueSchema).min(1),
  transitionSeconds: z.number().int().min(2).max(45),
  interaction: interactionSchema.optional(),
})
export type Scene = z.infer<typeof sceneSchema>

export const courtSessionSchema = z.object({
  id: z.string().min(1),
  ordinal: z.number().int().min(1).max(7),
  day: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
  title: z.string().min(1),
  unlockAt: z.string().datetime({ offset: true }),
  targetMinutes: z.literal(20),
  prerequisiteSessionIds: z.array(z.string().min(1)),
  scenes: z.array(sceneSchema).min(3),
})
export type CourtSession = z.infer<typeof courtSessionSchema>

const exhibitPresentationBase = {
  alt: z.string().min(1),
  ambiguity: z.string().min(1),
}
const exhibitFieldSchema = z.object({ label: z.string().min(1), value: z.string().min(1) })
export const exhibitPresentationSchema = z.discriminatedUnion('kind', [
  z.object({ ...exhibitPresentationBase, kind: z.literal('route'), origin: z.string(), destination: z.string(), distance: z.string(), disclaimer: z.string() }),
  z.object({ ...exhibitPresentationBase, kind: z.literal('audit'), heading: z.string(), subheading: z.string(), caption: z.string(), fields: z.array(exhibitFieldSchema).min(1), footer: z.string() }),
  z.object({ ...exhibitPresentationBase, kind: z.literal('strip'), heading: z.string(), fields: z.array(exhibitFieldSchema).min(1), notation: z.string(), footer: z.string() }),
  z.object({ ...exhibitPresentationBase, kind: z.literal('ready'), heading: z.string(), subheading: z.string(), craft: z.string(), status: z.string(), statusMeaning: z.string(), warningMarker: z.string(), footer: z.string() }),
  z.object({ ...exhibitPresentationBase, kind: z.literal('warning'), heading: z.string(), fields: z.array(exhibitFieldSchema).min(1), footer: z.string() }),
  z.object({ ...exhibitPresentationBase, kind: z.literal('survival'), heading: z.string(), comparisons: z.array(exhibitFieldSchema).length(2), footer: z.string() }),
])
export type ExhibitPresentation = z.infer<typeof exhibitPresentationSchema>

export const evidenceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['recording', 'document', 'system-log', 'diagram', 'expert-opinion', 'oral-testimony']),
  provenance: z.string().min(1),
  authentication: z.string().min(1),
  integrity: z.string().min(1),
  admittedThrough: z.string().min(1),
  allowedUses: z.array(z.string().min(1)).min(1),
  limitations: z.array(z.string().min(1)).min(1),
  replayable: z.boolean(),
  status: z.enum(['admitted', 'struck']),
  accessibleProposition: z.string().min(1),
  presentation: exhibitPresentationSchema.optional(),
})
export type EvidenceItem = z.infer<typeof evidenceSchema>

export const witnessSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  calledBy: z.enum(['Crown', 'Defence']),
  role: z.string().min(1),
  chiefCueIds: z.array(z.string().min(1)).min(1),
  crossCueIds: z.array(z.string().min(1)).min(1),
  reexaminationCueIds: z.array(z.string().min(1)),
  reexaminationScope: z.array(z.string().min(1)),
})
export type Witness = z.infer<typeof witnessSchema>

export const objectionSchema = z.object({
  id: z.string().min(1),
  cueId: z.string().min(1),
  madeBy: z.enum(['Crown', 'Defence']),
  ground: z.enum(['hearsay', 'leading', 'argumentative', 'speculation', 'relevance']),
  timing: z.enum(['pre-answer', 'post-answer']),
  ruling: z.enum(['sustained', 'overruled']),
  struckEvidenceId: z.string().optional(),
})

export const offenceSchema = z.object({
  id: z.enum(['orinth-cc-s18', 'orinth-cc-s22', 'orinth-eca-s41']),
  citation: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(1),
  elementQuestions: z.array(z.string().min(1)).min(1),
})

export const trialRecordSchema = z.object({
  jurisdiction: z.literal('State of Orinth'),
  court: z.literal('Superior Criminal Court of Aster Reach'),
  charge: z.literal('Murder by intentional omission'),
  accused: z.string().min(1),
  deceased: z.string().min(1),
  plea: z.literal('Not Guilty'),
  offences: z.array(offenceSchema).length(3),
  agreedFacts: z.array(z.string().min(1)).min(3),
  evidence: z.array(evidenceSchema).min(6),
  witnesses: z.array(witnessSchema).min(5),
  objections: z.array(objectionSchema).min(4),
  accusedTestifies: z.literal(false),
})
export type TrialRecord = z.infer<typeof trialRecordSchema>

export const jurorSchema = z.object({
  id: z.string().regex(/^juror-(0[1-9]|1[01])$/),
  name: z.string().min(1),
  occupation: z.string().min(1),
  concern: z.string().min(1),
  reasoningStrength: z.string().min(1),
  vulnerability: z.string().min(1),
})

export const outcomePathSchema = z.object({
  verdict: verdictSchema,
  threshold: z.string().min(1),
  lawfulRationale: z.string().min(1),
  counterAnalysis: z.string().min(1),
})

export const reasoningMoveSchema = z.enum([
  'connect', 'distinguish', 'test-source', 'challenge-inference',
  'raise-alternative', 'apply-burden',
])
export type ReasoningMove = z.infer<typeof reasoningMoveSchema>

export const reasoningContributionSchema = z.object({
  sceneId: z.string().min(1),
  legalQuestion: z.string().min(1),
  evidenceId: z.string().min(1),
  move: reasoningMoveSchema,
  recordedAt: z.string().datetime({ offset: true }),
  influencePenalty: z.number().int().max(0).default(0),
})
export type ReasoningContribution = z.infer<typeof reasoningContributionSchema>

export const deliberationPackSchema = z.object({
  jurors: z.array(jurorSchema).length(11),
  legalQuestions: z.array(z.string().min(1)).min(3),
  reasoningMoves: z.array(reasoningMoveSchema).length(6),
  improperArguments: z.array(z.object({ claim: z.string().min(1), correction: z.string().min(1), influencePenalty: z.number().int().negative() })).min(4),
  juryNote: z.object({ question: z.string().min(1), answer: z.string().min(1) }),
  /** Authored-juror aggregate only; the player is added after sealing their own vote. */
  firstBallot: z.object({
    murder: z.number().int().min(0),
    manslaughter: z.number().int().min(0),
    'not-guilty': z.number().int().min(0),
    'unable-to-agree': z.number().int().min(0),
  }).refine((v) => Object.values(v).reduce((a, b) => a + b, 0) === 11, 'authored first ballot must total eleven'),
  majorityGate: z.object({ minimumElapsedCourtHours: z.number().gt(8), requiresFailedUnanimity: z.literal(true), requiresFurtherDiscussion: z.literal(true), threshold: z.literal(11) }),
  outcomePaths: z.array(outcomePathSchema).length(4),
})
export type DeliberationPack = z.infer<typeof deliberationPackSchema>

export const courtWeekManifestSchema = z.object({
  schemaVersion: z.literal('court-week-v1'),
  id: z.literal('cw-0001'),
  revision: z.string().regex(/^\d{4}\.\d{2}\.\d{2}-r\d+$/),
  label: z.literal('fiction'),
  title: z.literal('Eleven Minutes'),
  subtitle: z.string().min(1),
  contentAdvisory: z.string().min(1),
  timezone: z.literal('Australia/Hobart'),
  releaseTag: z.string().min(1),
  sessions: z.array(courtSessionSchema).length(7),
})
export type CourtWeekManifest = z.infer<typeof courtWeekManifestSchema>

export const courtWeekSchema = z.object({
  manifest: courtWeekManifestSchema,
  trial: trialRecordSchema,
  deliberation: deliberationPackSchema,
})
export type CourtWeek = z.infer<typeof courtWeekSchema>

export const weeklyProgressSchema = z.object({
  schemaVersion: z.literal('court-week-progress-v1'),
  courtWeekId: z.literal('cw-0001'),
  revision: z.string().min(1),
  highestObservedTime: z.string().datetime({ offset: true }),
  completedSessionIds: z.array(z.string()),
  currentSessionId: z.string().optional(),
  currentSceneId: z.string().optional(),
  currentCueId: z.string().optional(),
  notes: z.string(),
  provisionalVote: verdictSchema.optional(),
  secondVote: verdictSchema.optional(),
  finalVote: verdictSchema.optional(),
  reasoningContributions: z.array(reasoningContributionSchema).optional(),
  secondBallotWasUnanimous: z.boolean().optional(),
  majorityDirectionReceived: z.boolean().optional(),
  returnedVerdict: verdictSchema.optional(),
  returnedAgreement: z.enum(['unanimous', 'majority', 'hung']).optional(),
})
export type WeeklyProgress = z.infer<typeof weeklyProgressSchema>
