import type { SceneVisual } from '../model/schema'

type CaptionPosition = SceneVisual['captionPosition']
type ArtRegion = NonNullable<SceneVisual['subjectSafeRegion']>
type Composition = 'portrait' | 'tablet' | 'desktop'

export interface CompositionArtDirection {
  focalPoint: { x: number; y: number }
  /** Null means the composition deliberately contains no human subject. */
  subjectSafeRegion: ArtRegion | null
  /** Null means the composition deliberately contains no visible evidence. */
  evidenceSafeRegion: ArtRegion | null
  permittedCaptionPositions: CaptionPosition[]
  reviewStatus: 'compatibility-migration' | 'crop-reviewed'
}

export interface CommissionedSceneArt {
  altDescription: string
  compositionArt: Record<Composition, CompositionArtDirection>
}

/** Explicit compatibility migration for metadata reviewed as safe in all three crops. */
function sharedCompositionArt(
  direction: Omit<CompositionArtDirection, 'reviewStatus'>,
): CommissionedSceneArt['compositionArt'] {
  return {
    portrait: { ...direction, reviewStatus: 'compatibility-migration' },
    tablet: { ...direction, reviewStatus: 'compatibility-migration' },
    desktop: { ...direction, reviewStatus: 'compatibility-migration' },
  }
}

