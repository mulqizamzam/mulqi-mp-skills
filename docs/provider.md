# Provider Contract

`index.js` is a Cordis plugin module. This page documents exactly what it
exports and how the provider interacts with the host skill registry.

## Module exports

| Export | Kind | Purpose |
| --- | --- | --- |
| `name` | `string` | Cordis plugin identity: `mulqi-mp-skills`. Must match the `id` in `cordis.patch.yml` and the `name` in `package.json`. |
| `inject` | `string[]` | Host services required: `['skills']`. The runtime injects the skill registry into `ctx`. |
| `apply(ctx)` | `function` | The lifecycle entry. Calls `ctx.skills.registerProvider(create)` and returns the disposer that unregisters the provider on teardown. |

`apply(ctx)` is synchronous. All filesystem I/O happens lazily inside the
provider's async `list()` and `get()`, so registration never blocks on disk.

## Provider

The provider object registered with the host has the shape the skill registry
expects:

```js
{
  name: 'mulqi-mp-skills',
  list(options)  // -> Promise<readonly SkillCandidate[]>
  get(candidate, options) // -> Promise<SkillDefinition | undefined>
}
```

### `list()`

- Recursively walks `vendor/skills/` for every `SKILL.md`.
- Parses each file's YAML frontmatter.
- Emits one candidate per file that has a non-empty `description`.
- Candidates are sorted by name and the result is frozen (memoized), so repeat
  discovery calls return the same array.

Each candidate carries:

| Field | Value |
| --- | --- |
| `name` | frontmatter `name` (kebab-case); falls back to the skill directory name if absent |
| `description` | frontmatter `description` |
| `rank` | `600` (the bundled-skill rank) |
| `source` | `'bundled'` |
| `provider` | `'mulqi-mp-skills'` |
| `path` | absolute path to the `SKILL.md` |
| `resourceBase` | `{ kind: 'directory', path: <skill dir> }` |
| `locator` | `{ path, directory }` — the opaque handle `get()` uses |
| `invocation` | `{ modelInvocable, userInvocable }` derived from frontmatter |
| `whenToUse` | optional, from `when-to-use` / `whenToUse` frontmatter |

### `get(candidate)`

- Reloads `candidate.locator.path`.
- Returns `undefined` if the file is no longer present (vanished candidate).
- Returns a `SkillDefinition` with `content` set to the markdown body after the
  frontmatter, plus passthrough of any extra frontmatter fields (other than the
  consumed ones) under `metadata`.

## Frontmatter fields read

| Field | Effect |
| --- | --- |
| `name` | Skill identity. Required in practice; falls back to directory name. |
| `description` | **Required** — a skill without one is not exposed. |
| `disable-model-invocation` | When `true`, `modelInvocable` is `false` (user-invoked only). |
| `user-invocable` | When `false`, `userInvocable` is `false`. Defaults to `true`. |
| `when-to-use` / `whenToUse` | Surfaced as `whenToUse`. |
| `argument-hint`, `metadata`, any other key | Passed through under `metadata`. |

## Isolation guarantees

- The provider is read-only: it never writes to `vendor/`.
- It opens no network connections and no ports.
- It mutates no model output and injects no prompts; it only contributes skill
  catalog entries.
- Registration is scoped to the calling context's layer; teardown unregisters
  exactly the provider it registered.
