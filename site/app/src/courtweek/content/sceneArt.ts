import type { SceneVisual } from '../model/schema'

type CaptionPosition = SceneVisual['captionPosition']
type ArtRegion = NonNullable<SceneVisual['subjectSafeRegion']>

export interface CommissionedSceneArt {
  altDescription: string
  focalPoint: { x: number; y: number }
  subjectSafeRegion: ArtRegion
  evidenceSafeRegion: ArtRegion
  permittedCaptionPositions: CaptionPosition[]
}

/** Reviewed scene art that is safe to include in the corresponding sealed day pack. */
export const SCENE_ART_AUTHORING: Readonly<Record<string, CommissionedSceneArt>> = {
  'mon-arrival': {
    altDescription: 'Juror-seat view of the settled courtroom before evidence, with judge, separated counsel tables and the accused shown neutrally.',
    focalPoint: { x: 50, y: 44 },
    subjectSafeRegion: { x: 14, y: 18, width: 72, height: 60 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'mon-oath': {
    altDescription: 'Juror-seat view of the judge and an officer of the court addressing the jury before evidence; neither oath nor affirmation is visually preferred.',
    focalPoint: { x: 50, y: 42 },
    subjectSafeRegion: { x: 14, y: 18, width: 72, height: 60 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'mon-crown-opening': {
    altDescription: 'Crown counsel addresses the jury while defence counsel and the accused remain seated separately; posture and lighting express no view about guilt.',
    focalPoint: { x: 40, y: 46 },
    subjectSafeRegion: { x: 12, y: 18, width: 76, height: 62 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'mon-orr-chief': {
    altDescription: 'Operations supervisor Nella Orr gives evidence from the witness box while Crown counsel questions her; no route information is shown in the artwork.',
    focalPoint: { x: 54, y: 46 },
    subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'mon-orr-cross': {
    altDescription: 'Nella Orr remains in the witness box as defence counsel questions her from the opposing lectern; no disputed proposition is resolved visually.',
    focalPoint: { x: 54, y: 46 },
    subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'mon-elements': {
    altDescription: 'The judge gives preliminary directions from the bench to the jury; no legal element, inference or verdict is depicted as answered.',
    focalPoint: { x: 50, y: 38 },
    subjectSafeRegion: { x: 20, y: 16, width: 60, height: 60 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'mon-adjourn': {
    altDescription: 'The same courtroom stands empty after adjournment, with the bench, witness box and counsel tables orderly and no evidence legible.',
    focalPoint: { x: 50, y: 42 },
    subjectSafeRegion: { x: 10, y: 12, width: 80, height: 66 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'tue-resume': {
    altDescription: 'Juror-seat view of Tuesday court resuming, with the judge addressing the jury, counsel and the accused seated neutrally, and the witness box empty.',
    focalPoint: { x: 50, y: 42 },
    subjectSafeRegion: { x: 10, y: 18, width: 80, height: 62 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'tue-dorn-chief': {
    altDescription: 'Junior dispatcher Peli Dorn gives evidence from the witness box while Crown counsel questions her; no distress words, console status or inference about intent is depicted.',
    focalPoint: { x: 54, y: 46 },
    subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'tue-recording': {
    altDescription: 'The courtroom listens to the admitted distress-channel recording while Peli Dorn remains in the witness box; an abstract waveform is visible but no words or disputed meaning are depicted.',
    focalPoint: { x: 50, y: 52 },
    subjectSafeRegion: { x: 10, y: 20, width: 80, height: 62 },
    evidenceSafeRegion: { x: 36, y: 48, width: 28, height: 22 },
    permittedCaptionPositions: ['top'],
  },
  'tue-dorn-cross': {
    altDescription: 'Defence counsel questions Peli Dorn from the lectern while she remains composed in the witness box; the scene does not resolve the room noise, competing incidents or her reliability.',
    focalPoint: { x: 54, y: 46 },
    subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'tue-dorn-re': {
    altDescription: 'Crown counsel asks Peli Dorn a confined clarifying question after cross-examination; no competing incident, inference or enhancement of her evidence is depicted.',
    focalPoint: { x: 54, y: 46 },
    subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'tue-mir-chief': {
    altDescription: 'Records custodian Tovan Mir gives evidence from the witness box while Crown counsel questions him; no audit-log content, launch-strip words, time or state of mind is depicted.',
    focalPoint: { x: 54, y: 46 },
    subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'tue-mir-cross': {
    altDescription: 'Defence counsel questions records custodian Tovan Mir while he remains composed in the witness box. No log is depicted as infallible, worthless or proof of state of mind.',
    focalPoint: { x: 54, y: 46 },
    subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
}

export function commissionedVisual(sceneId: string, fallback: SceneVisual): SceneVisual {
  const art = SCENE_ART_AUTHORING[sceneId]
  if (!art) return fallback
  return {
    ...fallback,
    alt: art.altDescription,
    focalPoint: art.focalPoint,
    captionPosition: art.permittedCaptionPositions[0],
    subjectSafeRegion: art.subjectSafeRegion,
    evidenceSafeRegion: art.evidenceSafeRegion,
    permittedCaptionPositions: art.permittedCaptionPositions,
    ...(sceneId.startsWith('mon-') ? {
      // Temporary pre-release review fallback. Future days stay outside public
      // assets until their content-addressed strips arrive in a sealed pack.
      sources: {
        portrait: { avif: `scenes/${sceneId}/portrait.avif`, webp: `scenes/${sceneId}/portrait.webp` },
        tablet: { avif: `scenes/${sceneId}/tablet.avif`, webp: `scenes/${sceneId}/tablet.webp` },
        desktop: { avif: `scenes/${sceneId}/desktop.avif`, webp: `scenes/${sceneId}/desktop.webp` },
      },
    } : {}),
  }
}
