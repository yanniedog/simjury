import { z } from 'zod'
import {
  courtSessionSchema,
  deliberationPackSchema,
  evidenceSchema,
  trialRecordSchema,
} from '../model/schema'
import { courtWeekSessionMediaSchema } from '../media/manifest'

export const trialBaseSchema = trialRecordSchema.omit({
  evidence: true,
  witnesses: true,
  objections: true,
})

export const courtDayPackSchema = z.object({
  schema: z.literal('simjury.court-day-pack/v1'),
  caseId: z.literal('cw-0001'),
  revision: z.string().min(1),
  ordinal: z.number().int().min(1).max(7),
  session: courtSessionSchema,
  trialBase: trialBaseSchema.optional(),
  evidence: z.array(evidenceSchema),
  deliberation: deliberationPackSchema.optional(),
  media: courtWeekSessionMediaSchema.optional(),
})

export const sealedPackEnvelopeSchema = z.object({
  schema: z.literal('simjury.sealed-court-day/v1'),
  caseId: z.literal('cw-0001'),
  revision: z.string().min(1),
  ordinal: z.number().int().min(1).max(7),
  iv: z.string().min(16),
  ciphertext: z.string().min(24),
})
