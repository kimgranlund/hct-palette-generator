# Knowledge 05 — Figma Plugin (Cascade Binder)

> Topic: the companion Figma plugin that binds a `Color Modes` collection to existing raw
> variables by reference, providing the live cascade that JSON import cannot.

## Table of Contents
1. Why it exists
2. Files and manifest
3. What it does
4. Role-table parity
5. Run instructions and failure modes

---

## 1. Why it exists

Native Figma JSON import cannot make semantic variables **cascade** off raw edits: imported
semantic colors are either resolved (static) or aliased by fragile name/library-key matching.
The plugin instead aliases each semantic role to the *actual raw Variable object* via
`figma.variables.createVariableAlias`, which binds by reference. Editing a raw color then
propagates to every semantic role that aliases it — a true cascade.

> 💡 This is the only mechanism that gives raw→semantic cascade inside Figma. The exported
> Light/Dark JSON files are the static/portable artifact; the plugin is the live-binding
> artifact. They encode the *same* role table.

## 2. Files and manifest

```
figma-semantic-binder/
├── manifest.json   (api 1.0.0, documentAccess: dynamic-page, networkAccess: none)
└── code.js
```
No network access (offline, no data exfiltration). `documentAccess: dynamic-page` for async
variable APIs.

## 3. What it does

Constants: `RAW_COLLECTION = "Color Primitives"`, `SEMANTIC_COLLECTION = "Color Modes"`,
`PALETTES = [neutral, primary, secondary, tertiary, info, success, danger, warning]`.

Steps:
1. Find the raw collection by name; index its variables by name into `rawVars`.
2. Create or find the `Color Modes` collection; ensure it has `Light` and `Dark` modes.
3. For each palette and each role in `semanticRoles(n)`:
   - resolve `lt = rawVars["{n}/{refKey(r.light)}"]`, `dt = rawVars["{n}/{refKey(r.dark)}"]`
   - create/find the semantic variable `"{n}/{r.key}"`
   - `setValueForMode(lightId, createVariableAlias(lt))` and likewise for dark.
4. Report bound count and any missing raw targets.

On-colors and scrims follow the same fixed role table as the generator (on `050`/`200`,
scrims on the 500 ramp, `500-{step}`) — the plugin contains **no** contrast computation (that
logic was removed; see ADR-003).

## 4. Role-table parity

The plugin's `roleTable(n)` must equal the artifact's and `semantic.js`'s `semanticRoles(n)` exactly. Validate
every `{n}/{refKey}` target resolves against the real `Color Primitives` variable names (which use
3-digit padding and `500-{step}` scrim suffixes). See `rubrics/parity-checklist.md`.

## 5. Run instructions and failure modes

Run via Figma desktop → Plugins → Development → Import plugin from manifest → select
`manifest.json` → run.

Failure modes:
- **Raw collection not found** — the `Color Primitives` collection must exist with that exact name.
- **Missing raw target** — a role references a stop/scrim not present in the primitives; the
  plugin lists the first missing name. Check 3-digit padding and that scrim primitives
  (`{n}/500-{step}`) exist.
