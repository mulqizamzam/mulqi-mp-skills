/**
 * Mulqi MP Skills — native DeepSeek Harness skill provider.
 *
 * This module is a Cordis plugin entry. On `apply(ctx)` it registers a single
 * read-only skill provider with the `ctx.skills` registry. The provider serves
 * every bundled `SKILL.md` shipped under `vendor/skills/` (a verbatim copy of
 * the upstream collection). Bodies are read lazily at discovery/load time and
 * relative resource references resolve against each skill's own directory.
 *
 * Frontmatter parsing is intentionally tolerant: it first tries a strict YAML
 * parse (so nested/structured fields such as a `metadata` map survive), and
 * when the block is not strict YAML — e.g. an unquoted `description` value that
 * contains a `: ` sequence — it falls back to top-level line extraction so a
 * skill is never dropped for a stylistic frontmatter quirk.
 *
 * The module is dependency-light: Node built-ins plus the `yaml` parser. Host
 * services are injected via `ctx`; nothing here mutates model output or opens
 * ports.
 */

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

/** Cordis plugin identity (must match the cordis.patch.yml insert id and package name). */
export const name = 'mulqi-mp-skills'

/** Host services this plugin requires. */
export const inject = ['skills']

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)))
const SKILLS_ROOT = resolve(PACKAGE_ROOT, 'vendor', 'skills')
const PROVIDER_NAME = 'mulqi-mp-skills'
/** Standard precedence rank for packaged (bundled) skill providers. */
const BUNDLED_SKILL_RANK = 600

/** Recursively collect every `SKILL.md` path under a root directory. */
async function findSkillFiles(root) {
  const results = []
  async function walk(dir) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile() && entry.name === 'SKILL.md') results.push(full)
    }
  }
  await walk(root)
  return results
}

/**
 * Split a SKILL.md into frontmatter text, a best-effort parsed object, and
 * the body. `yaml` is null when the block is not strict YAML.
 * @returns {{ yaml: object|null, yamlText: string, body: string }}
 */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/)
  if (!match) return { yaml: null, yamlText: '', body: raw }
  const yamlText = match[1]
  let parsed
  try {
    parsed = parseYaml(yamlText)
  } catch {
    parsed = null
  }
  const yaml =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : null
  const body = raw.slice(match[0].length)
  return { yaml, yamlText, body }
}

/**
 * Extract top-level `key: value` scalars from a frontmatter block. Values may
 * contain `: ` (they are taken verbatim to end-of-line), which is exactly the
 * case strict YAML rejects. Only lines with no leading indentation are read,
 * so nested map keys are not captured here (those come from `yaml` when valid).
 * @returns {Record<string, string>}
 */
function topLevelFields(yamlText) {
  const fields = {}
  for (const line of yamlText.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):[ \t]?(.*)$/)
    if (m) fields[m[1]] = m[2].trim()
  }
  return fields
}

/** Strip one layer of matching surrounding quotes from a scalar value. */
function unquote(value) {
  if (typeof value !== 'string') return undefined
  const s = value.trim()
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    return s.slice(1, -1)
  }
  return s
}

function toBoolToken(value) {
  if (value === true) return 'true'
  if (value === false) return 'false'
  if (typeof value === 'string') return value.trim().toLowerCase()
  return undefined
}

/**
 * Parse one SKILL.md into the fields the provider exposes.
 * @returns {object} name, description, whenToUse, invocation, content, metadata, usedYaml
 */
