# Mulqi MP Skills

A native **DeepSeek Harness** plugin that exposes a curated collection of 39
reusable agent skills — for real engineering work and day-to-day productivity —
as a read-only bundled skill provider.

The plugin registers a single provider with the host skill registry. Every
skill ships verbatim under `vendor/skills/`; the provider discovers them at
run time, so the on-disk collection is the single source of truth. No skill
content is embedded in code, so a change to any `SKILL.md` is picked up without
rebuilding the module.

## What you get

- **39 skills** across four categories: engineering (20), productivity (7),
  misc (4), and in-progress (8).
- **Native discovery** — skills appear in the host skill catalog and can be
  invoked by the model (or by a human, for user-invoked skills).
- **Verbatim content** — each skill's instruction body and its sibling
  reference files (`references/`, `scripts/`, glossaries, ADRs) are preserved
  exactly. Relative paths in a skill resolve against that skill's own
  directory.
- **Zero host surface changes** — the plugin only mounts one Cordis plugin row
  and registers one provider. It opens no ports, mutates no model output, and
  sends no telemetry.

## Requirements

| Requirement | Value |
| --- | --- |
| DeepSeek Harness | `0.2.1-rc.2` (exact) |
| Node.js | `^22.19.0 \|\| >=24.0.0` |
| Host skill service | `@deepseek-ai/dsh-skill` (provided by the base bundle) |

The plugin pins `engines.dsh` to `0.2.1-rc.2`. Running a different Harness
version will be refused at install/activation unless an exact-version
exemption is granted.

## Installation

Install the bundle into a profile and restart that profile:

```bash
dsh plugin --profile <profile> add /path/to/mulqi-mp-skills
```

`dsh plugin add` resolves the `dsh.bundle.patch` declared in `package.json`
(`./cordis.patch.yml`), which inserts one mount row. The row loads this module;
its `apply(ctx)` registers the provider.

Verify the mount without booting:

```bash
dsh --profile <profile> --dump-config | grep mulqi-mp-skills
```

A mounted row (no `skipping profile bundle` line) confirms the engine pin is
satisfied and the bundle is wired in.

## Usage

After installation the 39 skills are available through the normal skill
catalog. A model-invocable skill can be triggered from a task; a user-invoked
skill (marked in the catalog) is invoked explicitly.

Skills are grouped by intent, so most tasks route through a small entry set:

| I want to… | Start with |
| --- | --- |
| Find the right skill or flow for a situation | `ask-matt` (user) / `grill-with-docs` |
| Turn a conversation into a spec, then tickets, then code | `to-spec` → `to-tickets` → `implement-spec` |
| Build test-first | `tdd` |
| Design or deepen a module's interface | `codebase-design` / `domain-modeling` |
| Debug a hard bug or regression | `diagnosing-bugs` |
| Review a branch or PR | `code-review` / `pr` |
| Plan a large body of work | `wayfinder` |
| Retrospect or hand off | `retro` / `handoff` |

The full, verbatim catalog — every skill with its exact description and
invocation mode — is in [docs/skills-catalog.md](docs/skills-catalog.md).

## How the provider works

- `index.js` exports a Cordis plugin: `name`, `inject: ['skills']`, and
  `apply(ctx)`.
- `apply(ctx)` calls `ctx.skills.registerProvider(...)` with a read-only
  provider whose `list()` walks `vendor/skills/**/SKILL.md` and whose `get()`
  loads one skill's body on demand.
- Each candidate carries `resourceBase = { kind: 'directory', path: <skill
  dir> }`, so a skill's references to sibling files resolve against its own
  folder. `disable-model-invocation` frontmatter is honored, making a skill
  user-invoked only.
- The provider is registered into the calling context's layer; on teardown the
  returned disposer unregisters it.

See [docs/provider.md](docs/provider.md) for the contract details and the
frontmatter fields the provider reads.

## Configuration

There is no configuration surface. Behavior is driven entirely by the skill
files under `vendor/skills/`. To add or change a skill, edit or add a
`SKILL.md` there (valid kebab-case `name` + a `description` are required) and
restart the profile.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `Plugin mulqi-mp-skills@0.1.0 is incompatible with dsh <ver>` | The running Harness is not `0.2.1-rc.2`. Use that version, or grant an exact-version exemption. |
| Skills absent from the catalog | Confirm the mount row is present (`--dump-config \| grep mulqi-mp-skills`) and that `vendor/skills/` is intact. |
| `engines.dsh` refusal after a Harness bump | The exact pin is intentional. Grant an exemption only for the exact plugin and runtime versions you accept the risk on. |

## Verification

- `node --check index.js` — module syntax.
- `npm test` — provider assertions (discovery, shape, invocation flags, load
  round-trip, vanished-candidate handling).
- `node tests/verify.mjs` — re-parses every `SKILL.md` frontmatter through the
  same YAML parser the host uses.

## License

MIT. The bundled skill content is © 2026 Matt Pocock under the MIT License;
see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md). The provider code in
`index.js` and the manifest/mount files are released under the same license.
