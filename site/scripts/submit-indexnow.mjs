import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const keyFile = 'indexnow-key.txt'
const key = (await readFile(join(siteRoot, 'public', keyFile), 'utf8')).trim()

if (!/^[a-f0-9]{8,128}$/i.test(key)) {
  throw new Error('IndexNow key must be 8-128 hexadecimal characters')
}

const payload = {
  host: 'simjury.com',
  key,
  keyLocation: `https://simjury.com/${keyFile}`,
  urlList: [
    'https://simjury.com/',
    'https://simjury.com/today/',
    'https://simjury.com/privacy/',
    'https://simjury.com/llms.txt',
    'https://simjury.com/llms-full.txt',
  ],
}

const endpoint = 'https://api.indexnow.org/indexnow'
let lastFailure = 'unknown failure'

for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    })

    if (response.ok) {
      console.log(`IndexNow accepted ${payload.urlList.length} SimJury URLs (${response.status}).`)
      process.exit(0)
    }

    const responseBody = (await response.text()).trim().slice(0, 200)
    lastFailure = `HTTP ${response.status}${responseBody ? `: ${responseBody}` : ''}`
    if (response.status < 500 && response.status !== 429) break
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : String(error)
  }

  if (attempt < 3) await delay(2 ** attempt * 1000)
}

throw new Error(`IndexNow submission failed after retries: ${lastFailure}`)