function parseSkill(raw, fallbackName) {
  const { yaml, yamlText, body } = parseFrontmatter(raw)
  const line = topLevelFields(yamlText)

  const nameFromLine = unquote(line.name)
  const nameFromYaml = yaml && typeof yaml.name === 'string' ? yaml.name : undefined
  const skillName = nameFromLine || nameFromYaml || fallbackName

  const descFromLine = unquote(line.description)
  const descFromYaml = yaml && typeof yaml.description === 'string' ? yaml.description : undefined
  const description = descFromLine || descFromYaml

  const disableModel = toBoolToken(line['disable-model-invocation'] ?? yaml?.['disable-model-invocation'])
  const modelInvocable = disableModel !== 'true'
  const userInvocableToken = toBoolToken(line['user-invocable'] ?? yaml?.['user-invocable'])
  const userInvocable = userInvocableToken !== 'false'

  const whenToUse =
    unquote(line['when-to-use']) ??
    unquote(line['whenToUse']) ??
    (yaml && typeof yaml['when-to-use'] === 'string' ? yaml['when-to-use'] : undefined) ??
    (yaml && typeof yaml.whenToUse === 'string' ? yaml.whenToUse : undefined)

  const content = body.trim()

  // Passthrough metadata, mirroring the host's optionalMetadata(): take the
  // frontmatter `metadata` object (when present), then merge any unrecognized
  // top-level keys so nothing is dropped (zero-loss).
  const recognized = new Set([
    'name',
    'description',
    'when-to-use',
    'whenToUse',
    'user-invocable',
    'disable-model-invocation',
    'metadata',
  ])
  let base
  if (yaml && typeof yaml.metadata === 'object' && yaml.metadata !== null && !Array.isArray(yaml.metadata)) {
    base = { ...yaml.metadata }
  } else {
    base = {}
  }
  const extraSource = yaml ?? line
  for (const [key, value] of Object.entries(extraSource)) {
    if (recognized.has(key)) continue
    base[key] = value
  }
  const metadata = Object.keys(base).length > 0 ? base : undefined

  return {
    name: skillName,
    description,
    whenToUse,
    invocation: { modelInvocable, userInvocable },
    content,
    metadata,
  }
}

/** Build one provider candidate from a SKILL.md file. */
async function buildCandidate(file) {
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return undefined
  }
  const directory = dirname(file)
  const fallbackName = file.split(/[\\/]/).slice(-2, -1)[0]
  const parsed = parseSkill(raw, fallbackName)
  if (parsed.description === undefined) return undefined // a description is required.
  return {
    name: parsed.name,
    description: parsed.description,
    rank: BUNDLED_SKILL_RANK,
    source: 'bundled',
    provider: PROVIDER_NAME,
    path: file,
    resourceBase: { kind: 'directory', path: directory },
    locator: { path: file, directory },
    invocation: parsed.invocation,
    ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
  }
}

/**
 * The read-only bundled-skill provider. Candidates are discovered and cached
 * on the first `list()` call; `get()` reloads the exact candidate file.
 */
const provider = {
  name: PROVIDER_NAME,
  _cache: undefined,
  async list() {
    if (this._cache === undefined) {
      const files = await findSkillFiles(SKILLS_ROOT)
      const found = []
      for (const file of files) {
        const candidate = await buildCandidate(file)
        if (candidate !== undefined) found.push(candidate)
      }
      found.sort((a, b) => a.name.localeCompare(b.name))
      this._cache = Object.freeze(found)
    }
    return this._cache
  },
  async get(candidate) {
    const locator = candidate.locator
    if (locator === undefined) return undefined
    let raw
    try {
      raw = await readFile(locator.path, 'utf8')
    } catch {
      return undefined // the file disappeared since discovery.
    }
    const fallbackName = locator.path.split(/[\\/]/).slice(-2, -1)[0]
    const parsed = parseSkill(raw, fallbackName)
    const definition = {
      name: candidate.name ?? parsed.name,
      description: candidate.description ?? parsed.description,
      source: candidate.source,
      provider: candidate.provider,
      path: locator.path,
      resourceBase: candidate.resourceBase,
      invocation: candidate.invocation ?? parsed.invocation,
      content: parsed.content,
    }
    if (candidate.whenToUse !== undefined) definition.whenToUse = candidate.whenToUse
    else if (parsed.whenToUse !== undefined) definition.whenToUse = parsed.whenToUse
    if (parsed.metadata !== undefined) definition.metadata = parsed.metadata
    return definition
  },
}

/**
 * Register the bundled skill provider into the host's `ctx.skills` registry.
 * @param {object} ctx - the injected Cordis context.
 * @returns the disposer that unregisters the provider on teardown.
 */
export function apply(ctx) {
  return ctx.skills.registerProvider(() => provider)
}

export { SKILLS_ROOT, findSkillFiles, parseFrontmatter, parseSkill }
export default { name, inject, apply }
