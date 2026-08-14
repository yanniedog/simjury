// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import { deriveEvidenceLedger } from '../engine/evidenceLedger'
import type { WeeklyProgress } from '../model/schema'
import { JurorDesk, MAX_PROGRESS_IMPORT_BYTES, type PreparedProgressImport } from './JurorDesk'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const sessions = elevenMinutesCourtWeek.manifest.sessions
const firstCue = sessions[0].scenes[0].cues[0]
const current: WeeklyProgress = {
  schemaVersion: 'court-week-progress-v1', courtWeekId: elevenMinutesCourtWeek.manifest.id,
  revision: elevenMinutesCourtWeek.manifest.revision, highestObservedTime: '2026-08-17T09:00:00+10:00',
  completedSessionIds: [], currentSessionId: sessions[0].id, currentSceneId: sessions[0].scenes[0].id,
  currentCueId: firstCue.id, notes: 'Keep this draft.', reasoningContributions: [], majorityDirectionReceived: false,
}
const imported: WeeklyProgress = {
  ...current, completedSessionIds: sessions.map(({ id }) => id), provisionalVote: 'not-guilty',
  secondVote: 'not-guilty', sealedVerdict: 'not-guilty', sealedAgreement: 'unanimous',
  notes: 'Transferred private note.', reasoningContributions: [{
    propositionId: 'prop-causation-window-doubt', sceneId: 'sat-causation',
    legalQuestion: 'Was survival excluded beyond reasonable doubt?', evidenceId: 'ex-survival',
    move: 'challenge-inference', recordedAt: '2026-08-15T11:00:00+10:00', influencePenalty: 0,
  }],
}
describe('JurorDesk progress import', () => {
  let host: HTMLDivElement
  let root: Root
  const onImport = vi.fn<(progress: WeeklyProgress) => void>()
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    onImport.mockReset()
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })
  const renderDesk = async (prepareImport: (text: string) => Promise<PreparedProgressImport>) => {
    await act(async () => root.render(<JurorDesk
      caseTitle="Eleven Minutes" trial={elevenMinutesCourtWeek.trial} sessions={sessions}
      deliberation={elevenMinutesCourtWeek.deliberation} progress={current}
      activeSessionId={sessions[0].id} activePhase="arrival" currentCueId={firstCue.id}
      evidenceLedger={deriveEvidenceLedger(elevenMinutesCourtWeek.trial, sessions, {
        cueId: firstCue.id, authoredCueComplete: false,
      })}
      saveStatus="Stored privately on this device." onNotesChange={() => undefined}
      prepareImport={prepareImport} onImport={onImport} onInspectEvidence={() => undefined} onClose={() => undefined}
    />))
  }
  const selectFile = async (file: File) => {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
  }
  it('rejects an oversized file before reading or preparing it', async () => {
    const prepareImport = vi.fn()
    const text = vi.fn()
    await renderDesk(prepareImport)
    await selectFile({ size: MAX_PROGRESS_IMPORT_BYTES + 1, text } as unknown as File)
    expect(text).not.toHaveBeenCalled()
    expect(prepareImport).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/1 MB or smaller/i)
    expect(host.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Keep this draft.')
  })
  it('previews without committing, preserves drafts on cancel, then imports only on confirm', async () => {
    const commit = vi.fn(async () => imported)
    const prepareImport = vi.fn(async () => ({ progress: imported, sessions, commit }))
    await renderDesk(prepareImport)
    act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
    const file = { size: 100, text: vi.fn(async () => '{}') } as unknown as File
    await selectFile(file)
    expect(host.textContent).toContain('Review imported progress')
    expect(host.textContent).toContain('Eleven Minutes (cw-0001)')
    expect(host.textContent).toContain(imported.revision)
    expect(host.textContent).toContain('Court Week complete')
    expect(host.textContent).toContain('Provisional: Not Guilty; Second: Not Guilty')
    expect(host.textContent).toContain('Not Guilty - unanimous')
    expect(host.textContent).toContain('1 saved')
    expect(host.textContent).toContain('Private notesIncluded')
    expect(document.activeElement).toBe(host.querySelector('#cw-import-preview-heading'))
    expect(commit).not.toHaveBeenCalled()
    expect(onImport).not.toHaveBeenCalled()
    act(() => Array.from(host.querySelectorAll('button')).find(({ textContent }) => textContent === 'Cancel import')?.click())
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)))
    expect(host.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Keep this draft.')
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true)
    expect(document.activeElement?.textContent).toBe('Import progress')
    expect(commit).not.toHaveBeenCalled()
    await selectFile(file)
    await act(async () => Array.from(host.querySelectorAll('button')).find(
      ({ textContent }) => textContent === 'Confirm import',
    )?.click())
    await vi.waitFor(() => expect(onImport).toHaveBeenCalledWith(imported))
    expect(commit).toHaveBeenCalledOnce()
  })
  it('keeps current notes and transfer options when preparation fails', async () => {
    await renderDesk(vi.fn(async () => { throw new Error('The candidate could not be hydrated.') }))
    act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
    await selectFile({ size: 100, text: vi.fn(async () => '{bad') } as unknown as File)
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not be hydrated')
    expect(host.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Keep this draft.')
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true)
    expect(onImport).not.toHaveBeenCalled()
  })
})
