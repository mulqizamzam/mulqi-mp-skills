import test from 'node:test'
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(here, '..')
const plugin = await import(resolve(pluginRoot, 'index.js'))

/** Register the provider into a stub ctx and capture the provider + disposer. */
function registerProvider() {
  let provider
  const ctx = {
    skills: {
      registerProvider(create) {
        provider = create({ signal: new AbortController().signal, invalidate() {} })
        return () => {}
      },
    },
  }
  const disposer = plugin.apply(ctx)
  return { provider, disposer }
}

test('module identity matches the mount contract', () => {
  assert.equal(plugin.name, 'mulqi-mp-skills')
  assert.deepEqual(plugin.inject, ['skills'])
  assert.equal(typeof plugin.apply, 'function')
})

test('apply() registers a provider and returns a disposer', () => {
  const { provider, disposer } = registerProvider()
  assert.equal(typeof disposer, 'function')
  assert.equal(provider.name, 'mulqi-mp-skills')
  assert.equal(typeof provider.list, 'function')
  assert.equal(typeof provider.get, 'function')
})

test('list() exposes every bundled SKILL.md with a valid candidate shape', async () => {
  const { provider } = registerProvider()
  const candidates = await provider.list()
  assert.equal(candidates.length, 39, `expected 39 skills, got ${candidates.length}`)

  const names = candidates.map((c) => c.name)
  assert.equal(new Set(names).size, names.length, 'duplicate skill names detected')

  for (const c of candidates) {
    assert.ok(typeof c.name === 'string' && c.name.length > 0, 'name missing')
    assert.ok(typeof c.description === 'string' && c.description.length > 0, 'description missing')
    assert.equal(c.source, 'bundled')
    assert.equal(c.provider, 'mulqi-mp-skills')
    assert.equal(c.rank, 600)
    assert.equal(c.resourceBase?.kind, 'directory')
    assert.equal(typeof c.path, 'string')
    assert.equal(typeof c.locator?.path, 'string')
    assert.equal(typeof c.invocation?.modelInvocable, 'boolean')
    assert.equal(typeof c.invocation?.userInvocable, 'boolean')
  }
})

test('list() is memoized and consistent across calls', async () => {
  const { provider } = registerProvider()
  const first = await provider.list()
  const second = await provider.list()
  assert.equal(first, second, 'list() should return the frozen cache on repeat calls')
})

test('disable-model-invocation frontmatter is honored', async () => {
  const { provider } = registerProvider()
  const candidates = await provider.list()
  const askMatt = candidates.find((c) => c.name === 'ask-matt')
  assert.equal(askMatt.invocation.modelInvocable, false, 'ask-matt must be user-invocable only')
  assert.equal(askMatt.invocation.userInvocable, true)
  const tdd = candidates.find((c) => c.name === 'tdd')
  assert.equal(tdd.invocation.modelInvocable, true, 'tdd has no disable-model-invocation')
})

test('get() returns a body that re-parses to the same candidate identity', async () => {
  const { provider } = registerProvider()
  const candidates = await provider.list()
  const tdd = candidates.find((c) => c.name === 'tdd')
  const definition = await provider.get(tdd)
  assert.equal(definition.name, 'tdd')
  assert.equal(definition.description, tdd.description)
  assert.equal(definition.provider, 'mulqi-mp-skills')
  assert.equal(definition.source, 'bundled')
  assert.ok(typeof definition.content === 'string' && definition.content.length > 0)
  assert.ok(definition.content.startsWith('# '), 'body is the markdown after frontmatter')
  assert.equal(definition.resourceBase?.kind, 'directory')
  // The on-disk file must start with frontmatter; the body must be a suffix of it.
  const raw = await readFile(tdd.path, 'utf8')
  assert.ok(raw.includes(definition.content), 'content is a verbatim suffix of the SKILL.md file')
})

test('a non-strict-YAML frontmatter (colon in value) still exposes the skill', async () => {
  const { provider } = registerProvider()
  const candidates = await provider.list()
  const sf = candidates.find((c) => c.name === 'software-factory')
  assert.ok(sf, 'software-factory must be exposed despite its invalid-strict-YAML description')
  assert.ok(sf.description.includes('software factory'), 'description preserved')
  assert.equal(sf.invocation.modelInvocable, false, 'disable-model-invocation honored')
  assert.equal(sf.invocation.userInvocable, true)
  const definition = await provider.get(sf)
  assert.ok(definition.content.length > 0, 'body loaded for the lenient case')
})

test('nested metadata frontmatter passes through structured', async () => {
  const { provider } = registerProvider()
  const candidates = await provider.list()
  const pr = candidates.find((c) => c.name === 'pr')
  assert.ok(pr, 'pr skill exposed')
  const definition = await provider.get(pr)
  assert.equal(definition.metadata?.credits?.skill, 'show-me', 'nested metadata preserved')
})

test('argument-hint is passed through', async () => {
  const { provider } = registerProvider()
  const candidates = await provider.list()
  const handoff = candidates.find((c) => c.name === 'handoff')
  assert.ok(handoff, 'handoff skill exposed')
  const definition = await provider.get(handoff)
  assert.equal(definition.metadata?.['argument-hint'], 'What will the next session be used for?')
})

test('get() on a vanished candidate returns undefined', async () => {
  const { provider } = registerProvider()
  const definition = await provider.get({
    name: 'does-not-exist',
    description: 'x',
    source: 'bundled',
    provider: 'mulqi-mp-skills',
    locator: { path: resolve(pluginRoot, 'vendor/skills/does-not-exist/SKILL.md') },
  })
  assert.equal(definition, undefined)
})
