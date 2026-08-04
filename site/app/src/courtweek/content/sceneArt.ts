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
  reviewStatus: 'crop-reviewed'
}

export interface CommissionedSceneArt {
  altDescription: string
  compositionArt: Record<Composition, CompositionArtDirection>
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
    altDescription: 'From the jury side before evidence, Judge Sel Aven sits at the central bench while counsel and Mara Venn occupy their respective sides of the courtroom. No challenge, plea, allegation or view about guilt is depicted.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 44 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 51 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 38 }, subjectSafeRegion: { x: 0, y: 30, width: 100, height: 51 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 38 }, subjectSafeRegion: { x: 0, y: 30, width: 100, height: 50 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'mon-oath': {
    altDescription: 'From the jury side before evidence, the courtroom faces the jury and Judge Sel Aven presides from the central bench. Neither oath nor affirmation is visually preferred, and no juror choice is identified.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: { x: 0, y: 37, width: 100, height: 49 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 43 }, subjectSafeRegion: { x: 0, y: 27, width: 100, height: 53 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 45 }, subjectSafeRegion: { x: 0, y: 33, width: 100, height: 62 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'mon-crown-opening': {
    altDescription: 'Crown counsel Asha Renn addresses the jury from viewer left while Judge Sel Aven presides and Corin Dax and Mara Venn remain on the defence side. Nothing visible adopts the allegation or expresses guilt.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 26, y: 46 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 47 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 28, y: 48 }, subjectSafeRegion: { x: 0, y: 29, width: 100, height: 57 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 24, y: 48 }, subjectSafeRegion: { x: 0, y: 30, width: 100, height: 52 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'mon-orr-chief': {
    altDescription: 'Nella Orr sits in the viewer-right witness box while Crown counsel Asha Renn questions from viewer left and Judge Sel Aven presides. The route diagram and its contents are not visible.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 56, y: 53 }, subjectSafeRegion: { x: 0, y: 29, width: 100, height: 66 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 82, y: 46 }, subjectSafeRegion: { x: 0, y: 30, width: 100, height: 60 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 78, y: 46 }, subjectSafeRegion: { x: 0, y: 32, width: 100, height: 64 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'mon-orr-cross': {
    altDescription: 'Nella Orr remains in the viewer-right witness box while defence counsel Corin Dax stands to cross-examine and Judge Sel Aven presides. No proposition about duty, readiness or belief is resolved visually.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 56, y: 52 }, subjectSafeRegion: { x: 0, y: 29, width: 100, height: 66 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 55, y: 48 }, subjectSafeRegion: { x: 0, y: 30, width: 100, height: 60 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 64, y: 48 }, subjectSafeRegion: { x: 0, y: 17, width: 100, height: 80 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'mon-elements': {
    altDescription: 'Judge Sel Aven addresses the jury from the central bench after Orr’s evidence; counsel and other courtroom participants remain visible, but no element, inference or verdict is depicted as answered.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 42 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 51 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 38 }, subjectSafeRegion: { x: 0, y: 27, width: 100, height: 68 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 40 }, subjectSafeRegion: { x: 0, y: 32, width: 100, height: 64 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'mon-adjourn': {
    altDescription: 'The courtroom is empty after adjournment; the central bench, viewer-right witness box and counsel furniture remain, with no route information or other evidence legible.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 42 }, subjectSafeRegion: null,
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 44 }, subjectSafeRegion: null,
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 42 }, subjectSafeRegion: null,
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'tue-resume': {
    altDescription: 'Juror-seat view of Tuesday court resuming, with the judge addressing the jury, counsel and the accused seated neutrally, and the witness box empty.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 48 }, subjectSafeRegion: { x: 0, y: 37, width: 100, height: 49 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 47 }, subjectSafeRegion: { x: 0, y: 33, width: 100, height: 53 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 47 }, subjectSafeRegion: { x: 0, y: 31, width: 100, height: 59 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'tue-dorn-chief': {
    altDescription: 'Junior dispatcher Peli Dorn gives evidence from the witness box while Crown counsel questions her; no distress words, console status or inference about intent is depicted.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 52, y: 49 }, subjectSafeRegion: { x: 0, y: 36, width: 100, height: 50 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 52, y: 47 }, subjectSafeRegion: { x: 0, y: 28, width: 100, height: 59 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 52, y: 46 }, subjectSafeRegion: { x: 0, y: 28, width: 100, height: 64 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
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
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 53, y: 48 }, subjectSafeRegion: { x: 6, y: 25, width: 94, height: 43 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 52, y: 46 }, subjectSafeRegion: { x: 12, y: 22, width: 80, height: 45 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 57, y: 44 }, subjectSafeRegion: { x: 28, y: 9, width: 58, height: 59 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
      }),
    },
  },
  'tue-dorn-re': {
    altDescription: 'Crown counsel asks Peli Dorn a confined clarifying question after cross-examination; no competing incident, inference or enhancement of her evidence is depicted.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 52, y: 49 }, subjectSafeRegion: { x: 0, y: 36, width: 100, height: 50 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 52, y: 47 }, subjectSafeRegion: { x: 0, y: 28, width: 100, height: 59 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 52, y: 46 }, subjectSafeRegion: { x: 0, y: 27, width: 100, height: 65 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'tue-mir-chief': {
    altDescription: 'Records custodian Tovan Mir gives evidence from the witness box while Crown counsel questions him; no audit-log content, launch-strip words, time or state of mind is depicted.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 52, y: 49 }, subjectSafeRegion: { x: 0, y: 36, width: 100, height: 50 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 52, y: 47 }, subjectSafeRegion: { x: 0, y: 28, width: 100, height: 59 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 52, y: 46 }, subjectSafeRegion: { x: 0, y: 28, width: 100, height: 64 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'tue-mir-cross': {
    altDescription: 'Defence counsel questions records custodian Tovan Mir while he remains composed in the witness box. No log is depicted as infallible, worthless or proof of state of mind.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 53, y: 48 }, subjectSafeRegion: { x: 7, y: 26, width: 93, height: 42 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 52, y: 46 }, subjectSafeRegion: { x: 12, y: 22, width: 80, height: 45 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 62, y: 43 }, subjectSafeRegion: { x: 37, y: 17, width: 49, height: 51 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['bottom'],
      }),
    },
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
  'fri-retire': {
    altDescription: 'From the juror side, Judge Sel Aven faces the jury while a plain-clothed court officer waits beside the closed door. Crown counsel remains left; defence counsel and the accused remain right. No verdict is shown.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 50 }, subjectSafeRegion: { x: 0, y: 42, width: 100, height: 42 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 47 }, subjectSafeRegion: { x: 0, y: 35, width: 100, height: 55 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 45 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 56 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
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
  'sat-provisional': {
    altDescription: 'Exactly eleven other jurors each shield one private face-down blank ballot card with a plain folder around the deliberation table, while the player\'s matching blank card lies in the foreground. No individual position, aggregate count, faction or verdict cue is visible.',
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
  'sun-final-ballot': {
    altDescription: 'Exactly eleven other jurors each shield one private face-down blank ballot card with a plain folder around the deliberation table, while the player\'s matching blank final ballot card lies in the foreground. No individual position, aggregate count, faction, outcome or verdict cue is visible.',
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
  'sat-first-ballot': {
    altDescription: 'Exactly eleven other jurors look toward a blank room display from the player\'s twelfth seat while the anonymous aggregate appears only in the live interface. No seat-level position is visible.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 58 }, subjectSafeRegion: { x: 0, y: 47, width: 100, height: 37 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 53 }, subjectSafeRegion: { x: 0, y: 31, width: 100, height: 62 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 57 }, subjectSafeRegion: { x: 0, y: 38, width: 100, height: 56 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'sat-causation': {
    altDescription: 'Exactly eleven other jurors remain around the deliberation table during an evidence-first causation discussion. One juror uses a small open-hand gesture while the foreperson and others consider the point; no readable evidence, ballot, faction, verdict or conclusion is shown.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 31, y: 59 }, subjectSafeRegion: { x: 0, y: 45, width: 100, height: 40 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 32, y: 52 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 58 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 31, y: 58 }, subjectSafeRegion: { x: 0, y: 38, width: 100, height: 56 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'sat-improper': {
    altDescription: 'Exactly eleven other jurors remain around the deliberation table as Edda raises an open hand and one juror clears the blank room display. No forbidden allegation, evidence, ballot, count, faction or verdict is visible.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 59 }, subjectSafeRegion: { x: 0, y: 47, width: 100, height: 38 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 54 }, subjectSafeRegion: { x: 0, y: 31, width: 100, height: 62 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 57 }, subjectSafeRegion: { x: 0, y: 38, width: 100, height: 56 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'sun-resume': {
    altDescription: 'Exactly eleven other jurors resume deliberations around the table from the player\'s twelfth seat in Sunday morning light. No ballot, evidence, faction, verdict or conclusion is shown.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 61 }, subjectSafeRegion: { x: 0, y: 44, width: 100, height: 36 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 54 }, subjectSafeRegion: { x: 0, y: 23, width: 100, height: 54 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 57 }, subjectSafeRegion: { x: 0, y: 38, width: 100, height: 56 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'sat-separate': {
    altDescription: 'From the juror side, Judge Sel Aven gives the overnight separation direction while a plain-clothed court officer waits beside the closed door. Crown counsel remains left; defence counsel and the accused remain right. No departure, outside research, saved state, ballot count, legal text or verdict is shown.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 50 }, subjectSafeRegion: { x: 0, y: 42, width: 100, height: 42 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 47 }, subjectSafeRegion: { x: 0, y: 35, width: 100, height: 55 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 45 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 56 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'sun-second-ballot': {
    altDescription: 'Exactly eleven other jurors each shield a second private face-down blank ballot card with a plain folder around the deliberation table, while the player\'s matching second blank card lies in the foreground. No individual choice, count, aggregate, faction, verdict, label or readable card is visible.',
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
  'sun-majority': {
    altDescription: 'From the juror side, Judge Sel Aven addresses the room from the bench while Crown counsel remains left, defence counsel and the accused remain right, and a plain-clothed officer waits by the closed door. The numerical rule and later jury-room discussion appear only in audio and the live interface; no threshold, pressure gesture, lone juror, count, faction, verdict or outcome is visible.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 50 }, subjectSafeRegion: { x: 0, y: 42, width: 100, height: 42 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 47 }, subjectSafeRegion: { x: 0, y: 35, width: 100, height: 55 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 45 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 56 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'sun-persevere': {
    altDescription: 'From the juror side, Judge Sel Aven neutrally asks the jury to make one further honest effort while a plain-clothed court officer waits beside the closed door. Crown counsel remains left; defence counsel and the accused remain right. The image does not pressure any juror or show a count, faction, verdict or outcome; the later jury-room reasoning appears only in audio and the live interface.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 50 }, subjectSafeRegion: { x: 0, y: 42, width: 100, height: 42 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 47 }, subjectSafeRegion: { x: 0, y: 35, width: 100, height: 55 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 45 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 56 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'sat-note': {
    altDescription: 'A folded face-down unmarked jury note rests on a plain court-clerk tray in the foreground while Judge Sel Aven, Crown counsel, defence counsel and the accused remain neutral behind it. No writing, ballot number, juror identity, position or verdict is visible.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 80 }, subjectSafeRegion: { x: 0, y: 40, width: 100, height: 48 },
        evidenceSafeRegion: { x: 33, y: 76, width: 38, height: 11 }, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 57 }, subjectSafeRegion: { x: 0, y: 24, width: 100, height: 54 },
        evidenceSafeRegion: { x: 38, y: 51, width: 24, height: 12 }, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 61 }, subjectSafeRegion: { x: 0, y: 17, width: 100, height: 73 },
        evidenceSafeRegion: { x: 34, y: 56, width: 32, height: 12 }, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'sun-negligence': {
    altDescription: 'Exactly eleven other jurors remain around the deliberation table as one juror uses separated open hands to distinguish two legal questions. No spectrum, midpoint, ballot, count, faction, verdict or conclusion is shown.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 31, y: 59 }, subjectSafeRegion: { x: 0, y: 45, width: 100, height: 40 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 32, y: 53 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 58 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 31, y: 58 }, subjectSafeRegion: { x: 0, y: 38, width: 100, height: 56 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'sun-analysis': {
    altDescription: 'The empty courtroom is seen from the juror side with the bench centered and the closed door beyond. No verdict, count or preferred analysis is shown; the two lawful readings appear only in the live interface.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 55 }, subjectSafeRegion: null,
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 50 }, subjectSafeRegion: null,
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 50 }, subjectSafeRegion: null,
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
    },
  },
  'sun-verdict': {
    altDescription: 'From the jury side, Judge Sel Aven faces the room. Crown counsel Asha Renn sits at viewer left; defence counsel Corin Dax sits beside the standing accused, Mara Venn, at viewer right, and a plain-clothed officer waits by the closed door. No verdict, count, restraint, reaction, guilt cue or analysis is shown.',
    compositionArt: {
      portrait: cropReviewedDirection({
        focalPoint: { x: 50, y: 54 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 49 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      tablet: cropReviewedDirection({
        focalPoint: { x: 50, y: 49 }, subjectSafeRegion: { x: 0, y: 33, width: 100, height: 56 },
        evidenceSafeRegion: null, permittedCaptionPositions: ['top'],
      }),
      desktop: cropReviewedDirection({
        focalPoint: { x: 50, y: 52 }, subjectSafeRegion: { x: 0, y: 34, width: 100, height: 56 },
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
