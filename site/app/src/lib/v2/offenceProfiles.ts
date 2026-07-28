export const OFFENCE_CODES = [
  'murder',
  'hostage_taking',
  'treason',
  'large_scale_drug_manufacturing',
  'directing_organised_crime_syndicate',
  'terrorist_assassination_attempt',
  'murder_police_officer_on_duty',
] as const

export type OffenceCode = (typeof OFFENCE_CODES)[number]

export const CONTENT_ADVISORIES = [
  'death',
  'serious_violence',
  'terrorism',
  'captivity',
  'organised_crime',
  'drug_harm',
] as const

export type ContentAdvisory = (typeof CONTENT_ADVISORIES)[number]

export const CONTENT_ADVISORY_LABELS: Record<ContentAdvisory, string> = {
  death: 'death',
  serious_violence: 'serious violence',
  terrorism: 'terrorism',
  captivity: 'adult hostage-taking and captivity',
  organised_crime: 'organised crime',
  drug_harm: 'illegal drug manufacture and drug-related harm',
}

export interface OffenceProfile {
  charge: string
  elements: readonly [string, string, ...string[]]
  family:
    | 'fatal_violence'
    | 'national_security'
    | 'organised_crime'
    | 'drugs'
  advisories: readonly ContentAdvisory[]
}

/**
 * Canonical single-charge profiles for the Daily Docket's grave-crime slate.
 * Case facts belong in the evidence. Keeping the charge and elements canonical
 * prevents a dramatic premise from turning into an ambiguous compound trial.
 */
export const OFFENCE_PROFILES: Record<OffenceCode, OffenceProfile> = {
  murder: {
    charge: 'murder',
    elements: [
      'The accused caused the victim’s death.',
      'The accused intended to kill or cause really serious injury.',
      'The killing was not legally justified or excused.',
    ],
    family: 'fatal_violence',
    advisories: ['death', 'serious_violence'],
  },
  hostage_taking: {
    charge: 'hostage-taking',
    elements: [
      'The accused intentionally detained or helped to detain an adult against that person’s will.',
      'The accused intended to compel another person or an institution to act as a condition of the hostage’s release.',
      'The accused knew that the detention and demand were unlawful.',
    ],
    family: 'organised_crime',
    advisories: ['captivity', 'serious_violence'],
  },
  treason: {
    charge: 'treason by assisting a hostile foreign power',
    elements: [
      'An armed conflict existed between the fictional state and a hostile foreign power.',
      'The accused intentionally provided material assistance to that hostile power.',
      'The accused knew the assistance would prejudice the fictional state’s security or defence.',
    ],
    family: 'national_security',
    advisories: ['serious_violence'],
  },
  large_scale_drug_manufacturing: {
    charge: 'manufacturing a large commercial quantity of a controlled drug',
    elements: [
      'A large commercial quantity of a controlled drug was manufactured.',
      'The accused knowingly took part in manufacturing that drug.',
      'The accused intended the manufacturing activity to continue or succeed.',
    ],
    family: 'drugs',
    advisories: ['drug_harm'],
  },
  directing_organised_crime_syndicate: {
    charge: 'directing an organised crime syndicate',
    elements: [
      'A structured criminal syndicate existed and committed serious offences.',
      'The accused knowingly directed or controlled the syndicate’s criminal activities.',
      'The accused intended to advance those criminal activities.',
    ],
    family: 'organised_crime',
    advisories: ['organised_crime', 'serious_violence'],
  },
  terrorist_assassination_attempt: {
    charge: 'attempting a terrorist assassination of the head of government',
    elements: [
      'The accused intended to kill the fictional head of government.',
      'The accused took an act that went beyond mere preparation.',
      'The accused intended the attack to intimidate the public or coerce the fictional government for an ideological purpose.',
    ],
    family: 'national_security',
    advisories: ['terrorism', 'serious_violence'],
  },
  murder_police_officer_on_duty: {
    charge: 'murder of an on-duty police officer',
    elements: [
      'The accused caused the on-duty officer’s death.',
      'The accused intended to kill or cause really serious injury.',
      'The killing was not legally justified or excused.',
    ],
    family: 'fatal_violence',
    advisories: ['death', 'serious_violence'],
  },
}

export function contentAdvisoryText(
  advisories: readonly ContentAdvisory[] | undefined,
): string | null {
  if (!advisories || advisories.length === 0) return null
  return `Content advisory: ${advisories.map((item) => CONTENT_ADVISORY_LABELS[item]).join(', ')}.`
}
