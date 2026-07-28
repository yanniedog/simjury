import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(siteRoot, 'public', 'ready.js'), 'utf8')
const KEY = 'simjury:fiction-disclosure:v2'

function harness({ seen = false, storageThrows = false } = {}) {
  const classes = new Set()
  const listeners = new Map()
  const stored = new Map(seen ? [[KEY, '1']] : [])
  const calls = { close: 0, focus: 0, modal: 0 }
  let open = true

  const disclosure = {
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    close() {
      calls.close++
      open = false
    },
    removeAttribute(name) {
      if (name === 'open') open = false
    },
    showModal() {
      calls.modal++
      open = true
    },
  }
  const accept = {
    addEventListener(type, listener) {
      listeners.set(`accept:${type}`, listener)
    },
    focus() {
      calls.focus++
    },
  }
  const localStorage = {
    getItem(key) {
      if (storageThrows) throw new Error('storage blocked')
      return stored.get(key) ?? null
    },
    setItem(key, value) {
      if (storageThrows) throw new Error('storage blocked')
      stored.set(key, value)
    },
  }
  const document = {
    documentElement: {
      classList: {
        add(value) { classes.add(value) },
        remove(value) { classes.delete(value) },
      },
    },
    getElementById(id) {
      if (id === 'fiction-disclosure') return disclosure
      if (id === 'fiction-disclosure-accept') return accept
      return null
    },
  }

  runInNewContext(source, { document, window: { localStorage } })
  return { calls, classes, listeners, open: () => open, stored }
}

test('a prior root acknowledgement suppresses the duplicate gate', () => {
  const state = harness({ seen: true })

  assert.equal(state.calls.close, 1)
  assert.equal(state.calls.modal, 0)
  assert.equal(state.calls.focus, 0)
  assert.equal(state.classes.has('entry-gate-open'), false)
})

test('a first visit opens the modal, focuses its action, and persists acceptance', () => {
  const state = harness()

  assert.equal(state.calls.modal, 1)
  assert.equal(state.calls.focus, 1)
  assert.equal(state.classes.has('entry-gate-open'), true)

  let prevented = false
  state.listeners.get('cancel')({ preventDefault: () => { prevented = true } })
  assert.equal(prevented, true)

  state.listeners.get('accept:click')()
  assert.equal(state.stored.get(KEY), '1')
  assert.equal(state.open(), false)
  assert.equal(state.classes.has('entry-gate-open'), false)
})

test('blocked storage fails safely: the gate still opens and can close for this load', () => {
  const state = harness({ storageThrows: true })

  assert.equal(state.calls.modal, 1)
  assert.equal(state.calls.focus, 1)
  assert.doesNotThrow(() => state.listeners.get('accept:click')())
  assert.equal(state.open(), false)
})
