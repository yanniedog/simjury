import { z } from 'zod'

/**
 * Schema for a daily case. Everything a case needs to be played, revealed, and
 * scored lives here.
 *
 * The `label` field is pinned to the literal `"fiction"`. This is a deliberate
 * safety invariant, not a formality: the daily pipeline generates fiction built
 * from real trial *patterns*, never claims about real people, so a real-labelled
 * case can never enter the daily queue. Real historical cases ship through the
 * separate, human-cleared harness in the pilot repo — never here.
 */
export const beatSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['witness', 'exhibit', 'direction']),
  text: z.string().min(1),
  /** How convincing the beat *feels* (0..1). */
  surface_persuasion: z.number().min(0).max(1),
  /** What the beat is *actually* worth to the truth (0..1). */
  true_weight: z.number().min(0).max(1),
  direction: z.enum(['guilt', 'innocence']),
  reveal_stamp: z.enum(['decisive', 'minor', 'misleading']),
  reveal_note: z.string().min(1),
})

export const caseSchema = z.object({
  id: z.string().regex(/^d-\d{4}$/, 'id must look like d-0001'),
  publish_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'publish_date must be YYYY-MM-DD'),
  label: z.literal('fiction'),
  title: z.string().min(1),
  era: z.string().min(1),
  charge: z.string().min(1),
  elements: z.array(z.string().min(1)).min(2).max(4),
  beats: z.array(beatSchema).min(4).max(6),
  verdict_truth: z.enum(['Guilty', 'Not Guilty']),
  twist: z.string().min(1),
  difficulty_target: z.number().min(0).max(1),
  gen_meta: z.object({
    model: z.string(),
    prompt_version: z.string(),
    reviewer: z.string(),
    batch_pr: z.string(),
  }),
})

export type TrialBeat = z.infer<typeof beatSchema>
export type TrialCase = z.infer<typeof caseSchema>
