import { gzipSync } from 'node:zlib'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

const outputRoot = join(process.cwd(), '..', 'public', 'jury')
const maximumCompressedJavascript = 350 * 1024

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  }))).flat()
}

const output = await stat(outputRoot).catch(() => null)
if (!output?.isDirectory()) {
  throw new Error('Build output is absent. Run `npm run build` before the performance gate.')
}

const javascript = (await filesBelow(outputRoot)).filter((path) => path.endsWith('.js'))
const measured = await Promise.all(javascript.map(async (path) => ({
  path: relative(outputRoot, path).replace(/\\/gu, '/'),
  gzipBytes: gzipSync(await readFile(path), { level: 9 }).byteLength,
})))
const total = measured.reduce((sum, asset) => sum + asset.gzipBytes, 0)

if (total > maximumCompressedJavascript) {
  throw new Error(`Compressed JavaScript is ${total} bytes; budget is ${maximumCompressedJavascript}.`)
}

console.log(JSON.stringify({
  budget: { compressedJavascriptBytes: maximumCompressedJavascript },
  measured: { compressedJavascriptBytes: total, assets: measured },
}, null, 2))
