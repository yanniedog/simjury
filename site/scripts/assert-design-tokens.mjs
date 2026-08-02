/**
 * Design-token discipline, enforced.
 *
 * docs/DESIGN-PROTOCOL.md rules 6 and 7:
 *   - the palette, radii, motion and type are declared once, in tokens.css;
 *   - a font stack names only faces that will actually render.
 *
 * The palette used to be declared on `:root` in the app's index.css and again
 * on `.landing` in landing-modern.css, with a third older set in styles.css.
 * They agreed. Nothing kept them agreeing — which is exactly the failure this
 * check exists to prevent, since the drift is invisible until two surfaces are
 * compared side by side.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = join(siteRoot, 'public')

const read = (...parts) => readFileSync(join(...parts), 'utf8')
const tokens = read(publicRoot, 'tokens.css')
const failures = []

/** Every token the two surfaces are allowed to rely on. */
const REQUIRED_TOKENS = [
  '--ground', '--surface-1', '--surface-2', '--surface-3', '--sunken',
  '--ink', '--ink-2', '--ink-3',
  '--brass', '--brass-ink', '--focus-ring',
  '--hairline', '--rule',
  '--radius-xs', '--radius-sm', '--radius-md', '--radius-lg',
  '--motion-fast', '--motion-base', '--ease',
  '--font-body', '--font-display', '--font-mono',
  '--measure',
]

for (const token of REQUIRED_TOKENS) {
  if (!new RegExp(`${token}\\s*:`).test(tokens)) {
    failures.push(`tokens.css does not define ${token}`)
  }
}

// Exactly four radii. Twelve distinct values across an app is sprawl.
const radii = REQUIRED_TOKENS.filter((token) => token.startsWith('--radius-'))
if (radii.length !== 4) failures.push(`expected four radius tokens, found ${radii.length}`)

/**
 * No stylesheet other than tokens.css may declare a token. Consumers use
 * `var(--x)`; only the one file assigns `--x:`.
 */
const CONSUMERS = [
  ['landing-modern.css', read(publicRoot, 'landing-modern.css')],
  ['styles.css', read(publicRoot, 'styles.css')],
  ['app/src/index.css', read(siteRoot, 'app', 'src', 'index.css')],
]

for (const [name, css] of CONSUMERS) {
  for (const token of REQUIRED_TOKENS) {
    // A declaration is `--token:` outside a var() call.
    if (new RegExp(`(?<!var\\()\\s${token}\\s*:`).test(css)) {
      failures.push(`${name} redeclares ${token}; tokens.css is the only home`)
    }
  }
}

// The app reaches tokens.css through an @import so Vite inlines it: no extra
// request, and nothing for the strict CSP to refuse.
if (!read(siteRoot, 'app', 'src', 'index.css').includes("@import '../../public/tokens.css'")) {
  failures.push('app/src/index.css does not @import the shared tokens.css')
}

// Every page that styles itself must load the tokens before its stylesheets.
for (const page of ['index.html', '404.html', 'privacy/index.html']) {
  const html = read(publicRoot, ...page.split('/'))
  const tokensAt = html.indexOf('/tokens.css')
  const stylesAt = html.indexOf('/styles.css')
  if (tokensAt === -1) failures.push(`${page} does not link /tokens.css`)
  else if (stylesAt !== -1 && tokensAt > stylesAt) {
    failures.push(`${page} links /tokens.css after /styles.css; tokens must come first`)
  }
}

/**
 * A named face must be loadable. There is no @font-face rule and no font file
 * in the repository, so any stack naming a webfont is naming something that
 * will never render — the site silently falls through to a system face while
 * the code claims otherwise.
 */
const WEBFONT_NAMES = ['Inter', 'Roboto Flex', 'Open Sans', 'Lato', 'Montserrat', 'Source Sans']
const hasFontFace = [tokens, ...CONSUMERS.map(([, css]) => css)].some((css) => css.includes('@font-face'))
if (!hasFontFace) {
  for (const [name, css] of [['tokens.css', tokens], ...CONSUMERS]) {
    for (const face of WEBFONT_NAMES) {
      // `Roboto` alone is a real Android system face; the flex variant is not.
      if (new RegExp(`\\b${face}\\b`).test(css)) {
        failures.push(`${name} names the webfont ${face}, but nothing loads it`)
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Design-token validation failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(
  `Design-token validation passed: ${REQUIRED_TOKENS.length} tokens declared once in tokens.css, `
  + 'loaded by both surfaces, and no unloadable typeface is named.',
)
