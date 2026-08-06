import { existsSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const buildRoot = resolve(appRoot, '..', 'public', 'jury')
const viteIndex = join(buildRoot, 'index.html')
const rootShell = join(buildRoot, 'court-week.html')

if (!existsSync(viteIndex)) {
  throw new Error(`Vite did not produce the Court Week shell: ${viteIndex}`)
}

rmSync(rootShell, { force: true })
renameSync(viteIndex, rootShell)

if (existsSync(viteIndex) || !existsSync(rootShell)) {
  throw new Error('Court Week root shell finalization did not complete atomically')
}

console.log('Finalized the internal Court Week shell for the canonical root proxy.')
