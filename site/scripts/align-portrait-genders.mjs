/**
 * Surgical portrait-gender alignment without reformatting case JSON.
 * Run from repo root: node site/scripts/align-portrait-genders.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const docketDir = join(root, 'app', 'docket')

const PORTRAIT_GENDER = {
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

/** caseId → { jurorId → newShortName } for names that conflict with portraits. */
const RENAMES = {
  'dd-intro': { 'J-08': 'Hale', 'J-09': 'Iri', 'J-10': 'Joss', 'J-11': 'Kemi' },
  'dd-0006': { 'J-05': 'Esra', 'J-08': 'Hale', 'J-09': 'Iri', 'J-10': 'Joss', 'J-11': 'Kemi' },
  'dd-0017': { 'J-01': 'Nia', 'J-04': 'Bren', 'J-07': 'Dane', 'J-08': 'Rami' },
  'dd-0032': { 'J-03': 'Ina', 'J-04': 'Suren', 'J-05': 'Cara', 'J-07': 'Ned' },
  'dd-0037': { 'J-02': 'Maro', 'J-03': 'Dara', 'J-08': 'Noel', 'J-09': 'Ina', 'J-11': 'Sora' },
  'dd-0038': {},
  'dd-0039': { 'J-05': 'Esra', 'J-08': 'Hale', 'J-09': 'Iri', 'J-10': 'Joss', 'J-11': 'Kemi' },
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function shortNameFromLabel(label) {
  const trimmed = String(label).replace(/\s*·\s*foreperson\s*$/i, '').trim()
  const em = trimmed.match(/—\s*(.+)$/)
  return em ? em[1].trim() : trimmed
}

function rewriteLabel(label, newName) {
  if (/—/.test(label)) return label.replace(/—\s*.+$/, `— ${newName}`)
  if (/·\s*foreperson/i.test(label)) return `${newName} · foreperson`
  return newName
}

function upsertGender(raw, jurorId, gender) {
  const idPat = new RegExp(`("id"\\s*:\\s*"${escapeRe(jurorId)}"\\s*,)`)
  const m = idPat.exec(raw)
  if (!m) throw new Error(`missing juror ${jurorId}`)
  const afterId = m.index + m[0].length
  const next = raw.slice(afterId, afterId + 80)
  const existing = /^\s*"gender"\s*:\s*"(female|male)"\s*,/.exec(next)
  if (existing) {
    return (
      raw.slice(0, afterId) +
      next.replace(existing[0], ` "gender": "${gender}",`) +
      raw.slice(afterId + next.length)
    )
  }
  return raw.slice(0, afterId) + ` "gender": "${gender}",` + raw.slice(afterId)
}

function replaceExact(raw, from, to, label) {
  if (!raw.includes(from)) {
    throw new Error(`missing ${label}: ${from.slice(0, 80)}`)
  }
  return raw.split(from).join(to)
}

function alignFile(file) {
  const caseId = file.replace(/\.json$/, '')
  const path = join(docketDir, file)
  let raw = readFileSync(path, 'utf8')
  const data = JSON.parse(raw)
  const renames = RENAMES[caseId] ?? {}
  const original = raw

  for (const juror of data.jury.jurors) {
    const oldName = shortNameFromLabel(juror.label)
    const newName = renames[juror.id]
    if (!newName || newName === oldName) continue

    const newLabel = rewriteLabel(juror.label, newName)
    raw = replaceExact(raw, `"label": "${juror.label}"`, `"label": "${newLabel}"`, `${juror.id} label`)

    if (juror.persona.includes(oldName)) {
      const newPersona = juror.persona.replace(new RegExp(`\\b${escapeRe(oldName)}\\b`, 'g'), newName)
      raw = replaceExact(
        raw,
        `"persona": "${juror.persona}"`,
        `"persona": "${newPersona}"`,
        `${juror.id} persona`,
      )
    }

    const altNeedle = `"${juror.id}":`
    const altIdx = raw.indexOf(altNeedle)
    if (altIdx >= 0) {
      const sliceEnd = raw.indexOf('\n', raw.indexOf('kind', altIdx)) + 1
      const chunk = raw.slice(altIdx, sliceEnd > altIdx ? sliceEnd + 80 : altIdx + 400)
      if (chunk.includes(oldName)) {
        const updated = chunk.replace(new RegExp(`\\b${escapeRe(oldName)}\\b`, 'g'), newName)
        raw = raw.slice(0, altIdx) + updated + raw.slice(altIdx + chunk.length)
      }
    }
  }

  if (/"id": "J-10"[\s\S]*?"persona": "[^"]*\bcorrects her own\b/.test(raw)) {
    raw = raw.replace(
      /("id": "J-10"[\s\S]*?"persona": "[^"]*)\bcorrects her own\b/,
      '$1corrects his own',
    )
  }

  for (const [id, gender] of Object.entries(PORTRAIT_GENDER)) {
    raw = upsertGender(raw, id, gender)
  }

  if (caseId === 'dd-0032') {
    raw = fixSavaMerinRaw(raw)
  }

  if (raw === original) {
    console.log(`unchanged ${file}`)
    return
  }

  const parsed = JSON.parse(raw)
  for (const juror of parsed.jury.jurors) {
    if (juror.gender !== PORTRAIT_GENDER[juror.id]) {
      throw new Error(`${file} ${juror.id} gender=${juror.gender}`)
    }
    const expected = renames[juror.id]
    if (expected && !juror.label.includes(expected)) {
      throw new Error(`${file} ${juror.id} label missing ${expected}: ${juror.label}`)
    }
  }
  writeFileSync(path, raw, 'utf8')
  console.log(`updated ${file}`)
}

function fixSavaMerinRaw(raw) {
  const pairs = [
    ['Her stock was taken', 'His stock was taken'],
    ['did to her business and partner', 'did to his business and partner'],
    ['Celis does not dispute her experience', 'Celis does not dispute his experience'],
    ['why she approached Celis', 'why he approached Celis'],
    ['but she cannot identify who directed them', 'but he cannot identify who directed them'],
    ['until she accepted the Circle rate', 'until he accepted the Circle rate'],
    ['What did Sava ask when she called you?', 'What did Sava ask when he called you?'],
    [
      'She was frightened and wanted the collectors stopped. I said I’d hold disputed money while I checked every invoice. That’s ordinary mediation, and it had helped her before.',
      'He was frightened and wanted the collectors stopped. I said I’d hold disputed money while I checked every invoice. That’s ordinary mediation, and it had helped him before.',
    ],
    ['Did you order anyone to seize her stock?', 'Did you order anyone to seize his stock?'],
    [
      'Sava told you the Circle was demanding protection money, didn’t she?',
      'Sava told you the Circle was demanding protection money, didn’t he?',
    ],
    [
      'She used those words. I told her I’d stop contact and check whether any debt was real.',
      'He used those words. I told him I’d stop contact and check whether any debt was real.',
    ],
    ['Sava and her partner', 'Sava and his partner'],
  ]
  let out = raw
  for (const [from, to] of pairs) {
    if (!out.includes(from)) {
      console.warn(`  warn: Sava phrase not found: ${from.slice(0, 70)}`)
      continue
    }
    out = out.split(from).join(to)
  }
  return out
}

for (const file of readdirSync(docketDir).filter((f) => /^dd-.*\.json$/.test(f)).sort()) {
  alignFile(file)
}
