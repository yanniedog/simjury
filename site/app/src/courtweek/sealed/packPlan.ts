import type { CourtWeek } from '../model/schema'
import type { CourtWeekRuntimeMediaManifest } from '../media/manifest'
import type { CourtDayPack, CourtWeekBootstrap } from './types'

const STRUCK_SUBSTANCE_PATTERNS = [
  /had done this before/i,
  /people in the office said/i,
]

export function assertNoStruckSubstanceAfterRuling(packs: CourtDayPack[]): void {
  for (const pack of packs.filter(({ ordinal }) => ordinal > 3)) {
    const serialized = JSON.stringify(pack)
    for (const pattern of STRUCK_SUBSTANCE_PATTERNS) {
      if (pattern.test(serialized)) {
        throw new Error(`Day ${pack.ordinal} repeats the substance of struck evidence after the ruling`)
      }
    }
  }
}

/** Pure reviewed-content partition used by both the build and leak tests. */
export function createCourtDayPacks(
  courtWeek: CourtWeek,
  bootstrap: CourtWeekBootstrap,
  mediaManifest?: CourtWeekRuntimeMediaManifest,
): CourtDayPack[] {
  if (
    bootstrap.id !== courtWeek.manifest.id ||
    bootstrap.revision !== courtWeek.manifest.revision ||
    bootstrap.releaseTag !== courtWeek.manifest.releaseTag
  ) {
    throw new Error(
      `Bootstrap revision drift: bootstrap ${bootstrap.id}@${bootstrap.revision}/${bootstrap.releaseTag} ` +
      `does not match authored ${courtWeek.manifest.id}@${courtWeek.manifest.revision}/${courtWeek.manifest.releaseTag}`,
    )
  }

  const firstEvidenceDay = new Map<string, number>()
  for (const session of courtWeek.manifest.sessions) {
    for (const scene of session.scenes) {
      for (const cue of scene.cues) {
        for (const evidenceId of cue.evidenceIds) {
          if (!firstEvidenceDay.has(evidenceId)) firstEvidenceDay.set(evidenceId, session.ordinal)
        }
      }
    }
  }

  const { evidence: _evidence, witnesses: _witnesses, objections: _objections, ...trialBase } =
    courtWeek.trial
  void _evidence
  void _witnesses
  void _objections

  const packs: CourtDayPack[] = bootstrap.sessions.map((schedule) => {
    const session = courtWeek.manifest.sessions.find((candidate) => candidate.id === schedule.id)
    if (!session) throw new Error(`Bootstrap session ${schedule.id} has no reviewed content`)
    if (
      session.ordinal !== schedule.ordinal ||
      session.unlockAt !== schedule.unlockAt ||
      JSON.stringify(session.prerequisiteSessionIds) !== JSON.stringify(schedule.prerequisiteSessionIds)
    ) {
      throw new Error(`Bootstrap schedule drifted from reviewed session ${schedule.id}`)
    }
    return {
      schema: 'simjury.court-day-pack/v1',
      caseId: bootstrap.id,
      revision: bootstrap.revision,
      ordinal: schedule.ordinal,
      session,
      ...(schedule.ordinal === 1 ? { trialBase } : {}),
      evidence: courtWeek.trial.evidence.filter(
        (item) => item.status === 'admitted' &&
          (firstEvidenceDay.get(item.id) ?? 5) === schedule.ordinal,
      ),
      ...(schedule.ordinal === 6 ? { deliberation: courtWeek.deliberation } : {}),
      ...(mediaManifest
        ? { media: mediaManifest.sessions.find((media) => media.session_id === schedule.id) }
        : {}),
    }
  })
  assertNoStruckSubstanceAfterRuling(packs)
  return packs
}
