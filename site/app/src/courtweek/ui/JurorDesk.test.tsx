import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../content/elevenMinutes'
import { deriveEvidenceLedger } from '../engine/evidenceLedger'
import type { LegalPhase, WeeklyProgress } from '../model/schema'
import { formatCourtUnlock } from '../state/schedule'
import { JurorDesk } from './JurorDesk'

const { manifest, trial, deliberation } = elevenMinutesCourtWeek

function renderDesk(
  cueId: string,
  authoredCueComplete: boolean,
  activeSessionId: string,
  activePhase: LegalPhase,
  patch: Partial<WeeklyProgress> = {},
) {
  const progress: WeeklyProgress = {
    schemaVersion: 'court-week-progress-v1', courtWeekId: 'cw-0001', revision: manifest.revision,
    highestObservedTime: '2026-08-15T10:00:00+10:00', completedSessionIds: [],
    currentSessionId: activeSessionId, currentCueId: cueId, notes: '', ...patch,
  }
  return renderToStaticMarkup(<JurorDesk
    caseTitle="Eleven Minutes"
    trial={{ ...trial, objections: [] }}
    sessions={manifest.sessions}
    deliberation={deliberation}
    progress={progress}
    activeSessionId={activeSessionId}
    activePhase={activePhase}
    currentCueId={cueId}
    currentCueComplete={authoredCueComplete}
    evidenceLedger={deriveEvidenceLedger(trial, manifest.sessions, { cueId, authoredCueComplete })}
    saveStatus="Stored privately on this device."
    progressTransferEnabled={false}
    onNotesChange={() => undefined}
    onImport={() => undefined}
    onInspectEvidence={() => undefined}
    onClose={() => undefined}
  />)
}

describe('JurorDesk legal memory', () => {
  it('shows a provisional exhibit with limits but no inspection or future evidence', () => {
    const markup = renderDesk(
      'tue-recording-play', true, 'cw-0001-tuesday', 'crown-case',
      { completedSessionIds: ['cw-0001-monday'] },
    )

    expect(markup).toContain('Distress recording')
    expect(markup).toContain('Provisional')
    expect(markup).toContain('Inspection and replay remain unavailable until final admission.')
    expect(markup).toContain('Audio quality may affect interpretation')
    expect(markup).not.toMatch(/<button[^>]*>Distress recording<\/button>/u)
    expect(markup).not.toContain('Yellow launch strip')
    expect(markup).not.toContain('Lumen to Reach control')
  })

  it('presents the full working-paper contract without exposing struck content or raw move ids', () => {
    const markup = renderDesk(
      'wed-postanswer-ruling', true, 'cw-0001-wednesday', 'crown-case', {
        completedSessionIds: ['cw-0001-monday', 'cw-0001-tuesday'],
        notes: 'Compare the warning with the READY display.',
        reasoningContributions: [{
          propositionId: 'prop-duty-priority-doubt', sceneId: 'sat-concerns',
          legalQuestion: 'Was the dispatch hold a reasonable safety prioritisation?',
          evidenceId: 'ex-warning', move: 'challenge-inference',
          recordedAt: '2026-08-15T10:01:00+10:00', influencePenalty: 0,
        }],
      },
    )

    for (const { day } of manifest.sessions) expect(markup).toContain(day)
    expect(markup).not.toContain('The verdict')
    expect(markup).toContain(`Opens ${formatCourtUnlock(manifest.sessions[3].unlockAt)}`)
    expect(markup).toContain('Current phase:</strong> Crown case')
    expect(markup).toContain('Section 41 duty')
    expect(markup).toContain('Were reasonable dispatch steps available?')
    expect(markup).toContain('A pre-answer defence relevance objection is overruled')
    expect(markup).toContain('Resentment is not criminal character evidence')
    expect(markup.match(/The volunteered rumour is struck and must be entirely disregarded/gu)).toHaveLength(1)
    expect(markup).toContain('Struck — do not use.')
    expect(markup).not.toContain('Struck workplace rumour')
    expect(markup).toContain('Final admission')
    expect(markup).toContain('Not proof of visibility, sea state or survival time')
    expect(markup).toContain('Challenge an inference')
    expect(markup).not.toContain('challenge-inference')
    expect(markup).toContain('Stored privately on this device.')
    expect(markup).toContain('Oral evidence is not stored as a searchable transcript.')
  })
})
