import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'

const source = readFileSync(join(import.meta.dirname, '..', 'public', 'clarity.js'), 'utf8')

function runLoader(initialOptOut = false) {
  const values = new Map(initialOptOut ? [['simjury:clarity-opt-out:v1', '1']] : [])
  const appended = []
  const domListeners = new Map()
  const control = () => ({ hidden: false, addEventListener(name, listener) { this[name] = listener } })
  const status = { textContent: '' }
  const optOut = control()
  const optIn = control()
  const document = {
    head: { appendChild: (node) => appended.push(node) },
    createElement: () => ({}),
    addEventListener: (name, listener) => domListeners.set(name, listener),
    querySelectorAll: (selector) => ({
      '[data-clarity-status]': [status],
      '[data-clarity-opt-out]': [optOut],
      '[data-clarity-opt-in]': [optIn],
    }[selector] ?? []),
  }
  const window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  }
  vm.runInNewContext(source, { document, navigator: { webdriver: false }, window })
  domListeners.get('DOMContentLoaded')()
  return { appended, optIn, optOut, status, values, window }
}

test('loads masked analytics by default with advertising storage denied', () => {
  const result = runLoader()
  assert.equal(result.appended[0].src, 'https://www.clarity.ms/tag/xy3peca8h4')
  const grant = result.window.clarity.q[0]
  assert.equal(grant[0], 'consentv2')
  assert.equal(grant[1].ad_Storage, 'denied')
  assert.equal(grant[1].analytics_Storage, 'granted')
  assert.match(result.status.textContent, /enabled/)
})

test('persists opt-out, revokes consent, and does not load on the next page', () => {
  const result = runLoader()
  result.optOut.click()
  assert.equal(result.values.get('simjury:clarity-opt-out:v1'), '1')
  assert.equal(result.window.clarity.q.at(-1)[0], 'consent')
  assert.equal(result.window.clarity.q.at(-1)[1], false)
  assert.match(result.status.textContent, /disabled/)

  const nextPage = runLoader(true)
  assert.equal(nextPage.appended.length, 0)
  nextPage.optIn.click()
  assert.equal(nextPage.appended.length, 1)
  assert.equal(nextPage.values.has('simjury:clarity-opt-out:v1'), false)
})