/** Reviewed scene art that is safe to include in the corresponding sealed day pack. */
export const SCENE_ART_AUTHORING: Readonly<Partial<Record<string, CommissionedSceneArt>>> = {
  'mon-arrival': {
    altDescription: 'Juror-seat view of the settled courtroom before evidence, with judge, separated counsel tables and the accused shown neutrally.',
    compositionArt: sharedCompositionArt({
      focalPoint: { x: 50, y: 44 }, subjectSafeRegion: { x: 14, y: 18, width: 72, height: 60 },
      evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
    }),
  },
  'mon-oath': {
    altDescription: 'Juror-seat view of the judge and an officer of the court addressing the jury before evidence; neither oath nor affirmation is visually preferred.',
    compositionArt: sharedCompositionArt({
      focalPoint: { x: 50, y: 42 }, subjectSafeRegion: { x: 14, y: 18, width: 72, height: 60 },
      evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
    }),
  },
  'mon-crown-opening': {
    altDescription: 'Crown counsel addresses the jury while defence counsel and the accused remain seated separately; posture and lighting express no view about guilt.',
    compositionArt: sharedCompositionArt({
      focalPoint: { x: 40, y: 46 }, subjectSafeRegion: { x: 12, y: 18, width: 76, height: 62 },
      evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
    }),
  },
  'mon-orr-chief': {
    altDescription: 'Operations supervisor Nella Orr gives evidence from the witness box while Crown counsel questions her; no route information is shown in the artwork.',
    compositionArt: sharedCompositionArt({
      focalPoint: { x: 54, y: 46 }, subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
      evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
    }),
  },
  'mon-orr-cross': {
    altDescription: 'Nella Orr remains in the witness box as defence counsel questions her from the opposing lectern; no disputed proposition is resolved visually.',
    compositionArt: sharedCompositionArt({
      focalPoint: { x: 54, y: 46 }, subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
      evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
    }),
  },
  'mon-elements': {
    altDescription: 'The judge gives preliminary directions from the bench to the jury; no legal element, inference or verdict is depicted as answered.',
    compositionArt: sharedCompositionArt({
      focalPoint: { x: 50, y: 38 }, subjectSafeRegion: { x: 20, y: 16, width: 60, height: 60 },
      evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
    }),
  },
  'mon-adjourn': {
    altDescription: 'The same courtroom stands empty after adjournment, with the bench, witness box and counsel tables orderly and no evidence legible.',
    compositionArt: sharedCompositionArt({
      focalPoint: { x: 50, y: 42 }, subjectSafeRegion: null,
      evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
    }),
  },
  'tue-resume': {
    altDescription: 'Juror-seat view of Tuesday court resuming, with the judge addressing the jury, counsel and the accused seated neutrally, and the witness box empty.',
    compositionArt: sharedCompositionArt({
      focalPoint: { x: 50, y: 42 }, subjectSafeRegion: { x: 10, y: 18, width: 80, height: 62 },
      evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
    }),
  },
  'tue-dorn-chief': {
    altDescription: 'Junior dispatcher Peli Dorn gives evidence from the witness box while Crown counsel questions her; no distress words, console status or inference about intent is depicted.',
    compositionArt: sharedCompositionArt({
      focalPoint: { x: 54, y: 46 }, subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
      evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
    }),
  },
  'tue-recording': {
    altDescription: 'The courtroom listens to the admitted distress-channel recording while Peli Dorn remains in the witness box; an abstract waveform is visible but no words or disputed meaning are depicted.',
    compositionArt: {
      portrait: {
        focalPoint: { x: 50, y: 52 }, subjectSafeRegion: { x: 8, y: 36, width: 84, height: 42 },
        evidenceSafeRegion: { x: 37, y: 53, width: 15, height: 8 }, permittedCaptionPositions: ['top'], reviewStatus: 'crop-reviewed',
      },
      tablet: {
        focalPoint: { x: 50, y: 52 }, subjectSafeRegion: { x: 10, y: 22, width: 80, height: 58 },
        evidenceSafeRegion: { x: 39, y: 57, width: 12, height: 10 }, permittedCaptionPositions: ['top'], reviewStatus: 'crop-reviewed',
      },
      desktop: {
        focalPoint: { x: 50, y: 52 }, subjectSafeRegion: { x: 10, y: 20, width: 80, height: 58 },
        evidenceSafeRegion: { x: 38, y: 61, width: 10, height: 9 }, permittedCaptionPositions: ['top'], reviewStatus: 'crop-reviewed',
      },
    },
  },
  'tue-dorn-cross': {
    altDescription: 'Defence counsel questions Peli Dorn from the lectern while she remains composed in the witness box; the scene does not resolve the room noise, competing incidents or her reliability.',
    compositionArt: sharedCompositionArt({
      focalPoint: { x: 54, y: 46 }, subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
      evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
    }),
  },
  'tue-dorn-re': {
    altDescription: 'Crown counsel asks Peli Dorn a confined clarifying question after cross-examination; no competing incident, inference or enhancement of her evidence is depicted.',
    compositionArt: sharedCompositionArt({
      focalPoint: { x: 54, y: 46 }, subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
      evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
    }),
  },
  'tue-mir-chief': {
    altDescription: 'Records custodian Tovan Mir gives evidence from the witness box while Crown counsel questions him; no audit-log content, launch-strip words, time or state of mind is depicted.',
    compositionArt: sharedCompositionArt({
      focalPoint: { x: 54, y: 46 }, subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
      evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
    }),
  },
  'tue-mir-cross': {
    altDescription: 'Defence counsel questions records custodian Tovan Mir while he remains composed in the witness box. No log is depicted as infallible, worthless or proof of state of mind.',
    compositionArt: sharedCompositionArt({
      focalPoint: { x: 54, y: 46 }, subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
      evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
    }),
  },
  'tue-adjourn': {
    altDescription: 'The courtroom is empty after Tuesday’s adjournment, with the bench, witness box and counsel tables orderly in dusk light. No evidence remains visible or readable.',
    compositionArt: {
      portrait: {
        focalPoint: { x: 50, y: 42 }, subjectSafeRegion: null,
        evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'], reviewStatus: 'crop-reviewed',
      },
      tablet: {
        focalPoint: { x: 50, y: 42 }, subjectSafeRegion: null,
        evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'], reviewStatus: 'crop-reviewed',
      },
      desktop: {
        focalPoint: { x: 50, y: 42 }, subjectSafeRegion: null,
        evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'], reviewStatus: 'crop-reviewed',
      },
    },
  },
  'wed-resume': {
    altDescription: 'Judge Sel Aven addresses the jury as Wednesday court resumes; Crown counsel, defence counsel and Mara Venn remain seated neutrally, the witness box is empty and no evidence is displayed.',
    compositionArt: {
      portrait: {
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: { x: 0, y: 38, width: 100, height: 47 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'], reviewStatus: 'crop-reviewed',
      },
      tablet: {
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 50 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'], reviewStatus: 'crop-reviewed',
      },
      desktop: {
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: { x: 0, y: 31, width: 100, height: 59 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'], reviewStatus: 'crop-reviewed',
      },
    },
  },
  'wed-vos': {
    altDescription: 'Marine survival physician Dr Eren Vos gives evidence from the witness box while Crown counsel questions her. No survival model, death time, probability or conclusion about causation is depicted.',
    compositionArt: {
      portrait: {
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: { x: 0, y: 35, width: 100, height: 49 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'], reviewStatus: 'crop-reviewed',
      },
      tablet: {
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: { x: 0, y: 30, width: 100, height: 58 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'], reviewStatus: 'crop-reviewed',
      },
      desktop: {
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: { x: 0, y: 28, width: 100, height: 64 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'], reviewStatus: 'crop-reviewed',
      },
    },
  },
}

export function commissionedVisual(sceneId: string, fallback: SceneVisual): SceneVisual {
  const art = SCENE_ART_AUTHORING[sceneId]
  if (!art) return fallback
  // The current renderer consumes the historical flat fields. Tablet is the
  // explicit compatibility projection until it selects direction by picture source.
  const compatibility = art.compositionArt.tablet
  return {
    ...fallback,
    alt: art.altDescription,
    focalPoint: compatibility.focalPoint,
    captionPosition: compatibility.permittedCaptionPositions[0],
    subjectSafeRegion: compatibility.subjectSafeRegion ?? undefined,
    evidenceSafeRegion: compatibility.evidenceSafeRegion ?? undefined,
    permittedCaptionPositions: compatibility.permittedCaptionPositions,
    compositionArt: art.compositionArt,
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
