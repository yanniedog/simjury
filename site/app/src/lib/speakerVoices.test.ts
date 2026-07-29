import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  assignDeviceVoiceIndexes,
  buildSpeakerVoicePlan,
  deviceVoiceGender,
  genderForCastName,
  genderForJuror,
  voiceParamsForGender,
} from './speakerVoices'

const docketDir = join(dirname(fileURLToPath(import.meta.url)), '../../docket')

describe('speaker gender map', () => {
  it('covers every cast name in the published docket', () => {
    const missing: string[] = []
    for (const file of readdirSync(docketDir).filter((f) => /^dd-/.test(f) && f.endsWith('.json'))) {
      const docket = JSON.parse(readFileSync(join(docketDir, file), 'utf8')) as {
        cast: Array<{ id: string; name: string }>
      }
      for (const member of docket.cast) {
        const gender = genderForCastName(member.name, member.id)
        // genderForCastName always returns a value; assert known names aren't hash-fallback only
        // by requiring the JSON map hit for authored dockets.
        const map = JSON.parse(
          readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'castGenders.json'), 'utf8'),
        ) as Record<string, string>
        if (!map[member.name]) missing.push(`${file}: ${member.name}`)
        expect(['female', 'male']).toContain(gender)
      }
    }
    expect(missing).toEqual([])
  })

  it('matches known gendered cast names', () => {
    expect(genderForCastName('Dana Reyes', 'w5')).toBe('female')
    expect(genderForCastName('Theo Marchetti', 'dc')).toBe('male')
    expect(genderForCastName('Judge Ilsa Renner', 'judge')).toBe('female')
    expect(genderForCastName('Judge Corven', 'judge')).toBe('male')
  })
})

describe('juror gender cues', () => {
  it('reads self-referential pronouns from personas', () => {
    expect(genderForJuror('Came in certain; the platform report is working on him.', 'J-07')).toBe(
      'male',
    )
    expect(
      genderForJuror('Quiet doubter; nine drinks buys very little belief from her.', 'J-08'),
    ).toBe('female')
  })

  it('prefers authored gender over persona inference and id hash', () => {
    expect(genderForJuror('Practical.', 'J-01', 'female')).toBe('female')
    expect(genderForJuror('Practical.', 'J-01', 'male')).toBe('male')
  })

  it('assigns published docket jurors the portrait-matching authored gender', () => {
    const expected: Record<string, 'female' | 'male'> = {
      'J-01': 'female',
      'J-02': 'male',
      'J-03': 'female',
      'J-04': 'male',
      'J-05': 'female',
      'J-06': 'female',
      'J-07': 'male',
      'J-08': 'male',
      'J-09': 'female',
      'J-10': 'male',
      'J-11': 'female',
    }
    for (const file of readdirSync(docketDir).filter((f) => /^dd-/.test(f) && f.endsWith('.json'))) {
      const docket = JSON.parse(readFileSync(join(docketDir, file), 'utf8')) as {
        jury: { jurors: Array<{ id: string; persona: string; gender?: 'female' | 'male' }> }
      }
      for (const juror of docket.jury.jurors) {
        expect(juror.gender, `${file} ${juror.id}`).toBe(expected[juror.id])
        expect(genderForJuror(juror.persona, juror.id, juror.gender)).toBe(expected[juror.id])
      }
    }
  })
})

describe('device voice planning', () => {
  it('gives the judge gravitas pitch and keeps genders on matching device voices', () => {
    expect(voiceParamsForGender('judge', 'male').pitch).toBeLessThan(0.9)
    expect(voiceParamsForGender('judge', 'male').rate).toBeLessThan(0.95)

    const plan = buildSpeakerVoicePlan({
      cast: [
        { id: 'judge', name: 'Judge Corven' },
        { id: 'pc', name: 'Asha Verlaine' },
        { id: 'dc', name: 'Theo Marchetti' },
        { id: 'w5', name: 'Dana Reyes' },
      ],
      jurors: [{ id: 'J-01', persona: 'Practical.' }],
    })
    expect(plan.genderByKey.get('pc')).toBe('female')
    expect(plan.genderByKey.get('dc')).toBe('male')
    expect(plan.genderByKey.get('w5')).toBe('female')

    const voices = [
      { name: 'Microsoft Zira' },
      { name: 'Microsoft David' },
      { name: 'Google UK English Female' },
      { name: 'Google UK English Male' },
      { name: 'Samantha' },
      { name: 'Alex' },
    ]
    const indexes = assignDeviceVoiceIndexes(plan, voices)
    expect(deviceVoiceGender(voices[indexes.get('pc')!].name)).toBe('female')
    expect(deviceVoiceGender(voices[indexes.get('dc')!].name)).toBe('male')
    expect(deviceVoiceGender(voices[indexes.get('w5')!].name)).toBe('female')
    expect(deviceVoiceGender(voices[indexes.get('judge')!].name)).toBe('male')
    // With enough gendered voices, every speaker stays on a distinct index.
    const used = [...indexes.values()]
    expect(new Set(used).size).toBe(used.length)
  })
})
