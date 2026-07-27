import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const scriptsDir = join(import.meta.dirname, '../../../scripts')
const docketDir = join(import.meta.dirname, '../../docket')

describe('Kokoro voice jobs', () => {
  it('assigns gender-correct voices and builds without collisions', () => {
    const out = mkdtempSync(join(tmpdir(), 'kokoro-jobs-'))
    try {
      execFileSync(
        process.execPath,
        [join(scriptsDir, 'build-kokoro-jobs.mjs'), '--case', 'all', '--output', out],
        { stdio: 'pipe' },
      )

      for (const file of readdirSync(docketDir).filter((f) => /^dd-/.test(f) && f.endsWith('.json'))) {
        const caseId = file.replace(/\.json$/, '')
        const docket = JSON.parse(readFileSync(join(docketDir, file), 'utf8')) as {
          cast: Array<{ id: string; name: string }>
        }
        const job = JSON.parse(readFileSync(join(out, `${caseId}.json`), 'utf8')) as {
          clips: Array<{ speaker: string; voice: string; gender?: string }>
        }
        const bySpeaker = new Map<string, string>()
        for (const clip of job.clips) {
          const prior = bySpeaker.get(clip.speaker)
          if (prior) expect(prior).toBe(clip.voice)
          else bySpeaker.set(clip.speaker, clip.voice)
        }

        expect(bySpeaker.get('narrator')).toBe('af_heart')

        const genders = JSON.parse(
          readFileSync(join(import.meta.dirname, 'castGenders.json'), 'utf8'),
        ) as Record<string, 'female' | 'male'>
        for (const member of docket.cast) {
          const voice = bySpeaker.get(member.id)
          if (!voice) continue // cast member with no spoken lines in this case
          const gender = genders[member.name]
          expect(gender, member.name).toBeTruthy()
          if (member.id === 'judge') {
            expect(voice).toBe(gender === 'female' ? 'bf_emma' : 'bm_george')
          } else if (gender === 'female') {
            expect(voice).toMatch(/^af_|^bf_/)
          } else {
            expect(voice).toMatch(/^am_|^bm_/)
          }
        }
      }
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  })
})
