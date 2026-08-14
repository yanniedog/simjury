import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import type { CourtSession, Scene, SceneCue } from '../../../src/courtweek/model/schema'
import { ImmersiveCourtShell } from '../../../src/courtweek/ui/ImmersiveCourtShell'
import '../../../src/courtweek/courtweek.css'

const cue: SceneCue = {
  id: 'cue-1', event: 'witness-chief', speaker: 'Witness', text: 'Evidence.',
  accessibleProposition: 'The witness gives evidence.', tone: 'chief', evidenceIds: [], replayable: false,
}
const scene: Scene = {
  id: 'scene-1', title: 'Evidence', phase: 'crown-case', transitionSeconds: 3, cues: [cue],
  visual: {
    fallbackId: 'witness', alt: 'Witness in court.', focalPoint: { x: 50, y: 50 }, captionPosition: 'top',
    sources: {
      portrait: { avif: 'scenes/mon-arrival/portrait.avif', webp: 'scenes/mon-arrival/portrait.webp' },
      tablet: { avif: 'scenes/mon-arrival/tablet.avif', webp: 'scenes/mon-arrival/tablet.webp' },
      desktop: { avif: 'scenes/mon-arrival/desktop.avif', webp: 'scenes/mon-arrival/desktop.webp' },
    },
    compositionArt: {
      portrait: {
        focalPoint: { x: 56, y: 53 }, subjectSafeRegion: null, evidenceSafeRegion: null,
        permittedCaptionPositions: ['top'], reviewStatus: 'crop-reviewed',
      },
      tablet: {
        focalPoint: { x: 82, y: 46 }, subjectSafeRegion: null, evidenceSafeRegion: null,
        permittedCaptionPositions: ['top'], reviewStatus: 'crop-reviewed',
      },
      desktop: {
        focalPoint: { x: 78, y: 46 }, subjectSafeRegion: null, evidenceSafeRegion: null,
        permittedCaptionPositions: ['top'], reviewStatus: 'crop-reviewed',
      },
    },
  },
}
const session: CourtSession = {
  id: 'monday', ordinal: 1, day: 'Monday', title: 'Evidence', unlockAt: '2026-08-10T08:30:00+10:00',
  targetMinutes: 20, prerequisiteSessionIds: [], scenes: [scene, scene, scene],
}

export function Fixture() {
  useEffect(() => {
    const mounts = Number(document.documentElement.dataset.fixtureMounts ?? '0') + 1
    document.documentElement.dataset.fixtureMounts = String(mounts)
  }, [])
  return <ImmersiveCourtShell
    session={session} scene={scene} cue={cue} releaseBase="/media/court-week/cw-0001"
    accessMode="captions" playbackStatus="paused" playbackError={null}
    progressLabel="Scene 1 of 3" deskOpen={false}
    onPlay={() => undefined} onPause={() => undefined} onRepeat={() => undefined}
    onAdvance={() => undefined} onMode={() => undefined} onToggleDesk={() => undefined}
    onOpenTestSession={() => undefined}
  />
}

createRoot(document.getElementById('root')!).render(<Fixture />)
