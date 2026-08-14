import { createHash } from 'node:crypto'
import { z } from 'zod'

export const CHIRP_SOURCE_SCHEMA = 'simjury.google-chirp3-hd-source/v1' as const
const voiceSchema = z.object({
  name: z.string().min(1),
  voiceId: z.string().regex(/^en-AU-Chirp3-HD-[A-Za-z]+$/u),
  presentedGender: z.enum(['female', 'male']),
}).strict()

export const chirpSourceSchema = z.object({
  schema: z.literal(CHIRP_SOURCE_SCHEMA),
  capturedAt: z.string().datetime({ offset: true }),
  inventory: z.object({
    sourceUrls: z.tuple([
      z.literal('https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd'),
      z.literal('https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types'),
    ]),
    locale: z.literal('en-AU'),
    model: z.literal('Chirp 3: HD voices'),
    voices: z.array(voiceSchema).length(30),
  }).strict(),
  pricing: z.object({
    sourceUrl: z.literal('https://cloud.google.com/text-to-speech/pricing'),
    sku: z.literal('F977-2280-6F1B'),
    billingRequired: z.literal(true),
    freeTierCharactersPerMonth: z.literal(1_000_000),
    usdMicrosPerMillionCharactersAfterFreeTier: z.literal(30_000_000),
    billingDescription: z.literal('input characters including spaces and newlines'),
    estimatorCharacterUnit: z.literal('unicode-code-points'),
  }).strict(),
  audConversion: z.object({
    sourceUrl: z.literal('https://www.rba.gov.au/statistics/frequency/exchange-rates.html'),
    observationDate: z.literal('2026-08-14'),
    usdPerAud: z.literal(0.7068),
    audMicrosPerUsd: z.literal(1_414_827),
  }).strict(),
}).strict()

const female = ['Achernar', 'Aoede', 'Autonoe', 'Callirrhoe', 'Despina', 'Erinome', 'Gacrux',
  'Kore', 'Laomedeia', 'Leda', 'Pulcherrima', 'Sulafat', 'Vindemiatrix', 'Zephyr']
const male = ['Achird', 'Algenib', 'Algieba', 'Alnilam', 'Charon', 'Enceladus', 'Fenrir', 'Iapetus',
  'Orus', 'Puck', 'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Schedar', 'Umbriel', 'Zubenelgenubi']

const voices = [...female.map((name) => ({ name, presentedGender: 'female' as const })),
  ...male.map((name) => ({ name, presentedGender: 'male' as const }))]
  .sort((left, right) => left.name.localeCompare(right.name, 'en'))
  .map((voice) => ({ ...voice, voiceId: `en-AU-Chirp3-HD-${voice.name}` }))

export const GOOGLE_CHIRP3_SOURCE = validateGoogleChirp3Source({
  schema: CHIRP_SOURCE_SCHEMA,
  capturedAt: '2026-08-15T03:12:32+10:00',
  inventory: {
    sourceUrls: [
      'https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd',
      'https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types',
    ],
    locale: 'en-AU', model: 'Chirp 3: HD voices', voices,
  },
  pricing: {
    sourceUrl: 'https://cloud.google.com/text-to-speech/pricing',
    sku: 'F977-2280-6F1B', billingRequired: true, freeTierCharactersPerMonth: 1_000_000,
    usdMicrosPerMillionCharactersAfterFreeTier: 30_000_000,
    billingDescription: 'input characters including spaces and newlines',
    estimatorCharacterUnit: 'unicode-code-points',
  },
  audConversion: {
    sourceUrl: 'https://www.rba.gov.au/statistics/frequency/exchange-rates.html',
    observationDate: '2026-08-14', usdPerAud: 0.7068, audMicrosPerUsd: 1_414_827,
  },
})

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
  return JSON.stringify(value)
}
const digest = (value: unknown): string => `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`

export const GOOGLE_CHIRP3_INVENTORY_DIGEST = digest(GOOGLE_CHIRP3_SOURCE.inventory)
export const GOOGLE_CHIRP3_PRICING_DIGEST = digest(GOOGLE_CHIRP3_SOURCE.pricing)
export const GOOGLE_CHIRP3_AUD_CONVERSION_DIGEST = digest(GOOGLE_CHIRP3_SOURCE.audConversion)

export function validateGoogleChirp3Source(value: unknown) {
  const source = chirpSourceSchema.parse(value)
  const ids = source.inventory.voices.map(({ voiceId }) => voiceId)
  if (new Set(ids).size !== 30) throw new Error('Chirp source must contain 30 distinct voice ids')
  if (JSON.stringify(ids) !== JSON.stringify([...ids].sort())) throw new Error('Chirp voice ids must be sorted')
  for (const voice of source.inventory.voices) {
    if (voice.voiceId !== `en-AU-Chirp3-HD-${voice.name}`) throw new Error(`Voice id does not match name: ${voice.name}`)
  }
  const femaleCount = source.inventory.voices.filter(({ presentedGender }) => presentedGender === 'female').length
  const maleCount = source.inventory.voices.filter(({ presentedGender }) => presentedGender === 'male').length
  if (femaleCount !== 14 || maleCount !== 16) {
    throw new Error('Chirp source must retain the documented 14 female and 16 male labels')
  }
  return source
}
