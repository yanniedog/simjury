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

/** Adds reviewed status while legal safe-region and caption choices stay explicit. */
function cropReviewedDirection({
  focalPoint,
  subjectSafeRegion,
  evidenceSafeRegion,
  permittedCaptionPositions,
}: Omit<CompositionArtDirection, 'reviewStatus'>): CompositionArtDirection {
  return {
    focalPoint,
    subjectSafeRegion,
    evidenceSafeRegion,
    permittedCaptionPositions,
    reviewStatus: 'crop-reviewed',
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
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 52 }, subjectSafeRegion: { x: 8, y: 36, width: 84, height: 42 },
        evidenceSafeRegion: { x: 37, y: 53, width: 15, height: 8 },
        permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 52 }, subjectSafeRegion: { x: 10, y: 22, width: 80, height: 58 },
        evidenceSafeRegion: { x: 39, y: 57, width: 12, height: 10 },
        permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 52 }, subjectSafeRegion: { x: 10, y: 20, width: 80, height: 58 },
        evidenceSafeRegion: { x: 38, y: 61, width: 10, height: 9 },
        permittedCaptionPositions: ['top'],
      }),
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
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 42 }, subjectSafeRegion: null,
        evidenceSafeRegion: null,
        permittedCaptionPositions: ['bottom'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 42 }, subjectSafeRegion: null,
        evidenceSafeRegion: null,
        permittedCaptionPositions: ['bottom'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 42 }, subjectSafeRegion: null,
        evidenceSafeRegion: null,
        permittedCaptionPositions: ['bottom'],
      }),
    },
  },
  'wed-resume': {
    altDescription: 'Judge Sel Aven addresses the jury as Wednesday court resumes; Crown counsel, defence counsel and Mara Venn remain seated neutrally, the witness box is empty and no evidence is displayed.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: { x: 0, y: 38, width: 100, height: 47 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 50 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: { x: 0, y: 31, width: 100, height: 59 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'wed-pell-chief': {
    altDescription: 'Rescue supervisor Jaro Pell gives evidence from the witness box while Crown counsel questions him. No readiness label, warning status, launch authority or conclusion about Mara Venn hearing the operations channel is depicted.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 55, y: 47 }, subjectSafeRegion: { x: 0, y: 36, width: 100, height: 49 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 54, y: 46 }, subjectSafeRegion: { x: 0, y: 30, width: 100, height: 58 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 54, y: 46 }, subjectSafeRegion: { x: 0, y: 28, width: 100, height: 64 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'wed-pell-cross': {
    altDescription: 'Defence counsel Corin Dax questions rescue supervisor Jaro Pell while the judge and jury listen. No steering warning, risk level, operations-channel record or conclusion about whether Mara Venn heard Pell is depicted.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 52, y: 48 }, subjectSafeRegion: { x: 0, y: 37, width: 100, height: 49 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 52, y: 47 }, subjectSafeRegion: { x: 0, y: 27, width: 100, height: 62 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 53, y: 47 }, subjectSafeRegion: { x: 0, y: 25, width: 100, height: 67 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'wed-vos': {
    altDescription: 'Marine survival physician Dr Eren Vos gives evidence from the witness box while Crown counsel questions her. No survival model, death time, probability or conclusion about causation is depicted.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: { x: 0, y: 35, width: 100, height: 49 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: { x: 0, y: 30, width: 100, height: 58 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: { x: 0, y: 28, width: 100, height: 64 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'wed-vale': {
    altDescription: 'Compliance director Oren Vale gives evidence from the witness box while Crown counsel questions him. No draft review, recommendation, prior delay, statement by Mara Venn or conclusion about motive is depicted.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 53, y: 48 }, subjectSafeRegion: { x: 0, y: 36, width: 100, height: 49 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 52, y: 47 }, subjectSafeRegion: { x: 0, y: 28, width: 100, height: 61 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 52, y: 47 }, subjectSafeRegion: { x: 0, y: 25, width: 100, height: 67 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'wed-strike': {
    altDescription: 'Judge Sel Aven gives an immediate open-palm ruling while Oren Vale remains composed in the witness box and counsel stay neutral. No rumour, earlier act, character inference or struck words are depicted.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 51, y: 48 }, subjectSafeRegion: { x: 0, y: 37, width: 100, height: 48 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 51, y: 47 }, subjectSafeRegion: { x: 0, y: 28, width: 100, height: 61 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 51, y: 47 }, subjectSafeRegion: { x: 0, y: 25, width: 100, height: 67 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'wed-crown-close': {
    altDescription: 'Crown counsel Asha Renn stands at the Crown lectern to close the prosecution case while the judge, defence table and accused remain composed. No conclusion about the evidence, charge or guilt is depicted.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 47 }, subjectSafeRegion: { x: 0, y: 32, width: 100, height: 54 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 47 }, subjectSafeRegion: { x: 0, y: 26, width: 100, height: 63 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 46 }, subjectSafeRegion: { x: 0, y: 23, width: 100, height: 68 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'wed-adjourn': {
    altDescription: 'The Court of Orinth courtroom stands empty after the Wednesday adjournment, with the bench, witness box, counsel tables and jury rail left undisturbed. No evidence, person or conclusion is depicted.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 49 }, subjectSafeRegion: null,
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: null,
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 47 }, subjectSafeRegion: null,
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'thu-opening': {
    altDescription: 'Defence counsel Corin Dax stands to open the defence case while accused Mara Venn remains seated beside him and the judge and Crown listen. No evidence, testimony or conclusion about guilt is depicted.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 52, y: 48 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 52 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 51, y: 47 }, subjectSafeRegion: { x: 0, y: 27, width: 100, height: 62 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 52, y: 46 }, subjectSafeRegion: { x: 0, y: 24, width: 100, height: 68 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'thu-rusk-chief': {
    altDescription: 'Human-factors expert Tali Rusk gives evidence from the witness box while defence counsel and the accused listen. No alarm mechanism, diagnosis, view about intention or conclusion about guilt is depicted.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 52, y: 48 }, subjectSafeRegion: { x: 0, y: 36, width: 100, height: 50 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 52, y: 47 }, subjectSafeRegion: { x: 0, y: 27, width: 100, height: 63 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 53, y: 46 }, subjectSafeRegion: { x: 0, y: 24, width: 100, height: 68 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'thu-rusk-cross': {
    altDescription: 'Crown counsel Asha Renn stands at the Crown table to cross-examine human-factors expert Tali Rusk, who remains in the witness box. The image conveys questioning only and no conclusion about intention, credibility or guilt.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 52, y: 50 }, subjectSafeRegion: { x: 0, y: 35, width: 100, height: 52 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 51, y: 49 }, subjectSafeRegion: { x: 0, y: 26, width: 100, height: 66 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 51, y: 48 }, subjectSafeRegion: { x: 0, y: 23, width: 100, height: 70 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'thu-quill-chief': {
    altDescription: 'Maintenance engineer Sera Quill gives evidence from the witness box while counsel and the accused listen. No warning document is visible, and the image does not suggest that the rescue craft was safe, unsafe or grounded.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 53, y: 49 }, subjectSafeRegion: { x: 0, y: 35, width: 100, height: 52 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 53, y: 47 }, subjectSafeRegion: { x: 0, y: 26, width: 100, height: 66 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 54, y: 46 }, subjectSafeRegion: { x: 0, y: 23, width: 100, height: 70 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'thu-quill-cross': {
    altDescription: 'Crown counsel Asha Renn questions maintenance engineer Sera Quill in the witness box. The image conveys no conclusion about craft safety, the warning or any delay.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 52, y: 50 }, subjectSafeRegion: { x: 0, y: 35, width: 100, height: 52 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 51, y: 48 }, subjectSafeRegion: { x: 0, y: 26, width: 100, height: 66 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 51, y: 47 }, subjectSafeRegion: { x: 0, y: 23, width: 100, height: 70 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'thu-defence-record': {
    altDescription: 'Judge Sel Aven gives a neutral procedural direction after the defence witnesses finish. The witness box is empty, counsel and the accused remain seated, and no inference from silence is depicted.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 51, y: 47 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 54 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 51, y: 45 }, subjectSafeRegion: { x: 0, y: 24, width: 100, height: 68 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 51, y: 43 }, subjectSafeRegion: { x: 0, y: 20, width: 100, height: 73 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'thu-def-close': {
    altDescription: 'Defence counsel Corin Dax stands at the defence table to state that the defence calls no further evidence. The accused remains seated, and no reaction or verdict inference is depicted.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 55, y: 49 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 55 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 55, y: 46 }, subjectSafeRegion: { x: 0, y: 24, width: 100, height: 69 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 56, y: 44 }, subjectSafeRegion: { x: 0, y: 20, width: 100, height: 74 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'thu-adjourn': {
    altDescription: 'The empty courtroom at blue hour after all evidence has closed. No exhibits, people or verdict cues remain on the quiet stage.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 47 }, subjectSafeRegion: null,
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 45 }, subjectSafeRegion: null,
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 43 }, subjectSafeRegion: null,
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'fri-legal-submissions': {
    altDescription: 'Jurors wait in a secure antechamber facing a closed courtroom door while two court officers stand nearby. Nothing occurring inside the courtroom is visible.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 56 }, subjectSafeRegion: { x: 0, y: 40, width: 100, height: 52 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 50 }, subjectSafeRegion: { x: 0, y: 32, width: 100, height: 60 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 49 }, subjectSafeRegion: { x: 0, y: 30, width: 100, height: 62 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'fri-crown-close': {
    altDescription: 'Crown counsel Asha Renn addresses the jury from the lectern while Judge Sel Aven and the defence listen without reaction. The image depicts advocacy, not evidence or a verdict.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 42, y: 51 }, subjectSafeRegion: { x: 0, y: 36, width: 100, height: 52 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 43, y: 48 }, subjectSafeRegion: { x: 0, y: 27, width: 100, height: 66 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 43, y: 46 }, subjectSafeRegion: { x: 0, y: 24, width: 100, height: 70 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'fri-defence-close': {
    altDescription: 'Defence counsel Corin Dax addresses the jury while Judge Sel Aven, Crown counsel and the accused listen without reaction. The image depicts advocacy, not evidence or a verdict.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 57, y: 50 }, subjectSafeRegion: { x: 0, y: 27, width: 100, height: 64 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 57, y: 47 }, subjectSafeRegion: { x: 0, y: 25, width: 100, height: 68 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 57, y: 45 }, subjectSafeRegion: { x: 0, y: 22, width: 100, height: 72 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'fri-burden': {
    altDescription: 'Judge Sel Aven gives final directions from the bench while Crown counsel, defence counsel and the accused listen without reaction. The image conveys no view about guilt or verdict.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 51 }, subjectSafeRegion: { x: 0, y: 32, width: 100, height: 55 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 47 }, subjectSafeRegion: { x: 0, y: 27, width: 100, height: 62 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 44 }, subjectSafeRegion: { x: 0, y: 25, width: 100, height: 67 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'fri-murder-trail': {
    altDescription: 'Judge Sel Aven gives the structured murder directions from the bench while Crown counsel, defence counsel and the accused listen without reaction. The image conveys no view about guilt or verdict.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 50 }, subjectSafeRegion: { x: 0, y: 31, width: 100, height: 57 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 47 }, subjectSafeRegion: { x: 0, y: 25, width: 100, height: 66 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 44 }, subjectSafeRegion: { x: 0, y: 23, width: 100, height: 69 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'fri-manslaughter-trail': {
    altDescription: 'Judge Sel Aven gives the structured alternative manslaughter directions from the bench while the accused and counsel listen without reaction. The image conveys no view about guilt or verdict.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 60 }, subjectSafeRegion: { x: 0, y: 53, width: 100, height: 32 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 57 }, subjectSafeRegion: { x: 0, y: 53, width: 100, height: 39 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: { x: 0, y: 35, width: 100, height: 46 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'fri-evidence-limits': {
    altDescription: 'From the juror desk, six closed admitted-exhibit sleeves, a blank notepad and headphones sit before the judge. No exhibit substance or verdict cue is visible.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 70 }, subjectSafeRegion: { x: 0, y: 45, width: 100, height: 45 },
        evidenceSafeRegion: { x: 0, y: 67, width: 100, height: 21 }, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 65 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 58 },
        evidenceSafeRegion: { x: 2, y: 62, width: 96, height: 28 }, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 61 }, subjectSafeRegion: { x: 0, y: 22, width: 100, height: 69 },
        evidenceSafeRegion: { x: 0, y: 58, width: 96, height: 32 }, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'sat-room': {
    altDescription: 'Exactly eleven other jurors sit around the deliberation table from the player\'s twelfth seat, with five on each side and the foreperson at the far end. No ballot is shown.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 61 }, subjectSafeRegion: { x: 0, y: 48, width: 100, height: 35 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 54 }, subjectSafeRegion: { x: 0, y: 32, width: 100, height: 61 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 57 }, subjectSafeRegion: { x: 0, y: 38, width: 100, height: 56 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'sat-concerns': {
    altDescription: 'Exactly eleven other jurors remain seated around the deliberation table as a woman on the left raises a concern calmly and the others listen. No faction, ballot or verdict is shown.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 25, y: 59 }, subjectSafeRegion: { x: 0, y: 48, width: 100, height: 35 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 25, y: 54 }, subjectSafeRegion: { x: 0, y: 32, width: 100, height: 61 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 24, y: 58 }, subjectSafeRegion: { x: 0, y: 38, width: 100, height: 56 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
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
