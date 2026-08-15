import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
  COURT_WEEK_NAME_CLEARANCE_SCHEMA,
  COURT_WEEK_NAME_PROPOSALS,
  assessCourtWeekNameClearance,
} from '../src/courtweek/content/nameClearance'
import type { ActorId } from '../src/courtweek/content/speechReview'
import {
  buildChirpAuditionPlan,
  redactSecrets,
  runChirpAuditionPlanCli,
} from './court-week-chirp-audition'

export const COURT_WEEK_NAME_AUDITION_SCHEMA = 'simjury.court-week-name-audition/v1' as const

const ROLE_LEADS: Partial<Record<ActorId, string>> = {
  judge: 'Judge', 'crown-counsel': 'Crown counsel', 'defence-counsel': 'Defence counsel',
  accused: 'The accused', 'ilan-saye': 'The caller', 'nella-orr': 'Witness', 'peli-dorn': 'Witness',
  'tovan-mir': 'Witness', 'jaro-pell': 'Witness', 'eren-vos': 'Doctor', 'oren-vale': 'Witness',
  'tali-rusk': 'Witness', 'sera-quill': 'Witness', 'edda-rook': 'Foreperson', 'niko-hale': 'Juror',
  'lina-fei': 'Juror', 'ari-tem': 'Juror', 'sola-iven': 'Juror', 'bram-tey': 'Juror',
  'kessa-noor': 'Juror', 'daro-sen': 'Juror', 'yara-merrow': 'Juror', 'toma-reed': 'Juror',
  'omri-cade': 'Juror',
}

function roleLead(actorId: ActorId): string {
  const lead = ROLE_LEADS[actorId]
  if (!lead) throw new Error(`${actorId}: missing courtroom name-audition role`)
  return lead
}

export function buildCourtWeekNameAudition() {
  const clearance = assessCourtWeekNameClearance()
  const people = COURT_WEEK_NAME_PROPOSALS.filter((proposal) => proposal.proposedPersonalName)
  if (people.length !== 24 || clearance.pendingActorIds.length !== 24) {
    throw new Error('Name audition requires the exact 24 pending personal-name proposals')
  }
  const text = people.map(({ actorId, proposedPersonalName }) =>
    `${roleLead(actorId)} ${proposedPersonalName}.`).join(' ')
  for (const { actorId, proposedPersonalName } of people) {
    if (text.split(proposedPersonalName!).length !== 2) throw new Error(`${actorId}: name must occur exactly once`)
  }
  const plan = buildChirpAuditionPlan(text, {
    schema: COURT_WEEK_NAME_CLEARANCE_SCHEMA,
    digest: clearance.proposalDigest,
  })
  return {
    schema: COURT_WEEK_NAME_AUDITION_SCHEMA,
    proposalDigest: clearance.proposalDigest,
    actorIds: people.map(({ actorId }) => actorId),
    names: people.map(({ proposedPersonalName }) => proposedPersonalName!),
    plan,
  }
}

export async function runCourtWeekNameAuditionCli(
  args: readonly string[], environment: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch,
) {
  const audition = buildCourtWeekNameAudition()
  const result = await runChirpAuditionPlanCli(audition.plan, args, environment, fetcher)
  return { schema: audition.schema, proposalDigest: audition.proposalDigest, ...result }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN
  runCourtWeekNameAuditionCli(process.argv.slice(2), process.env)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(redactSecrets(error, [token]))
      process.exitCode = 1
    })
}
