export interface CourtWeekMediaPolicy {
  dataSaver: boolean
  recordedNarration: boolean
  preloadNextScene: boolean
  ambience: boolean
}

type NavigatorWithConnection = Pick<Navigator, 'userAgent'> & {
  connection?: { saveData?: unknown }
}

export function navigatorRequestsDataSaver(
  navigatorLike: NavigatorWithConnection | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): boolean {
  return navigatorLike?.connection?.saveData === true
}

export function courtWeekMediaPolicy(
  dataSaver: boolean,
  narrationApproved: boolean,
): CourtWeekMediaPolicy {
  return {
    dataSaver,
    recordedNarration: !dataSaver || narrationApproved,
    preloadNextScene: !dataSaver,
    ambience: !dataSaver,
  }
}

export function cueForMediaPolicy<T extends { audio?: unknown }>(
  cue: T,
  policy: CourtWeekMediaPolicy,
): T {
  return policy.recordedNarration ? cue : { ...cue, audio: undefined }
}

export function nextCueForMediaPolicy<T>(
  cue: T | undefined,
  policy: CourtWeekMediaPolicy,
): T | undefined {
  return policy.preloadNextScene ? cue : undefined
}
