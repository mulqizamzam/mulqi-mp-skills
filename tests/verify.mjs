/**
 * Frontmatter contract verifier.
 *
 * Runs the provider's own parseSkill() over every bundled SKILL.md and asserts
 * each yields a valid kebab-case name and a non-empty description. It also
 * reports which files required the lenient (non-strict-YAML) fallback, so a
 * stylistic frontmatter quirk is documented rather than silently dropped.
 * Exits non-zero on any gap.
 */
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(here, '..')
const { findSkillFiles, parseSkill, parseFrontmatter } = await import(resolve(pluginRoot, 'index.js'))
const SKILLS_ROOT = resolve(pluginRoot, 'vendor/skills')
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const files = await findSkillFiles(SKILLS_ROOT)
let failures = 0
let lenient = 0

for (const file of files) {
  const raw = await readFile(file, 'utf8')
  const fallback = file.split(/[\\/]/).slice(-2, -1)[0]
  const parsed = parseSkill(raw, fallback)
  const { yaml } = parseFrontmatter(raw)
  if (yaml === null) lenient += 1
  const problems = []
  if (parsed.description === undefined) problems.push('missing description')
  if (parsed.name === undefined) problems.push('missing name')
  else if (!SKILL_NAME.test(parsed.name)) problems.push(`invalid kebab-case name "${parsed.name}"`)
  if (parsed.content.trim() === '') problems.push('empty body')
  const rel = file.replace(SKILLS_ROOT + '/', '')
  if (problems.length > 0) {
    failures += 1
    console.log(`FAIL ${rel}: ${problems.join(', ')}`)
  }
}

console.log(`\nChecked ${files.length} SKILL.md files through the provider parser.`)
console.log(`Files requiring the lenient (non-strict-YAML) fallback: ${lenient}`)
if (failures > 0) {
  console.log(`${failures} file(s) failed the contract.`)
  process.exitCode = 1
} else {
  console.log('All SKILL.md files yield a valid name and description. OK')
}
